"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { SLUG_MESSAGES, normalizeUrl, validateSlug } from "@/lib/links";
import { defaultBlockData, type BlockType } from "@/lib/links/blocks";
import { DEFAULT_THEME_KEY, themeByKey } from "@/lib/links/themes";
import { getLinkFeedItems } from "@/lib/data/live";

/*
  프로필 링크 편집 — 블록 빌더(2026-08-17 재작성).

  ─────────────────────────────────────────────────────────────────
  draft / 라이브 반영 분리 (링크팜의 "라이브 반영" 버튼)
  ─────────────────────────────────────────────────────────────────
  link_blocks 는 **초안**이다. 공개 페이지는 link_pages.published_snapshot 만 읽는다.
  publishLinkPage() 가 초안을 스냅샷으로 굽는다. 이유 둘:
   · 편집 중인 반쪽 상태가 방문자에게 보이면 안 된다
   · 공개 경로가 조인 없는 단일 행 조회가 된다(SNS 유입이 몰리는 경로다)

  전부 own-row RLS 위에서 돈다. user_id 를 다시 거는 건 방어가 아니라 인덱스 때문이다.
*/

type Result = { ok: boolean; error?: string };

const DEMO: Result = { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
const AUTH: Result = { ok: false, error: "로그인이 필요해요." };

/** 내 페이지 id·slug — 거의 모든 액션이 먼저 필요로 한다 */
async function myPage(): Promise<{ id: string; slug: string } | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("link_pages")
    .select("id, slug")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as { id: string; slug: string } | null) ?? null;
}

/* ══════════════════════════════════════════════════════════════════
   페이지
   ══════════════════════════════════════════════════════════════════ */

