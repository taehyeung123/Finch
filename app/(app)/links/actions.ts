"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { SLUG_MESSAGES, normalizeUrl, sliceChars, validateSlug } from "@/lib/links";
import { defaultBlockData, type BlockType } from "@/lib/links/blocks";
import { DEFAULT_THEME_KEY, themeByKey } from "@/lib/links/themes";
import { LINK_TEMPLATES } from "@/lib/links/templates";
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

/** 페이지당 블록 상한. 이 이상이면 편집 화면도 공개 페이지도 스크롤만 남는다 */
const MAX_BLOCKS = 50;

/** 풀린 slug 를 남이 못 가져가는 기간 */
const SLUG_HOLD_DAYS = 90;

/**
 * 최근에 풀린 주소인가 — 남이 선점하려는 것이면 막는다.
 *
 * 왜 필요한가: 인플루언서가 /p/old → /p/new 로 바꾸면 인스타 프로필·DM·명함에 남은
 * 옛 주소로 유입이 계속 온다. 그 slug 를 남이 즉시 가져가면 트래픽뿐 아니라
 * **방문자가 남기는 문의(이름·이메일·전화)** 까지 선점자에게 들어간다.
 *
 * ⚠️ 되찾기 판별은 **owner_id(사람)** 으로 한다(0050). page_id 로 했더니
 * `on delete set null` 때문에 페이지를 지우는 순간 근거가 사라져서, 본인이 자기
 * 옛 주소를 다시 쓰려 할 때 "다른 사람이 쓰던 주소"라는 거짓말을 들었다.
 *
 * 조회는 service_role 로 한다 — link_slug_history 는 정책이 없어 사용자 세션으로는
 * 못 읽는다(그 자체가 명부라서). 키가 없는 환경이면 검사를 건너뛴다
 * (선점 방지는 있으면 좋은 것이지, 없다고 주소 변경 자체를 막을 일은 아니다).
 */
async function slugHeldByOther(slug: string, myUserId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from("link_slug_history")
    .select("owner_id, released_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return false;
  if (data.owner_id === myUserId) return false; // 내가 놓은 내 주소 — 되찾기 허용
  const age = Date.now() - new Date(data.released_at as string).getTime();
  return age < SLUG_HOLD_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * 주소를 무덤에 넣는다 — 90일간 남이 못 가져간다.
 *
 * 실패해도 부르는 쪽의 결과를 바꾸지 않는다: 선점 방지는 부가 보호지 저장 조건이 아니다.
 */
async function releaseSlug(slug: string, pageId: string | null, userId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from("link_slug_history")
    .upsert(
      { slug, page_id: pageId, owner_id: userId, released_at: new Date().toISOString() },
      { onConflict: "slug" },
    );
  if (error) console.error("[links] 옛 주소 기록 실패:", error.message);
}

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
  if (await slugHeldByOther(clean, user.id)) {
    return { ok: false, error: "최근까지 다른 사람이 쓰던 주소예요. 다른 주소를 입력해 주세요." };
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("link_pages")
    .insert({ user_id: user.id, slug: clean, title: sliceChars(title.trim(), 40), theme: DEFAULT_THEME_KEY })
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
  const { data: before } = await supabase.from("link_pages").select("id, slug").eq("user_id", user.id).maybeSingle();
  if (before?.slug !== clean && (await slugHeldByOther(clean, user.id))) {
    return { ok: false, error: "최근까지 다른 사람이 쓰던 주소예요. 다른 주소를 입력해 주세요." };
  }

  const { error } = await supabase
    .from("link_pages")
    .update({
      slug: clean,
      title: sliceChars(input.title.trim(), 40),
      bio: sliceChars(input.bio.trim(), 160),
      layout: input.layout,
      align: input.align,
      sns_links: sns,
      seo_title: sliceChars(input.seoTitle.trim(), 60) || null,
      seo_desc: sliceChars(input.seoDesc.trim(), 160) || null,
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
  if (before?.slug && before.slug !== clean) {
    revalidatePath(`/p/${before.slug}`);
    await releaseSlug(before.slug, (before.id as string) ?? null, user.id);
  }
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
  const { data: page } = await supabase.from("link_pages").select("id, slug").eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("link_pages").delete().eq("user_id", user.id);
  if (error) {
    console.error("[links] 페이지 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  revalidatePath("/links");
  if (page?.slug) {
    revalidatePath(`/p/${page.slug}`);
    /* 삭제도 주소를 **놓는** 것이다 — 여기서 무덤에 안 넣으면, 홧김에 지웠다가
       마음이 바뀐 사이에 남이 그 주소를 즉시 가져간다. 주소 변경 때만 막고
       삭제 때는 열어두면 방어에 큰 구멍이 남는다.
       page_id 는 곧 사라지므로(cascade) 소유권 근거는 owner_id 다(0050). */
    await releaseSlug(page.slug as string, null, user.id);
  }
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   이미지 업로드
   ══════════════════════════════════════════════════════════════════ */

/** 2MB. 프로필 링크는 모바일에서 열리는 페이지라 큰 이미지는 그 자체로 이탈 요인이다 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * data URL 을 link-assets 버킷에 올리고 공개 URL 을 돌려준다.
 *
 * 클라이언트가 FileReader 로 만든 data URL 을 보낸다 — FormData 멀티파트 대신 이 방식인
 * 이유는 서버 액션 하나로 끝나고(별도 API 라우트 불필요) 브랜드 킷(0015)이 이미 같은
 * 패턴이라 검증돼 있어서다.
 *
 * 경로는 `${user.id}/...` — Storage RLS 가 본인 폴더만 허용한다(0048).
 * 탈퇴 시 정리 대상이기도 하다(settings/profile/actions.ts 의 USER_BUCKETS 에 추가할 것).
 */
export async function uploadLinkImage(dataUrl: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 올릴 수 없어요." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const m = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,(.+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: "PNG·JPG·WEBP·GIF·SVG 이미지만 올릴 수 있어요." };

  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "이미지는 2MB 이하만 올릴 수 있어요." };

  const ext = m[1].split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg");
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const supabase = await createClient();
  const { error } = await supabase.storage.from("link-assets").upload(path, buf, {
    contentType: m[1],
    upsert: false,
  });
  if (error) {
    console.error("[links] 이미지 업로드 실패:", error.message);
    return { ok: false, error: "업로드하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  const { data } = supabase.storage.from("link-assets").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** 프로필 사진·커버 저장 — 업로드 결과 URL 을 페이지에 붙인다 */
export async function updateLinkImages(patch: { avatarPath?: string | null; coverPath?: string | null }): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const fields: Record<string, unknown> = {};
  if (patch.avatarPath !== undefined) fields.avatar_path = patch.avatarPath;
  if (patch.coverPath !== undefined) fields.cover_path = patch.coverPath;
  if (Object.keys(fields).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("link_pages").update(fields).eq("user_id", user.id);
  if (error) {
    console.error("[links] 이미지 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
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

  const { count } = await supabase
    .from("link_blocks")
    .select("id", { count: "exact", head: true })
    .eq("page_id", page.id);
  if ((count ?? 0) >= MAX_BLOCKS) {
    return { ok: false, error: `블록은 ${MAX_BLOCKS}개까지 넣을 수 있어요. 안 쓰는 블록을 지워 주세요.` };
  }

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

/**
 * 여러 링크를 한 번에 추가한다 — 다른 서비스에서 옮겨올 때 쓴다.
 *
 * ⚠️ 서버가 남의 주소를 **fetch 하지 않는다.** 수확은 클라이언트가 붙여넣기에서
 * 하고(lib/links 의 parsePastedLinks — 순수 함수), 여기는 그 결과를 받아 넣기만 한다.
 * 이유는 lib/links/index.ts 상단에 적었다(요약: fetch 로는 DNS 리바인딩을 못 막고,
 * Vercel 에는 아웃바운드 방어가 없어 코드 한 줄 실수가 곧 완전한 SSRF 다).
 *
 * **덮지 않고 뒤에 붙인다.** applyTemplate 이 덮는 건 그게 페이지 *전체 구성*이라서고,
 * 가져오기는 *링크 목록*이다. 되돌릴 수 있는 쪽이 기본값이어야 한다.
 */
export async function addBlocksBulk(
  items: Array<{ label: string; url: string }>,
): Promise<Result & { added?: number }> {
  if (isDemoMode()) return DEMO;
  const page = await myPage();
  if (!page) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };
  if (items.length === 0) return { ok: false, error: "추가할 링크가 없어요." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("link_blocks")
    .select("id", { count: "exact", head: true })
    .eq("page_id", page.id);

  const room = MAX_BLOCKS - (count ?? 0);
  if (room <= 0) {
    return { ok: false, error: `블록은 ${MAX_BLOCKS}개까지예요. 안 쓰는 블록을 지우고 다시 시도해 주세요.` };
  }
  /* 넘치면 **자르지 않고 알린다** — 조용히 앞 몇 개만 들어가면 나머지가 어디 갔는지 모른다 */
  if (items.length > room) {
    return { ok: false, error: `지금 ${room}개까지만 더 넣을 수 있어요. ${items.length}개를 고르셨습니다.` };
  }

  /* 맨 아래부터. max+1 을 읽는다 — count 를 쓰면 중간 삭제 후 기존 블록과 겹친다 */
  const { data: last } = await supabase
    .from("link_blocks")
    .select("sort_order")
    .eq("page_id", page.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let order = (last?.sort_order ?? -1) + 1;

  const rows: Array<{ page_id: string; type: BlockType; data: Record<string, unknown>; sort_order: number }> = [];
  for (const it of items) {
    /* 새 검증 경로를 만들지 않는다 — 기존 관문을 그대로 태운다.
       여기서 갈라지면 언젠가 반드시 어긋난다. */
    const cleaned = sanitizeBlockData({ label: it.label || "링크", url: it.url, emphasis: "normal" });
    if (cleaned.error) return { ok: false, error: cleaned.error };
    if (!cleaned.data?.url) continue; // 주소가 안 남았으면 넣을 이유가 없다
    rows.push({ page_id: page.id, type: "link", data: cleaned.data, sort_order: order++ });
  }
  if (rows.length === 0) return { ok: false, error: "넣을 수 있는 주소가 없어요." };

  const { error } = await supabase.from("link_blocks").insert(rows);
  if (error) {
    console.error("[links] 링크 일괄 추가 실패:", error.message);
    return { ok: false, error: "추가하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true, added: rows.length };
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

/**
 * 템플릿 적용 — 기존 블록을 **지우고** 템플릿 블록으로 덮는다.
 *
 * 섞지 않는 이유: 순서가 엉키고 되돌릴 수도 없다. 화면이 "기존 블록이 사라진다"는
 * 확인을 먼저 받는다.
 *
 * 발행본(published_snapshot)은 건드리지 않는다 — 적용해 보고 마음에 안 들면
 * 라이브 반영을 안 하면 그만이다. 그게 draft/publish 분리의 값어치다.
 */
export async function applyTemplate(key: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const page = await myPage();
  if (!page) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };

  const tpl = LINK_TEMPLATES.find((t) => t.key === key);
  if (!tpl) return { ok: false, error: "없는 템플릿이에요." };

  const supabase = await createClient();
  const { error: delErr } = await supabase.from("link_blocks").delete().eq("page_id", page.id);
  if (delErr) {
    console.error("[links] 템플릿 적용(기존 삭제) 실패:", delErr.message);
    return { ok: false, error: "적용하지 못했어요." };
  }

  const rows = tpl.blocks.map((b, i) => ({
    page_id: page.id,
    type: b.type,
    data: b.data,
    sort_order: i,
  }));
  const { error } = await supabase.from("link_blocks").insert(rows);
  if (error) {
    console.error("[links] 템플릿 적용 실패:", error.message);
    return { ok: false, error: "적용하지 못했어요." };
  }

  /* 템플릿마다 어울리는 테마가 있다 — 블록만 바뀌고 테마가 그대로면 의도한 인상이 안 난다 */
  await supabase.from("link_pages").update({ theme: tpl.theme }).eq("id", page.id);

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

  /* ⚠️ **error 를 반드시 본다.** 앞서는 꺼내지도 않아서, 조회가 실패해 blocks 가 null 이면
     빈 배열로 스냅샷을 구워 **라이브를 통째로 비우고 ok 를 반환**했다. 화면은 「반영됨」,
     방문자는 "아직 등록된 링크가 없어요". 바로 위 link_pages 조회는 이미 막고 있었다.
     (반대로 "0행이면 차단"은 하지 않는다 — active=true 필터라, 블록을 전부 꺼둔
      정당한 사용자의 발행까지 막힌다.) */
  const { data: blocks, error: blockErr } = await supabase
    .from("link_blocks")
    .select("id, type, data, sort_order, active")
    .eq("page_id", page.id)
    .eq("active", true) // 꺼둔 블록은 발행하지 않는다
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (blockErr) {
    console.error("[links] 발행용 블록 조회 실패:", blockErr.message);
    return { ok: false, error: "반영하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

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
    /* 발행 도장. **없으면 발행이 조용히 실패한다** — 0049 의 트리거는
       `published_snapshot is distinct from old` 일 때만 published_at 을 찍는데,
       스냅샷에 없는 것(slug)만 바꾸거나 꺼둔 블록만 고치거나 고쳤다 되돌린 뒤
       발행하면 스냅샷이 **글자 하나 안 달라져서** 트리거가 안 탄다. 그동안
       updated_at 은 전진하므로 dirty 가 영원히 참 = 「반영됨」에 도달할 수 없다.
       (트리거를 `is not null` 기준으로 바꾸는 건 안 된다 — 그러면 프로필·테마 저장까지
        published_at 을 찍어 진짜 초안 변경이 묻힌다. 반대 방향으로 같은 거짓말이다.) */
    at: new Date().toISOString(),
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

  /* ⚠️ published_at 을 **여기서 만들지 않는다.** 앱 시각으로 보내면 같은 UPDATE 가
     태우는 set_updated_at 트리거의 DB 시각(now())보다 항상 왕복지연만큼 이르다.
     그러면 `updated_at > published_at` 이 발행 직후에도 참이라 화면이 영원히
     "초안"으로 남는다 — 「반영됨」에 도달할 수 없었다. 0049 의
     trg_link_pages_zz_publish 가 두 값을 같은 트랜잭션 시각으로 맞춘다. */
  const { error } = await supabase
    .from("link_pages")
    .update({ published_snapshot: snapshot })
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
 * 블록 데이터의 **유일한 관문.**
 *
 * 블록은 jsonb 라 DB check 로 컬럼별 제약을 걸 수 없다. 그래서 여기서 세 가지를 한다:
 *  ① URL 은 전부 http(s) 로 강제 — javascript: 를 그대로 두면 공개 페이지의
 *     <a href> 가 방문자 브라우저에서 그걸 실행한다(저장형 XSS)
 *  ② 길이·개수·열거값 상한 — 화면의 maxLength 는 편의지 경계가 아니다.
 *     서버 액션은 폼 없이도 직접 호출할 수 있으므로 여기서 자른다
 *  ③ 전체 크기 상한 — 블록 하나가 스냅샷을 통째로 부풀리면 공개 페이지가 느려진다
 *
 * 모르는 키는 **버리지 않고** 문자열 상한만 건다 — 블록 종류가 늘 때마다 이 목록을
 * 고쳐야 하면 반드시 빠뜨린다. 대신 서버가 만드는 값(cached)만 명시적으로 떨군다.
 */
/* 상한은 **코드포인트 수**다(sliceChars). emoji 가 2가 아니라 4인 이유:
   🛍️ 는 코드포인트 2개(기본 문자 + 변형 선택자), 🇰🇷 는 2개(지역 표시 문자 두 개),
   👍🏻 는 2개(기본 + 피부톤)다. 2로 두면 우리가 템플릿에 깔아준 🛍️ 조차
   저장 한 번에 🛍 로 바뀐다. 4면 국기·피부톤·ZWJ 없는 조합까지 온전히 통과한다. */
const TEXT_CAPS: Record<string, number> = {
  label: 40,
  title: 60,
  subtitle: 80,
  text: 500,
  description: 160,
  buttonLabel: 20,
  alt: 100,
  address: 200,
  emoji: 4,
};
const ENUMS: Record<string, readonly string[]> = {
  emphasis: ["normal", "primary", "outline"],
  align: ["left", "center"],
  style: ["line", "dot"],
  tone: ["info", "primary", "warning"],
  channel: ["instagram", "tiktok", "threads"],
};
/** 숫자 필드는 화이트리스트다 — spacer.size 는 렌더러가 그 값을 그대로 px 높이로 쓴다 */
const NUM_ENUMS: Record<string, readonly number[]> = {
  size: [8, 16, 24, 40],
  columns: [2, 3],
  count: [3, 6, 9],
};
/** 스냅샷 한 블록의 상한(문자 수). 넘으면 공개 페이지 첫 바이트가 눈에 띄게 느려진다 */
const MAX_BLOCK_CHARS = 8192;

const URL_ERROR = "http 또는 https 로 시작하는 주소만 넣을 수 있어요.";

function sanitizeBlockData(input: Record<string, unknown>): { data?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(input)) {
    /* cached 는 「라이브 반영」이 채우는 서버 생성 값이다. 클라이언트가 보낸 걸 그대로
       두면 연동하지 않은 계정의 썸네일·링크를 스냅샷에 심을 수 있다 — 발행 때 다시 채운다. */
    if (k === "cached") continue;

    if (k === "url" || k === "imagePath") {
      if (typeof v !== "string" || !v.trim()) continue;
      const href = normalizeUrl(v);
      if (!href) return { error: URL_ERROR };
      out[k] = href;
      continue;
    }

    if (k === "items") {
      if (!Array.isArray(v)) continue;
      const items: unknown[] = [];
      for (const raw of v.slice(0, 12)) {
        if (!raw || typeof raw !== "object") continue;
        const it: Record<string, unknown> = {};
        for (const [ik, iv] of Object.entries(raw as Record<string, unknown>)) {
          if (ik === "url" || ik === "imagePath") {
            if (typeof iv !== "string" || !iv.trim()) continue;
            const href = normalizeUrl(iv);
            if (!href) return { error: URL_ERROR };
            it[ik] = href;
          } else if (typeof iv === "string") {
            it[ik] = sliceChars(iv, Object.hasOwn(TEXT_CAPS, ik) ? TEXT_CAPS[ik] : 200);
          } else if (typeof iv === "number" || typeof iv === "boolean") {
            it[ik] = iv;
          }
        }
        items.push(it);
      }
      out.items = items;
      continue;
    }

    if (k === "fields") {
      /* 문의받기가 받을 항목 — 공개 폼(lead-form.tsx)이 이 배열을 그대로 그린다 */
      const allowed = ["name", "email", "phone", "message"];
      const picked = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : [];
      out.fields = [...new Set(picked)];
      continue;
    }

    /* `k in X` 가 아니라 Object.hasOwn 이다 — `in` 은 프로토타입 키까지 참이라
       "constructor" 같은 키가 오면 NUM_ENUMS["constructor"].includes 에서 터진다.
       UI 로는 못 만들지만 서버 액션은 폼 없이도 직접 부를 수 있다. */
    if (Object.hasOwn(NUM_ENUMS, k)) {
      const num = typeof v === "number" ? v : Number(v);
      if (NUM_ENUMS[k].includes(num)) out[k] = num;
      continue; // 목록 밖이면 통째로 뺀다 — 렌더러가 각자의 기본값을 쓴다
    }

    if (Object.hasOwn(ENUMS, k)) {
      if (typeof v === "string" && ENUMS[k].includes(v)) out[k] = v;
      continue;
    }

    if (typeof v === "string") {
      out[k] = sliceChars(v, Object.hasOwn(TEXT_CAPS, k) ? TEXT_CAPS[k] : 500);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
    /* 그 밖(객체·중첩 배열)은 떨군다 — 지금 스키마에 그런 필드가 없다 */
  }

  if (JSON.stringify(out).length > MAX_BLOCK_CHARS) {
    return { error: "내용이 너무 길어요. 항목을 줄이거나 나눠 주세요." };
  }

  return { data: out };
}