export async function createLinkPage(slug: string, title: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const clean = slug.trim().toLowerCase();
  const err = validateSlug(clean);
  if (err) return { ok: false, error: SLUG_MESSAGES[err] };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("link_pages")
    .insert({ user_id: user.id, slug: clean, title: title.trim().slice(0, 40), theme: DEFAULT_THEME_KEY })
    .select("id")
    .maybeSingle();
  if (error) {
    /* unique 위반 두 가지를 갈라서 말한다 — 사용자에게 의미가 완전히 다르다 */
    if (error.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("user_id")
          ? "이미 프로필 링크가 있어요. 새로고침해 주세요."
          : "이미 사용 중인 주소예요. 다른 주소를 입력해 주세요.",
      };
    }
    console.error("[links] 페이지 생성 실패:", error.message);
    return { ok: false, error: "만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  /* 빈 캔버스로 시작하면 뭘 해야 할지 모른다 — 첫 링크 하나를 깔아준다 */
  if (created?.id) {
    await supabase.from("link_blocks").insert({
      page_id: created.id,
      type: "link",
      data: defaultBlockData("link"),
      sort_order: 0,
    });
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function updateLinkProfile(input: {
  slug: string;
  title: string;
  bio: string;
  layout: string;
  align: string;
  snsLinks: Array<{ kind: string; url: string }>;
  seoTitle: string;
  seoDesc: string;
}): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const clean = input.slug.trim().toLowerCase();
  const err = validateSlug(clean);
  if (err) return { ok: false, error: SLUG_MESSAGES[err] };

  /* SNS 주소도 http(s) 만 통과시킨다 — 공개 페이지가 그대로 <a href> 로 쓴다 */
  const sns: Array<{ kind: string; url: string }> = [];
  for (const s of input.snsLinks.slice(0, 8)) {
    const href = normalizeUrl(s.url);
    if (href) sns.push({ kind: String(s.kind).slice(0, 20), url: href });
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("link_pages").select("slug").eq("user_id", user.id).maybeSingle();

  const { error } = await supabase
    .from("link_pages")
    .update({
      slug: clean,
      title: input.title.trim().slice(0, 40),
      bio: input.bio.trim().slice(0, 160),
      layout: input.layout,
      align: input.align,
      sns_links: sns,
      seo_title: input.seoTitle.trim().slice(0, 60) || null,
      seo_desc: input.seoDesc.trim().slice(0, 160) || null,
    })
    .eq("user_id", user.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 사용 중인 주소예요." };
    console.error("[links] 프로필 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }

  revalidatePath("/links");
  revalidatePath(`/p/${clean}`);
  /* 주소를 바꾸면 **옛 경로도** 무효화한다 — 안 하면 옛 주소가 캐시된 채로 계속 열린다 */
  if (before?.slug && before.slug !== clean) revalidatePath(`/p/${before.slug}`);
  return { ok: true };
}

export async function updateLinkTheme(theme: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  /* 모르는 키가 들어오면 공개 페이지가 기본 테마로 폴백해 "저장은 됐는데 안 바뀌는"
     상태가 된다 — 여기서 막고 알린다. */
  if (themeByKey(theme).key !== theme) return { ok: false, error: "지원하지 않는 테마예요." };

  const supabase = await createClient();
  const { error } = await supabase.from("link_pages").update({ theme }).eq("user_id", user.id);
  if (error) {
    console.error("[links] 테마 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function setLinkPublished(published: boolean): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();

  /* ⚠️ **먼저 확인하고 나서 바꾼다.** 앞서는 UPDATE 를 하고 나서 스냅샷 없음을
     감지해 에러를 돌려줬는데, 그러면 published 는 이미 true 로 바뀐 뒤라
     "에러가 떴는데 공개는 켜진" 상태가 남았다(그 주소는 방문자에게 404 다). */
  if (published) {
    const { data: cur } = await supabase
      .from("link_pages")
      .select("published_snapshot")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!cur?.published_snapshot) {
      return { ok: false, error: "먼저 「라이브 반영」을 눌러 지금 편집본을 발행해 주세요." };
    }
  }

  const { data, error } = await supabase
    .from("link_pages")
    .update({ published })
    .eq("user_id", user.id)
    .select("slug")
    .maybeSingle();
  if (error) {
    console.error("[links] 공개 상태 변경 실패:", error.message);
    return { ok: false, error: "변경하지 못했어요." };
  }
  revalidatePath("/links");
  if (data?.slug) revalidatePath(`/p/${data.slug}`);
  return { ok: true };
}

export async function deleteLinkPage(): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { data: page } = await supabase.from("link_pages").select("slug").eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("link_pages").delete().eq("user_id", user.id);
  if (error) {
    console.error("[links] 페이지 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  revalidatePath("/links");
  if (page?.slug) revalidatePath(`/p/${page.slug}`);
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   블록
   ══════════════════════════════════════════════════════════════════ */

export async function addBlock(type: BlockType): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const page = await myPage();
  if (!page) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };

  const supabase = await createClient();
  /* 맨 아래로. max+1 을 읽는다 — count 를 쓰면 중간 삭제 후 기존 블록과 겹친다 */
  const { data: last } = await supabase
    .from("link_blocks")
    .select("sort_order")
    .eq("page_id", page.id)
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("link_blocks").insert({
    page_id: page.id,
    type,
    data: defaultBlockData(type),
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) {
    console.error("[links] 블록 추가 실패:", error.message);
    return { ok: false, error: "추가하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function updateBlock(
  id: string,
  patch: { data?: Record<string, unknown>; active?: boolean },
): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const fields: Record<string, unknown> = {};
  if (patch.data !== undefined) {
    /* URL 이 들어 있는 필드는 전부 정규화·검증한다. javascript: 를 그대로 두면
       공개 페이지의 <a href> 가 방문자 브라우저에서 그걸 실행한다(저장형 XSS). */
    const cleaned = sanitizeBlockData(patch.data);
    if (cleaned.error) return { ok: false, error: cleaned.error };
    fields.data = cleaned.data;
  }
  if (patch.active !== undefined) fields.active = patch.active;
  if (Object.keys(fields).length === 0) return { ok: true };

  const supabase = await createClient();
  /* RLS 가 "내 페이지의 블록만"을 이미 강제한다(0048). id 만으로도 남의 것은 0행 매치 */
  const { error } = await supabase.from("link_blocks").update(fields).eq("id", id);
  if (error) {
    console.error("[links] 블록 수정 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function deleteBlock(id: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { error } = await supabase.from("link_blocks").delete().eq("id", id);
  if (error) {
    console.error("[links] 블록 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function moveBlock(id: string, dir: "up" | "down"): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const page = await myPage();
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("link_blocks")
    .select("id, sort_order")
    .eq("page_id", page.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const list = (rows ?? []) as Array<{ id: string; sort_order: number }>;
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: "블록을 찾지 못했어요." };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { ok: true }; // 끝에서 더 못 간다 — 오류는 아니다

  /* 두 행을 각각 갱신한다(트랜잭션 아님). **둘 다 성공했는지 확인한다** —
     첫 UPDATE 만 통과하면 두 블록이 같은 sort_order 를 갖고 순서가 그 자리에서 깨진다. */
  const a = list[i];
  const b = list[j];
  const first = await supabase.from("link_blocks").update({ sort_order: b.sort_order }).eq("id", a.id);
  if (first.error) {
    console.error("[links] 순서 이동 실패:", first.error.message);
    return { ok: false, error: "순서를 바꾸지 못했어요." };
  }
  const second = await supabase.from("link_blocks").update({ sort_order: a.sort_order }).eq("id", b.id);
  if (second.error) {
    console.error("[links] 순서 이동 실패(복구 시도):", second.error.message);
    await supabase.from("link_blocks").update({ sort_order: a.sort_order }).eq("id", a.id);
    return { ok: false, error: "순서를 바꾸지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   라이브 반영 — 초안을 공개 스냅샷으로 굽는다
   ══════════════════════════════════════════════════════════════════ */

export async function publishLinkPage(): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("link_pages")
    .select("id, slug, title, bio, layout, theme, align, avatar_path, cover_path, sns_links, seo_title, seo_desc")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };

  const { data: blocks } = await supabase
    .from("link_blocks")
    .select("id, type, data, sort_order, active")
    .eq("page_id", page.id)
    .eq("active", true) // 꺼둔 블록은 발행하지 않는다
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  /* 「최근 게시물」 블록을 여기서 **실제로 채운다.** 편집기가 "라이브 반영할 때
     채워집니다"라고 약속하므로, 안 채우면 발행해도 블록이 안 보이는 거짓말이 된다.
     연동이 없거나 실패하면 빈 배열 → 렌더러가 그 블록을 숨긴다(깨진 자리 대신 없음). */
  const rawBlocks = (blocks ?? []) as Array<{ id: string; type: string; data: Record<string, unknown> }>;
  const feedBlocks = rawBlocks.filter((b) => b.type === "social_feed");
  const feedCache = new Map<string, Array<{ thumbUrl: string | null; permalink: string | null }>>();
  for (const b of feedBlocks) {
    const channel = typeof b.data?.channel === "string" ? b.data.channel : "instagram";
    /* 인스타그램만 공개 미디어 목록 API 가 있다. 나머지는 빈 배열 */
    if (channel !== "instagram") {
      feedCache.set(b.id, []);
      continue;
    }
    const count = typeof b.data?.count === "number" ? b.data.count : 6;
    try {
      feedCache.set(b.id, await getLinkFeedItems(count));
    } catch (e) {
      console.error("[links] 최근 게시물 조회 실패:", e);
      feedCache.set(b.id, []);
    }
  }

  /* 스냅샷은 공개 페이지가 **그대로 렌더할 수 있는 형태**로 굽는다.
     여기서 한 번 정리해 두면 방문자 경로에서 변환·검증이 필요 없다. */
  const snapshot = {
    v: 1,
    title: page.title ?? "",
    bio: page.bio ?? "",
    layout: page.layout ?? "profile",
    theme: page.theme ?? "basic",
    align: page.align ?? "center",
    avatarPath: page.avatar_path ?? null,
    coverPath: page.cover_path ?? null,
    snsLinks: Array.isArray(page.sns_links) ? page.sns_links : [],
    seoTitle: page.seo_title ?? null,
    seoDesc: page.seo_desc ?? null,
    blocks: rawBlocks.map((b) => ({
      id: b.id,
      type: b.type,
      data: b.type === "social_feed" ? { ...(b.data ?? {}), cached: feedCache.get(b.id) ?? [] } : (b.data ?? {}),
    })),
  };

  const { error } = await supabase
    .from("link_pages")
    .update({ published_snapshot: snapshot, published_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) {
    console.error("[links] 라이브 반영 실패:", error.message);
    return { ok: false, error: "반영하지 못했어요." };
  }

  revalidatePath("/links");
  revalidatePath(`/p/${page.slug}`);
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   블록 데이터 위생 처리
   ══════════════════════════════════════════════════════════════════ */

/**
 * 블록 안의 모든 URL 을 http(s) 로 강제한다.
 *
 * 블록은 jsonb 라 DB check 로 걸 수 없다 — 그래서 **여기가 유일한 관문**이다.
 * url / items[].url 두 자리를 본다(현재 스키마에서 URL 이 들어가는 곳 전부).
 */
function sanitizeBlockData(input: Record<string, unknown>): { data?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = { ...input };

  if (typeof out.url === "string" && out.url.trim()) {
    const href = normalizeUrl(out.url);
    if (!href) return { error: "http 또는 https 로 시작하는 주소만 넣을 수 있어요." };
    out.url = href;
  }

  if (Array.isArray(out.items)) {
    const items: unknown[] = [];
    for (const raw of out.items.slice(0, 12)) {
      if (!raw || typeof raw !== "object") continue;
      const it = { ...(raw as Record<string, unknown>) };
      if (typeof it.url === "string" && it.url.trim()) {
        const href = normalizeUrl(it.url);
        if (!href) return { error: "http 또는 https 로 시작하는 주소만 넣을 수 있어요." };
        it.url = href;
      }
      items.push(it);
    }
    out.items = items;
  }

  return { data: out };
}
