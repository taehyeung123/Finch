"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { SLUG_MESSAGES, normalizeSnsUrl, normalizeUrl, sanitizeSnsLinks, sliceChars, validateSlug } from "@/lib/links";
import { SNS_CATALOG, snsHref } from "@/lib/links/sns-catalog";
import { BLOCK_META_KEYS, BLOCK_TYPES, EMPHASIS_TYPES, defaultBlockData, type BlockType } from "@/lib/links/blocks";
import { SafeFetchError, fetchPublicHtml } from "@/lib/links/safe-fetch";
import { DEFAULT_THEME_KEY, sanitizeThemeCustom, themeByKey } from "@/lib/links/themes";
import { LINK_LANGS, TRACKER_FORMATS, VERIFY_FORMAT, isSingleEmoji, type LinkPageSettings } from "@/lib/links/settings";
import { hashPagePassword, validPagePassword } from "@/lib/links/password";
import { LINK_TEMPLATES } from "@/lib/links/templates";
import { parseLittlyHtml } from "@/lib/links/littly";
import { parseInpockHtml } from "@/lib/links/inpock";
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

/** 내 페이지 id·slug — 거의 모든 액션이 먼저 필요로 한다.
    pageId 를 받으면 **그 페이지**(소유 확인 포함), 없으면 첫 페이지(0060 전 단일 페이지와 동일).
    maybeSingle 은 두 장부터 터지므로 목록에서 첫 장을 집는다(멀티, 2026-08-24). */
async function myPage(pageId?: string | null): Promise<{ id: string; slug: string } | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  if (pageId) {
    const { data } = await supabase
      .from("link_pages")
      .select("id, slug")
      .eq("id", pageId)
      .eq("user_id", user.id)
      .maybeSingle();
    return (data as { id: string; slug: string } | null) ?? null;
  }
  const { data } = await supabase
    .from("link_pages")
    .select("id, slug")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; slug: string } | null) ?? null;
}

/** 페이지 상한(0060 트리거)·서브 구조 위반을 사용자 문구로 — DB 가 최종 관문이고 여기선 통역만 */
function pageInsertError(error: { code?: string; message: string }): string | null {
  if (error.code === "23514" && /페이지는 최대|서브 페이지|부모 페이지|쓸 수 없는 서브/.test(error.message)) {
    const m = /[가-힣0-9 %.,'"()a-zA-Z]+/.exec(error.message);
    return m ? m[0].trim() : "페이지 상한에 걸렸어요.";
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════
   페이지
   ══════════════════════════════════════════════════════════════════ */

export async function createLinkPage(slug: string, title: string): Promise<Result & { id?: string }> {
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
        /* user_id unique 는 0060 에서 사라진다 — 그 전 배포에서 두 번째 페이지를 만들면 여기로 온다 */
        error: error.message.includes("user_id")
          ? "페이지 추가는 서버 업데이트(0060) 적용 후 쓸 수 있어요. 이미 페이지가 있다면 새로고침해 주세요."
          : "이미 사용 중인 주소예요. 다른 주소를 입력해 주세요.",
      };
    }
    /* 0059 트리거(풀린 주소 90일 보류) — 앱 사전 검사와 쓰기 사이의 경주도 같은 말로 */
    if (error.code === "23514" && /다른 사람이 쓰던/.test(error.message)) {
      return { ok: false, error: "최근까지 다른 사람이 쓰던 주소예요. 다른 주소를 입력해 주세요." };
    }
    /* 0060 상한 트리거(무료1·유료3) — DB 문구를 그대로 통역한다 */
    const capMsg = pageInsertError(error);
    if (capMsg) return { ok: false, error: capMsg };
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
  return { ok: true, id: created?.id };
}

/**
 * 무작위 주소 8자 — 링크팜도 이렇게 시작한다(실측: 사장님 계정이 1vq0uqji 였다).
 *
 * 첫 화면에서 "주소를 뭘로 하지"로 멈추는 게 가장 큰 이탈 지점이다. 자동으로 만들어
 * 주고, 바꾸는 건 프로필 탭에서 언제든 된다(옛 주소는 slug 무덤이 지킨다).
 */
function randomSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((v) => chars[v % 36])
    .join("");
}

/**
 * 템플릿 또는 가져온 링크로 **한 번에 시작**한다 — 링크팜 첫 화면의
 * 「템플릿으로 시작」·「기존 링크 가져오기」에 해당.
 *
 * createLinkPage(주소·제목 입력형)와 따로 두는 이유: 이 경로는 주소를 묻지 않는다.
 * 주소·제목·블록이 전부 자동으로 깔린 채 빌더에 떨어져야 "시작"이라는 말이 맞다.
 */
export async function createLinkPageWithStart(input: {
  template?: string;
  links?: Array<{ label: string; url: string }>;
}): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  /* 실패할 것부터 먼저 검증한다 — 페이지를 만들어 놓고 블록에서 실패하면 반쪽 상태다 */
  const tpl = input.template ? LINK_TEMPLATES.find((t) => t.key === input.template) : null;
  if (input.template && !tpl) return { ok: false, error: "없는 템플릿이에요." };

  const linkRows: Array<{ type: BlockType; data: Record<string, unknown> }> = [];
  if (!tpl) {
    /* 조용히 자르지 않는다 — 66개를 골랐는데 50개로 만들어 놓고 "만들었어요" 하면 16개가 사라진 줄 모른다(감사2 U5). addBlocksBulk 와 같은 규칙 */
    if ((input.links ?? []).length > MAX_BLOCKS) {
      return { ok: false, error: `링크는 ${MAX_BLOCKS}개까지 한 번에 넣을 수 있어요. ${(input.links ?? []).length}개를 고르셨어요 — 몇 개를 빼 주세요.` };
    }
    for (const it of input.links ?? []) {
      const cleaned = sanitizeBlockData({ label: it.label || "링크", url: it.url, emphasis: "normal" });
      if (cleaned.error) return { ok: false, error: cleaned.error };
      if (cleaned.data?.url) linkRows.push({ type: "link", data: cleaned.data });
    }
    if (linkRows.length === 0) return { ok: false, error: "넣을 수 있는 링크가 없어요." };
  }

  const supabase = await createClient();

  /* 제목 기본값은 계정 이름 — 빈 제목이면 공개 페이지 머리가 무작위 주소 문자열이 된다 */
  const { data: prof } = await supabase.from("users_profile").select("display_name").eq("id", user.id).maybeSingle();
  const title = sliceChars(((prof?.display_name as string) ?? "").trim(), 40);

  /* 무작위 주소는 충돌할 수 있다(36^8 이라 사실상 없지만 공짜 재시도다) */
  let pageId: string | null = null;
  for (let attempt = 0; attempt < 5 && !pageId; attempt++) {
    const slug = randomSlug();
    if (validateSlug(slug)) continue; // 예약어(8자 무작위가 걸릴 일은 없지만 규칙은 규칙이다)
    const { data: created, error } = await supabase
      .from("link_pages")
      .insert({ user_id: user.id, slug, title, theme: tpl?.theme ?? DEFAULT_THEME_KEY })
      .select("id")
      .maybeSingle();
    if (!error) {
      pageId = (created?.id as string) ?? null;
      break;
    }
    if (error.code === "23505") {
      if (error.message.includes("user_id")) {
        return { ok: false, error: "페이지 추가는 서버 업데이트(0060) 적용 후 쓸 수 있어요. 이미 페이지가 있다면 새로고침해 주세요." };
      }
      continue; // slug 충돌 — 새 주소로 재시도
    }
    console.error("[links] 페이지 생성 실패:", error.message);
    return { ok: false, error: "만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (!pageId) return { ok: false, error: "만들지 못했어요. 잠시 후 다시 시도해 주세요." };

  const rows = (tpl ? tpl.blocks : linkRows).map((b, i) => ({
    page_id: pageId,
    type: b.type,
    data: b.data,
    sort_order: i,
  }));
  const { error: blockErr } = await supabase.from("link_blocks").insert(rows);
  revalidatePath("/links");
  if (blockErr) {
    console.error("[links] 시작 블록 깔기 실패:", blockErr.message);
    /* 페이지는 이미 만들어졌다 — 빈 빌더가 뜨므로 뭘 하면 되는지 말해준다 */
    return { ok: false, error: "페이지는 만들어졌는데 블록을 채우지 못했어요. 블록 탭에서 다시 추가해 주세요." };
  }
  return { ok: true };
}

/** 서브 페이지 주소 세그먼트 — 0060 check(link_pages_sub_shape)와 같은 규칙 + 라우트 예약어 */
const SUB_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SUB_RESERVED = new Set(["go", "vcard", "dwell", "s", "p", "api"]);

/**
 * 서브 페이지 만들기(0060) — 부모 주소 아래 /p/{부모}/{sub} 로 열린다.
 * 전역 slug 도 자동 발급한다: 방문자 경로(/go·/vcard·잠금·집계)가 전부 슬러그 기반이라
 * 서브도 그 배관을 그대로 쓴다. 페이지 수 상한(무료1·유료3)은 DB 트리거가 최종 관문.
 */
export async function createLinkSubpage(parentId: string, subSlug: string, title: string): Promise<Result & { id?: string }> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const seg = subSlug.trim().toLowerCase();
  if (!SUB_SLUG_RE.test(seg)) return { ok: false, error: "서브 주소는 영문 소문자·숫자·하이픈 1~40자예요." };
  if (SUB_RESERVED.has(seg)) return { ok: false, error: "쓸 수 없는 서브 주소예요. 다른 이름을 골라 주세요." };

  const parent = await myPage(parentId);
  if (!parent) return { ok: false, error: "부모 페이지를 찾을 수 없어요." };

  const supabase = await createClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: created, error } = await supabase
      .from("link_pages")
      .insert({
        user_id: user.id,
        slug: randomSlug(),
        title: sliceChars(title.trim(), 40) || seg,
        theme: DEFAULT_THEME_KEY,
        parent_id: parentId,
        sub_slug: seg,
      })
      .select("id")
      .maybeSingle();
    if (!error) {
      if (created?.id) {
        await supabase.from("link_blocks").insert({ page_id: created.id, type: "link", data: defaultBlockData("link"), sort_order: 0 });
      }
      revalidatePath("/links");
      revalidatePath(`/p/${parent.slug}/${seg}`);
      return { ok: true, id: created?.id };
    }
    if (error.code === "23505") {
      /* 부모+세그먼트 중복 vs 전역 slug 충돌을 갈라 말한다 — 후자는 재시도 */
      if (/parent_sub|sub_slug/i.test(error.message)) return { ok: false, error: "이미 있는 서브 주소예요. 다른 이름을 골라 주세요." };
      continue;
    }
    if (error.code === "42703" || /parent_id|sub_slug/i.test(error.message)) {
      return { ok: false, error: "서브 페이지는 서버 업데이트(0060) 적용 후 쓸 수 있어요." };
    }
    const capMsg = pageInsertError(error);
    if (capMsg) return { ok: false, error: capMsg };
    console.error("[links] 서브 페이지 생성 실패:", error.message);
    return { ok: false, error: "만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: false, error: "만들지 못했어요. 잠시 후 다시 시도해 주세요." };
}

export async function updateLinkProfile(input: {
  slug: string;
  title: string;
  bio: string;
  layout: string;
  align: string;
  snsLinks: Array<{ kind: string; url: string }>;
  /** SNS 줄 위치 — profile(소개 아래) | links(블록 위). 0051 */
  snsPlacement: string;
  /** 프로필 타이틀 크기 — sm | md | lg. 0051 */
  titleSize: string;
  seoTitle: string;
  seoDesc: string;
}, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const clean = input.slug.trim().toLowerCase();
  const err = validateSlug(clean);
  if (err) return { ok: false, error: SLUG_MESSAGES[err] };

  /* SNS 주소도 http(s) 만 통과시킨다 — 공개 페이지가 그대로 <a href> 로 쓴다.
     틀린 주소는 **조용히 떨구지 않고 거절한다** — 떨구면 ok 인데 저장 결과가 직전과 같아
     폼이 동기화되지 않고 "저장 안 한 변경" 이 영원히 남는다(감사 #9). 빈 칸은 "지워 달라" 고 말한다. */
  const sns: Array<{ kind: string; url: string }> = [];
  for (const s of input.snsLinks.slice(0, 8)) {
    const kind = String(s.kind).slice(0, 24);
    if (!SNS_CATALOG.some((c) => c.key === kind)) return { ok: false, error: "지원하지 않는 SNS 종류예요." };
    /* 이메일·전화·문자 칩은 사용자가 주소만 적는다 — 스킴은 여기서 붙인다(snsHref) */
    const href = normalizeSnsUrl(snsHref(kind, s.url));
    if (!href) {
      return {
        ok: false,
        error: s.url.trim() ? "SNS 주소가 올바르지 않아요 — http(s) 주소, 이메일, 전화번호만 넣을 수 있어요." : "비어 있는 SNS 줄은 지워 주세요.",
      };
    }
    sns.push({ kind, url: href });
  }

  const supabase = await createClient();
  const before = await myPage(pageId);
  if (!before) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };
  if (before.slug !== clean && (await slugHeldByOther(clean, user.id))) {
    return { ok: false, error: "최근까지 다른 사람이 쓰던 주소예요. 다른 주소를 입력해 주세요." };
  }

  const base = {
    slug: clean,
    title: sliceChars(input.title.trim(), 40),
    bio: sliceChars(input.bio.trim(), 160),
    layout: input.layout,
    align: input.align,
    sns_links: sns,
    seo_title: sliceChars(input.seoTitle.trim(), 60) || null,
    seo_desc: sliceChars(input.seoDesc.trim(), 160) || null,
  };
  /* 열거값 검증 — DB check 가 최후 방어지만 여기서 걸러야 사용자가 이유를 안다 */
  const placement = input.snsPlacement === "links" ? "links" : "profile";
  const titleSize = ["sm", "md", "lg"].includes(input.titleSize) ? input.titleSize : "md";

  const { error } = await supabase
    .from("link_pages")
    .update({ ...base, sns_placement: placement, title_size: titleSize })
    .eq("id", before.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 사용 중인 주소예요." };
    if (error.code === "23514" && /다른 사람이 쓰던/.test(error.message)) {
      return { ok: false, error: "최근까지 다른 사람이 쓰던 주소예요. 다른 주소를 입력해 주세요." };
    }
    console.error("[links] 프로필 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }

  revalidatePath("/links");
  revalidatePath(`/p/${clean}`);
  /* 주소를 바꾸면 **옛 경로도** 무효화한다 — 안 하면 옛 주소가 캐시된 채로 계속 열린다 */
  if (before.slug && before.slug !== clean) {
    revalidatePath(`/p/${before.slug}`);
    await releaseSlug(before.slug, before.id, user.id);
  }
  return { ok: true };
}

/**
 * 테마 직접 꾸미기 저장 — 프리셋 위 오버라이드(0056 theme_custom).
 * 관문은 sanitizeThemeCustom 하나: hex·허용 열거값·http(s) 이미지만 남는다.
 * 빈 오버라이드는 null 로 저장(= 프리셋 그대로).
 */
export async function updateLinkThemeCustom(input: unknown, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  const custom = sanitizeThemeCustom(input);
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };
  const supabase = await createClient();
  const { error } = await supabase.from("link_pages").update({ theme_custom: custom }).eq("id", page.id);
  if (error) {
    if (error.code === "42703" || (/theme_custom/i.test(error.message) && /column|schema/i.test(error.message))) {
      return { ok: false, error: "직접 꾸미기는 서버 업데이트(0056) 적용 후 저장할 수 있어요." };
    }
    console.error("[links] 테마 커스텀 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   페이지 설정(0058) — 리틀리 ⚙ 페이지 설정 모달 카피(5단계). 발행과 무관하게 즉시 적용.
   ══════════════════════════════════════════════════════════════════ */

const SETTINGS_MIGRATION_MSG = "페이지 설정은 서버 업데이트(0058) 적용 후 저장할 수 있어요.";
const HTTPS_IMG = /^https:\/\/[^\s"'<>()]+$/;

function isSettingsColumnError(error: { code?: string; message: string }): boolean {
  return error.code === "42703" || (/settings/i.test(error.message) && /column|schema/i.test(error.message));
}

/**
 * settings 부분 갱신 — **원자적**(0059 RPC: jsonb ||). 읽고-합치고-쓰기는 잠금 문구 저장과 비밀번호 걸기가 겹칠 때
 * locked 를 되돌릴 수 있다(소넷 점검). RPC 가 없으면(0059 미적용) 읽고-합치고-쓰기로 폴백한다.
 */
async function patchSettings(pageId: string, patch: Record<string, unknown>): Promise<{ error: { code?: string; message: string } | null }> {
  const supabase = await createClient();
  /* 0060 시그니처(페이지 단위) → 0059 시그니처(user_id 판 — 그땐 페이지가 한 장이라 같은 행) → RMW 폴백 */
  const rpc = await supabase.rpc("link_pages_patch_settings", { p_page: pageId, p_patch: patch });
  if (!rpc.error) return { error: null };
  let missingFn = rpc.error.code === "42883" || rpc.error.code === "PGRST202" || /link_pages_patch_settings/i.test(rpc.error.message);
  if (missingFn) {
    const legacy = await supabase.rpc("link_pages_patch_settings", { p_patch: patch });
    if (!legacy.error) return { error: null };
    missingFn = legacy.error.code === "42883" || legacy.error.code === "PGRST202" || /link_pages_patch_settings/i.test(legacy.error.message);
    if (!missingFn) return { error: legacy.error };
  } else {
    return { error: rpc.error };
  }
  const { data: row, error: readErr } = await supabase.from("link_pages").select("id, settings").eq("id", pageId).maybeSingle();
  if (readErr) return { error: readErr };
  if (!row) return { error: { message: "no page" } };
  const cur = (row.settings && typeof row.settings === "object" ? row.settings : {}) as Record<string, unknown>;
  const { error } = await supabase.from("link_pages").update({ settings: { ...cur, ...patch } }).eq("id", row.id);
  return { error };
}

/**
 * 비밀이 아닌 설정값 저장 — 받은 키만 골라 덮어쓴다(locked 는 여기서 못 바꾼다: setLinkPassword 전용).
 * 값 검증은 sanitizeLinkSettings 와 같은 규칙이되, 잘못된 값은 조용히 기본값으로 떨어뜨리지 않고 **거절**한다 —
 * 편집기는 "저장됐는데 안 바뀜"보다 "왜 안 되는지"를 알아야 한다.
 */
export async function updateLinkSettings(
  patch: Partial<
    Pick<
      LinkPageSettings,
      "lang" | "target" | "robots" | "ogTitle" | "ogImage" | "favicon" | "lockMessage" | "ga4" | "metaPixel" | "tiktokPixel" | "utm" | "verifyGoogle" | "verifyNaver"
    >
  >,
  pageId?: string,
): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const next: Record<string, unknown> = {};
  if (patch.lang !== undefined) {
    if (!LINK_LANGS.some((l) => l.key === patch.lang)) return { ok: false, error: "지원하지 않는 언어예요." };
    next.lang = patch.lang;
  }
  if (patch.target !== undefined) {
    if (patch.target !== "blank" && patch.target !== "self") return { ok: false, error: "링크 열기 방식이 올바르지 않아요." };
    next.target = patch.target;
  }
  if (patch.robots !== undefined) {
    if (patch.robots !== "index" && patch.robots !== "noindex") return { ok: false, error: "검색 노출 값이 올바르지 않아요." };
    next.robots = patch.robots;
  }
  if (patch.utm !== undefined) {
    if (typeof patch.utm !== "boolean") return { ok: false, error: "UTM 설정 값이 올바르지 않아요." };
    next.utm = patch.utm;
  }
  if (patch.ogTitle !== undefined) next.ogTitle = sliceChars(String(patch.ogTitle).trim(), 80);
  if (patch.lockMessage !== undefined) next.lockMessage = sliceChars(String(patch.lockMessage).trim(), 200);
  if (patch.ogImage !== undefined) {
    const v = String(patch.ogImage).trim();
    if (v && !HTTPS_IMG.test(v)) return { ok: false, error: "공유 이미지 주소는 https 로 시작해야 해요." };
    next.ogImage = v;
  }
  if (patch.favicon !== undefined) {
    const v = String(patch.favicon).trim();
    if (v && !isSingleEmoji(v) && !HTTPS_IMG.test(v)) return { ok: false, error: "파비콘은 이모지 하나 또는 https 이미지 주소여야 해요." };
    next.favicon = v;
  }
  /* 마케팅 연결 — 형식이 틀리면 거절(저장돼도 스크립트가 안 실려 "연결했는데 안 잡힘"이 된다) */
  const trackers: Array<["ga4" | "metaPixel" | "tiktokPixel", string, boolean]> = [
    ["ga4", "GA4 측정 ID 는 G-XXXXXXXX 꼴이에요.", true],
    ["metaPixel", "Meta 픽셀 ID 는 숫자 8~20자리예요.", false],
    ["tiktokPixel", "TikTok 픽셀 ID 는 영문·숫자 10~32자예요.", true],
  ];
  for (const [k, msg, upper] of trackers) {
    if (patch[k] === undefined) continue;
    const raw = String(patch[k]).trim();
    const v = upper ? raw.toUpperCase() : raw;
    if (v && !TRACKER_FORMATS[k].test(v)) return { ok: false, error: msg };
    next[k] = v;
  }
  /* 검색엔진 소유확인 — 값 자체가 <head> 로 나가므로 형식 밖이면 거절한다.
     "붙여넣었는데 확인이 안 된다"는 대개 태그 전체(<meta …>)를 통째로 붙인 경우다 — 그걸 그대로 말해 준다. */
  for (const k of ["verifyGoogle", "verifyNaver"] as const) {
    if (patch[k] === undefined) continue;
    const v = String(patch[k]).trim();
    if (v && !VERIFY_FORMAT.test(v)) {
      return { ok: false, error: "확인 코드만 넣어 주세요 — <meta …> 태그 전체가 아니라 content=\"…\" 안의 값이에요." };
    }
    next[k] = v;
  }
  if (Object.keys(next).length === 0) return { ok: true };

  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };
  const { error } = await patchSettings(page.id, next);
  if (error) {
    if (isSettingsColumnError(error)) return { ok: false, error: SETTINGS_MIGRATION_MSG };
    console.error("[links] 페이지 설정 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

/**
 * 비밀번호 걸기/풀기 — 해시는 link_page_secrets(주인만 읽음), jsonb 엔 locked 만.
 * null 이면 해제. 바꾸면 해시가 달라져 방문자들의 「열림」 쿠키가 전부 무효가 된다.
 */
export async function setLinkPassword(password: string | null, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  const supabase = await createClient();
  const row = await myPage(pageId);
  if (!row) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };

  if (password === null) {
    const { error: delErr } = await supabase.from("link_page_secrets").delete().eq("page_id", row.id);
    if (delErr && !/link_page_secrets/i.test(delErr.message)) return { ok: false, error: "해제하지 못했어요." };
    const { error } = await patchSettings(row.id, { locked: false });
    if (error) return { ok: false, error: "해제하지 못했어요." };
    revalidatePath("/links");
    return { ok: true };
  }

  if (!validPagePassword(password)) return { ok: false, error: "비밀번호는 4~32자로 정해 주세요." };
  const password_hash = await hashPagePassword(password.trim());
  /* 해시를 먼저 쓰고 locked 를 켠다 — 반대 순서면 잠겼는데 대조할 해시가 없는 찰나가 생긴다(그땐 아무도 못 연다) */
  const { error: upErr } = await supabase
    .from("link_page_secrets")
    .upsert({ page_id: row.id, password_hash, updated_at: new Date().toISOString() }, { onConflict: "page_id" });
  if (upErr) {
    if (/link_page_secrets/i.test(upErr.message) || upErr.code === "42P01") return { ok: false, error: SETTINGS_MIGRATION_MSG };
    console.error("[links] 비밀번호 저장 실패:", upErr.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  const { error } = await patchSettings(row.id, { locked: true });
  if (error) return { ok: false, error: isSettingsColumnError(error) ? SETTINGS_MIGRATION_MSG : "저장하지 못했어요." };
  revalidatePath("/links");
  return { ok: true };
}

/**
 * 받은 내용 전체 — CSV 내려받기용(감사 C13: 화면은 최근 50건인데 CSV 가 "전체"라고 했다).
 * RLS 가 내 페이지 것만 내준다. PostgREST 기본 상한(1000행)을 넘을 수 있어 1000씩 잇는다(최대 20쪽).
 */
export async function exportLeads(pageId?: string): Promise<{ ok: boolean; error?: string; rows?: Array<{ kind: string; name: string; email: string; phone: string; message: string; createdAt: string }> }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 내려받을 수 없어요." };
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };
  const supabase = await createClient();
  const rows: Array<{ kind: string; name: string; email: string; phone: string; message: string; createdAt: string }> = [];
  const PAGE = 1000;
  for (let from = 0; from < PAGE * 20; from += PAGE) {
    const { data, error } = await supabase
      .from("link_leads")
      .select("kind, name, email, phone, message, created_at")
      .eq("page_id", page.id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error: "내려받지 못했어요." };
    const chunk = (data ?? []) as Array<{ kind: string; name: string | null; email: string | null; phone: string | null; message: string | null; created_at: string }>;
    for (const r of chunk) rows.push({ kind: r.kind === "subscribe" ? "구독" : "문의", name: r.name ?? "", email: r.email ?? "", phone: r.phone ?? "", message: r.message ?? "", createdAt: r.created_at });
    if (chunk.length < PAGE) break;
  }
  return { ok: true, rows };
}

export async function updateLinkTheme(theme: string, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  /* 모르는 키가 들어오면 공개 페이지가 기본 테마로 폴백해 "저장은 됐는데 안 바뀌는"
     상태가 된다 — 여기서 막고 알린다. */
  if (themeByKey(theme).key !== theme) return { ok: false, error: "지원하지 않는 테마예요." };

  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };
  const supabase = await createClient();
  const { error } = await supabase.from("link_pages").update({ theme }).eq("id", page.id);
  if (error) {
    console.error("[links] 테마 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function setLinkPublished(published: boolean, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const target = await myPage(pageId);
  if (!target) return { ok: false, error: "프로필 링크가 없어요." };
  const supabase = await createClient();

  /* ⚠️ **먼저 확인하고 나서 바꾼다.** 앞서는 UPDATE 를 하고 나서 스냅샷 없음을
     감지해 에러를 돌려줬는데, 그러면 published 는 이미 true 로 바뀐 뒤라
     "에러가 떴는데 공개는 켜진" 상태가 남았다(그 주소는 방문자에게 404 다). */
  if (published) {
    const { data: cur } = await supabase
      .from("link_pages")
      .select("published_snapshot")
      .eq("id", target.id)
      .maybeSingle();
    if (!cur?.published_snapshot) {
      return { ok: false, error: "먼저 「라이브 반영」을 눌러 지금 편집본을 발행해 주세요." };
    }
  }

  const { data, error } = await supabase
    .from("link_pages")
    .update({ published })
    .eq("id", target.id)
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

export async function deleteLinkPage(pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  /* ⚠️ 반드시 **그 페이지만** 지운다 — user_id 로 지우면 멀티 페이지에서 전부 날아간다(감사4 조사).
     서브 페이지는 FK cascade 로 함께 지워지므로, 그 주소들도 삭제 전에 무덤에 넣는다. */
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };
  let subSlugs: string[] = [];
  const subRes = await supabase.from("link_pages").select("slug").eq("parent_id", page.id);
  if (!subRes.error) subSlugs = ((subRes.data ?? []) as Array<{ slug: string }>).map((r) => r.slug);
  const { error } = await supabase.from("link_pages").delete().eq("id", page.id);
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
    for (const sub of subSlugs) await releaseSlug(sub, null, user.id);
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
  /* 경로가 uuid 라 불변 — 1년 캐시(감사3 C6). 기본 max-age=3600 은 폰에서 매 시간 다시 받게 한다 */
  const { error } = await supabase.storage.from("link-assets").upload(path, buf, {
    cacheControl: "31536000",
    contentType: m[1],
    upsert: false,
  });
  if (error) {
    console.error("[links] 이미지 업로드 실패:", error.message);
    if (/bucket not found|row-level security/i.test(error.message))
      return { ok: false, error: "이미지 올리기는 서버 업데이트(0048) 적용 후 쓸 수 있어요." };
    return { ok: false, error: "업로드하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  const { data } = supabase.storage.from("link-assets").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** 프로필 사진·커버 저장 — 업로드 결과 URL 을 페이지에 붙인다 */
export async function updateLinkImages(patch: { avatarPath?: string | null; coverPath?: string | null }, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  /* 비우기(null/"") 아니면 **이미지로 쓸 수 있는 주소**만 받는다 — 업로드 결과(https 스토리지 URL),
     붙여넣은 http(s) 주소, 같은 오리진 경로. 검증 없이 저장하면 'h' 한 글자 같은 조각이
     avatar_path 로 들어가 캔버스·발행본에 깨진 이미지가 뜬다(감사 #7). */
  const imageHref = (v: string | null | undefined): string | null | false => {
    if (v === null || v === undefined || v.trim() === "") return null;
    const t = v.trim();
    if (t.startsWith("/") && !t.startsWith("//")) return t;
    const href = normalizeUrl(t);
    return href ? href.replace(/^http:\/\//, "https://") : false;
  };
  const fields: Record<string, unknown> = {};
  if (patch.avatarPath !== undefined) {
    const v = imageHref(patch.avatarPath);
    if (v === false) return { ok: false, error: "올바른 이미지 주소가 아니에요. http(s) 로 시작하는 주소를 넣어 주세요." };
    fields.avatar_path = v;
  }
  if (patch.coverPath !== undefined) {
    const v = imageHref(patch.coverPath);
    if (v === false) return { ok: false, error: "올바른 이미지 주소가 아니에요. http(s) 로 시작하는 주소를 넣어 주세요." };
    fields.cover_path = v;
  }
  if (Object.keys(fields).length === 0) return { ok: true };

  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };
  const supabase = await createClient();
  const { error } = await supabase.from("link_pages").update(fields).eq("id", page.id);
  if (error) {
    console.error("[links] 이미지 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

/**
 * 파일 공유 블록 업로드(리틀리 흡수 4단계) — **브라우저가 Storage 로 직접** 올린다(서명 업로드 URL).
 * 서버 액션 본문으로 base64 를 실어 보내면 20MB 가 28MB 로 부풀어 Next 본문 상한(25mb)·Vercel 함수 상한(4.5MB)에
 * 걸려 "업로드하지 못했어요"만 떴다(감사2 C3). 여기선 이름·크기만 검사해 경로·토큰을 내주고, 브라우저가
 * uploadToSignedUrl 로 바이트를 보낸다. 확장자는 **파일 이름**으로 판정한다 — 브라우저 MIME 은 OS 마다 달라
 * (.hwp → "", .csv → vnd.ms-excel) 광고한 형식을 거절했다(감사2 C2). Content-Type 도 서버가 정한 값만 쓴다.
 */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FILE_EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  hwp: "application/x-hwp",
  txt: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
export async function createLinkFileUpload(
  fileName: string,
  size: number,
): Promise<{ ok: boolean; error?: string; path?: string; token?: string; contentType?: string; url?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 올릴 수 없어요." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const nameExt = String(fileName ?? "").toLowerCase().split(".").pop() ?? "";
  const contentType = Object.hasOwn(FILE_EXT_TYPES, nameExt) ? FILE_EXT_TYPES[nameExt] : null;
  if (!contentType) return { ok: false, error: "PDF·ZIP·DOCX·PPTX·XLSX·HWP·TXT·CSV·이미지만 올릴 수 있어요." };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "빈 파일은 올릴 수 없어요." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: "파일은 20MB 이하만 올릴 수 있어요." };
  const ext = nameExt === "jpeg" ? "jpg" : nameExt;
  const path = `${user.id}/files/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("link-assets").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[links] 파일 업로드 URL 실패:", error?.message);
    /* 버킷 없음·정책 미적용은 재시도해도 영원히 실패한다 — 다른 액션들의 계단식 안내 관례(감사4) */
    if (/bucket not found|row-level security/i.test(error?.message ?? ""))
      return { ok: false, error: "파일 올리기는 서버 업데이트(0048) 적용 후 쓸 수 있어요." };
    return { ok: false, error: "업로드를 준비하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  const { data: pub } = supabase.storage.from("link-assets").getPublicUrl(path);
  return { ok: true, path, token: data.token, contentType, url: pub.publicUrl };
}

/**
 * 업로드 뒤 실제 크기 확인 — 서명 URL 은 클라이언트가 보낸 크기만 보고 내줬다. 버킷 상한(0059)이 1차 방어지만
 * 여기서 한 번 더 읽어 상한을 넘긴 객체는 지운다(소넷 점검).
 */
export async function finalizeLinkFileUpload(path: string): Promise<{ ok: boolean; error?: string; size?: number }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 올릴 수 없어요." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  if (typeof path !== "string" || !path.startsWith(`${user.id}/files/`)) return { ok: false, error: "올바르지 않은 경로예요." };
  /* service_role 로 확인한다 — RLS 와 무관하게(0059 전에도) 실제 크기·형식을 본다. 경로 접두사가 이미 본인 폴더로 묶는다(감사3 C2).
     키가 없는 배포(실모드 + SUPABASE_SERVICE_ROLE_KEY 미설정)면 세션 클라이언트로 폴백한다 —
     0059 의 "own link assets read" 정책이 본인 폴더 select 를 허용해 같은 검사가 가능하다.
     이 폴백마저 실패하면 이미 올라간 객체를 지워 고아를 막는다(감사4: 업로드는 성공했는데
     확인만 매번 실패해 재시도마다 고아가 쌓이던 경로). */
  const admin = createAdminClient();
  const store = admin ?? (await createClient());
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: list, error: listErr } = await store.storage.from("link-assets").list(folder, { search: name, limit: 1 });
  const obj = (list ?? []).find((o) => o.name === name) as { metadata?: { size?: number; mimetype?: string } } | undefined;
  if (listErr || !obj) {
    if (!admin) await store.storage.from("link-assets").remove([path]);
    return { ok: false, error: "업로드된 파일을 찾지 못했어요. 다시 시도해 주세요." };
  }
  const size = Number(obj.metadata?.size ?? 0);
  const mime = String(obj.metadata?.mimetype ?? "");
  const ext = name.split(".").pop() ?? "";
  const okMime = Object.hasOwn(FILE_EXT_TYPES, ext) && mime === FILE_EXT_TYPES[ext];
  if (size <= 0 || size > MAX_FILE_BYTES || !okMime) {
    await store.storage.from("link-assets").remove([path]);
    return { ok: false, error: size > MAX_FILE_BYTES ? "파일은 20MB 이하만 올릴 수 있어요." : "허용되지 않는 파일이에요." };
  }
  return { ok: true, size };
}

/* ── 방명록 관리(주인) — 답글·숨김·삭제. 방문자 글 넣기는 app/p/[slug]/actions.ts(service_role) ── */
export async function replyGuestbook(id: number, reply: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  const text = sliceChars(reply.trim(), 500);
  const supabase = await createClient();
  const { data: hit, error } = await supabase
    .from("link_guestbook")
    .update({ reply: text || null, replied_at: text ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("[links] 방명록 답글 실패:", error.message);
    return { ok: false, error: /link_guestbook/i.test(error.message) ? "서버 업데이트(0057) 적용 후 쓸 수 있어요." : "저장하지 못했어요." };
  }
  if (!hit || hit.length === 0) return { ok: false, error: "글을 찾지 못했어요." };
  revalidatePath("/links");
  return { ok: true };
}
export async function setGuestbookHidden(id: number, hidden: boolean): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  const supabase = await createClient();
  const { data: hit, error } = await supabase.from("link_guestbook").update({ hidden }).eq("id", id).select("id");
  if (error) return { ok: false, error: "바꾸지 못했어요." };
  if (!hit || hit.length === 0) return { ok: false, error: "글을 찾지 못했어요." };
  revalidatePath("/links");
  return { ok: true };
}
export async function deleteGuestbook(id: number): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  const supabase = await createClient();
  const { data: hit, error } = await supabase.from("link_guestbook").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: "지우지 못했어요." };
  if (!hit || hit.length === 0) return { ok: false, error: "글을 찾지 못했어요." };
  revalidatePath("/links");
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   블록
   ══════════════════════════════════════════════════════════════════ */

/** 0057(리틀리 흡수 4단계)에서 추가된 타입 — check 위반 시 어느 마이그레이션인지 안내 */
const STAGE4_TYPES = new Set<BlockType>(["gallery", "music", "vcard", "search", "file", "guestbook"]);
/** 타입을 더할 때마다 여기 한 줄이 같이 는다 — 안 늘리면 "0054 적용하세요" 같은 엉뚱한 안내가 나간다(소넷 확정) */
const TYPE_MIGRATION = new Map<BlockType, string>([["events", "0063"]]);
const migrationFor = (type: BlockType) => TYPE_MIGRATION.get(type) ?? (STAGE4_TYPES.has(type) ? "0057" : "0054");

export async function addBlock(type: BlockType, pageId?: string): Promise<Result & { id?: string }> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
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

  /* id 를 되돌려준다 — 실행취소(방금 추가한 블록 삭제)가 대상을 알아야 한다 */
  const { data: created, error } = await supabase
    .from("link_blocks")
    .insert({
      page_id: page.id,
      type,
      data: defaultBlockData(type),
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error) {
    /* 0054(수익화 블록 타입) 미적용 DB — check 위반을 사용자 언어로.
       조용히 "추가하지 못했어요"만 내면 코드 버그처럼 읽힌다(계단식 폴백 관례). */
    if (error.code === "23514" || /link_blocks_type_check/.test(error.message)) {
      const mig = migrationFor(type);
      return { ok: false, error: `이 블록은 서버 업데이트(${mig}) 적용 후 쓸 수 있어요.` };
    }
    console.error("[links] 블록 추가 실패:", error.message);
    return { ok: false, error: "추가하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true, id: (created as { id: string } | null)?.id };
}

/* ══════════════════════════════════════════════════════════════════
   리틀리·인포크 가져오기 — 서버가 밖에 나가는 경로는 이 상수 호스트
   화이트리스트(litt.ly · link.inpock.co.kr)뿐이다
   ══════════════════════════════════════════════════════════════════ */

/** 상수 호스트 페이지의 공용 수신부 — 리틀리·인포크가 같이 쓴다.
    크기 상한·타임아웃·redirect 처리 관문을 두 벌 만들면 반드시 갈린다. */
type BoundedHtml =
  | { kind: "ok"; html: string }
  | { kind: "network" }
  | { kind: "redirect" }
  | { kind: "http" }
  | { kind: "type" }
  | { kind: "toolarge" }
  | { kind: "timeout" }
  | { kind: "read" };

async function fetchBoundedHtml(url: string): Promise<BoundedHtml> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: {
        /* 우리가 누구인지 밝힌다 — robots 를 열어둔 상대에 대한 최소한의 예의다 */
        "user-agent": "Mozilla/5.0 (compatible; FinchImport/1.0; +https://finch.ai.kr)",
        accept: "text/html",
      },
    });
  } catch {
    return { kind: "network" };
  }

  /* 조기 반환 때도 body 를 취소한다 — 안 하면 연결이 GC 까지 붙잡힌다 */
  const drop = () => res.body?.cancel().catch(() => {});

  if (res.status >= 300 && res.status < 400) {
    drop();
    return { kind: "redirect" };
  }
  if (!res.ok) {
    drop();
    return { kind: "http" };
  }
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
    drop();
    return { kind: "type" };
  }

  /* 크기 상한을 걸며 읽는다 — arrayBuffer() 는 상한 없이 다 받는다.
     타임아웃이 본문 수신 도중 터지면 read() 가 reject 하므로 루프 전체를 잡는다. */
  let html = "";
  const reader = res.body?.getReader();
  if (!reader) return { kind: "read" };
  try {
    const decoder = new TextDecoder();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > LITTLY_MAX_BYTES) {
        reader.cancel().catch(() => {});
        return { kind: "toolarge" };
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } catch (e) {
    reader.cancel().catch(() => {});
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { kind: timedOut ? "timeout" : "read" };
  }
  return { kind: "ok", html };
}

/** 리틀리 별칭 형식 — 실측 별칭(start_now_new·client 등)이 전부 이 안에 든다 */
const LITTLY_SLUG_RE = /^[A-Za-z0-9._~-]{1,80}$/;

/** 리틀리 응답 상한 — 실측 페이지가 22~35KB 다. 이걸 넘으면 페이지가 아니라 공격이다 */
const LITTLY_MAX_BYTES = 2 * 1024 * 1024;

/**
 * 리틀리(litt.ly) 페이지에서 링크 후보를 가져온다.
 *
 * **서버가 밖에 나가는 상수 호스트 화이트리스트의 1호다**(2호는 인포크). 일반 URL
 * 가져오기를 만들지 않은 이유(lib/links/index.ts 상단)는 그대로 유효하고,
 * 여기가 예외일 수 있는 근거는 셋이다:
 *  ① 호스트가 **상수**다 — 사용자는 슬러그만 주고 주소는 우리가 조립한다.
 *     DNS 리바인딩·내부망 접근은 공격자가 호스트를 고를 수 있을 때의 위협이다.
 *  ② 리다이렉트를 **따라가지 않는다** — 없는 슬러그는 리틀리가 301 로 홈에
 *     되던지는데(실측), 그게 곧 "못 찾음" 신호다. 3xx 를 내부망으로 트는
 *     고전 우회도 같은 이유로 막힌다.
 *  ③ robots.txt 가 `Allow: /` 다(실측 — 링크트리는 전면 거부라 안 만들었다).
 *
 * 남용(우리를 리틀리 상대 프록시로 쓰기): 로그인 필수 + 호스트 상수 + 응답 상한.
 * 공격자 입장에서는 리틀리를 직접 치는 게 더 싸므로 실익이 없다.
 *
 * 여기서는 **가져오기만** 한다 — 저장은 사용자가 표에서 골라 addBlocksBulk 로.
 * 후보 검증(http 만·중복 제거·추적 파라미터 제거)도 붙여넣기 경로와 같은
 * parsePastedLinks 관문을 클라이언트에서 태운다. 관문을 두 벌 만들면 반드시 갈린다.
 */
export async function importFromLittly(
  raw: string,
): Promise<{ ok: boolean; error?: string; pageTitle?: string | null; links?: Array<{ label: string; url: string }> }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 가져올 수 없어요." };
  const user = await getAuthUser();
  if (!user) return AUTH;

  /* "https://litt.ly/abc", "litt.ly/abc", "abc" 를 모두 받는다.
     다른 도메인 주소가 들어오면 **다른 오류**로 갈라 말한다 — "못 찾았어요"로
     뭉개면 사용자가 리틀리 주소를 계속 다시 붙여넣는다. */
  let input = raw.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (input.includes("/")) {
    const host = input.split("/")[0].toLowerCase();
    if (host !== "litt.ly") {
      return { ok: false, error: "리틀리(litt.ly) 주소만 가져올 수 있어요. 다른 서비스는 페이지를 복사해 위 칸에 붙여넣어 주세요." };
    }
    input = input.slice(host.length + 1);
  }
  const slug = input.split(/[/?#]/)[0];
  /* "litt.ly" 만 넣은 자연스러운 실수 — 404 류 메시지 대신 뭘 빠뜨렸는지 말한다 */
  if (slug.toLowerCase() === "litt.ly") {
    return { ok: false, error: "아이디까지 넣어 주세요 — litt.ly/아이디 형태예요." };
  }
  if (!LITTLY_SLUG_RE.test(slug)) {
    return { ok: false, error: "리틀리 주소가 아니에요. litt.ly/아이디 형태로 넣어 주세요." };
  }

  const fetched = await fetchBoundedHtml(`https://litt.ly/${encodeURIComponent(slug)}`);
  if (fetched.kind !== "ok") {
    /* 없는 슬러그 = 301 홈 리다이렉트(실측) — redirect 가 곧 "못 찾음" 신호다 */
    const msg: Record<Exclude<BoundedHtml["kind"], "ok">, string> = {
      network: "리틀리에 접속하지 못했어요. 잠시 후 다시 시도해 주세요.",
      redirect: "그 주소의 리틀리 페이지를 찾지 못했어요. 아이디를 확인해 주세요.",
      http: "리틀리 페이지를 열지 못했어요. 잠시 후 다시 시도해 주세요.",
      type: "리틀리 페이지 형식을 읽지 못했어요.",
      toolarge: "페이지가 너무 커서 가져올 수 없어요.",
      timeout: "리틀리 응답이 너무 느려요. 잠시 후 다시 시도해 주세요.",
      read: "리틀리 페이지를 읽지 못했어요.",
    };
    return { ok: false, error: msg[fetched.kind] };
  }

  const parsed = parseLittlyHtml(fetched.html);
  if (!parsed) {
    return { ok: false, error: "리틀리 페이지 형식이 바뀐 것 같아요. 페이지를 복사해 위 칸에 붙여넣어 주세요." };
  }
  if (parsed.candidates.length === 0) {
    return { ok: false, error: "그 페이지에서 가져올 링크를 찾지 못했어요." };
  }
  return { ok: true, pageTitle: parsed.pageTitle, links: parsed.candidates };
}

/** 인포크 별칭 형식 */
const INPOCK_SLUG_RE = /^[A-Za-z0-9._-]{1,80}$/;
/** /api/r/ 리다이렉트 해석 동시성 — 한 번에 5개씩 */
const INPOCK_RESOLVE_CHUNK = 5;

/**
 * 인포크링크(link.inpock.co.kr)에서 링크 후보를 가져온다 — 상수 호스트 2호.
 *
 * 리틀리와 같은 예외 근거(2026-08-20 실측):
 *  ① 호스트 상수 — 사용자는 별칭만 주고 주소는 우리가 조립한다.
 *  ② robots.txt 가 프로필 경로를 허용한다(Disallow 는 /admin 뿐).
 *  ③ __NEXT_DATA__ 에 블록이 구조화돼 서버 HTML 만으로 읽힌다.
 *  · 링크가 /api/r/{token} 추적 리다이렉트라, 실제 목적지는 **같은 상수 호스트**에
 *    redirect:"manual" 로 물어 Location 헤더만 읽는다 — 남의 호스트로는 안 나간다.
 *  · 링크트리는 안 만든다: robots 가 User-agent:* Disallow:/ (전면 거부, 재실측 동일).
 */
export async function importFromInpock(
  raw: string,
): Promise<{ ok: boolean; error?: string; pageTitle?: string | null; links?: Array<{ label: string; url: string }> }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 가져올 수 없어요." };
  const user = await getAuthUser();
  if (!user) return AUTH;

  let input = raw.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (input.includes("/")) {
    const host = input.split("/")[0].toLowerCase();
    if (host !== "link.inpock.co.kr" && host !== "inpock.co.kr") {
      return { ok: false, error: "인포크(link.inpock.co.kr) 주소만 가져올 수 있어요." };
    }
    input = input.slice(input.indexOf("/") + 1);
  }
  const slug = input.split(/[/?#]/)[0];
  if (!slug || slug.toLowerCase() === "link.inpock.co.kr") {
    return { ok: false, error: "아이디까지 넣어 주세요 — link.inpock.co.kr/아이디 형태예요." };
  }
  if (!INPOCK_SLUG_RE.test(slug)) {
    return { ok: false, error: "인포크 주소가 아니에요. link.inpock.co.kr/아이디 형태로 넣어 주세요." };
  }

  const fetched = await fetchBoundedHtml(`https://link.inpock.co.kr/${encodeURIComponent(slug)}`);
  if (fetched.kind !== "ok") {
    const msg: Record<Exclude<BoundedHtml["kind"], "ok">, string> = {
      network: "인포크에 접속하지 못했어요. 잠시 후 다시 시도해 주세요.",
      redirect: "그 주소의 인포크 페이지를 찾지 못했어요. 아이디를 확인해 주세요.",
      http: "인포크 페이지를 열지 못했어요. 잠시 후 다시 시도해 주세요.",
      type: "인포크 페이지 형식을 읽지 못했어요.",
      toolarge: "페이지가 너무 커서 가져올 수 없어요.",
      timeout: "인포크 응답이 너무 느려요. 잠시 후 다시 시도해 주세요.",
      read: "인포크 페이지를 읽지 못했어요.",
    };
    return { ok: false, error: msg[fetched.kind] };
  }

  const parsed = parseInpockHtml(fetched.html);
  if (!parsed) {
    return { ok: false, error: "인포크 페이지 형식이 바뀐 것 같아요. 페이지를 복사해 위 칸에 붙여넣어 주세요." };
  }
  if (parsed.notFound) {
    return { ok: false, error: "그 주소의 인포크 페이지를 찾지 못했어요. 아이디를 확인해 주세요." };
  }

  /* /api/r/{token} 은 인포크의 클릭 추적 리다이렉트다 — 같은 호스트에 물어
     Location 으로 바꾼다. 해석 실패·인포크 안으로 되도는 링크(다른 인포크 페이지)는
     버린다: 이사 나가는 사용자에게 옛집 의존 링크를 심으면 안 된다. */
  const out: Array<{ label: string; url: string }> = [];
  const rel: Array<{ label: string; url: string }> = [];
  for (const c of parsed.candidates) {
    if (/^https?:\/\//i.test(c.url)) out.push(c);
    else if (c.url.startsWith("/api/r/")) rel.push(c);
  }
  for (let i = 0; i < rel.length; i += INPOCK_RESOLVE_CHUNK) {
    const chunk = rel.slice(i, i + INPOCK_RESOLVE_CHUNK);
    const resolved = await Promise.all(
      chunk.map(async (c) => {
        try {
          const r = await fetch(`https://link.inpock.co.kr${c.url}`, {
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
            headers: { "user-agent": "Mozilla/5.0 (compatible; FinchImport/1.0; +https://finch.ai.kr)" },
          });
          r.body?.cancel().catch(() => {});
          const loc = r.headers.get("location");
          if (r.status >= 300 && r.status < 400 && loc && /^https?:\/\//i.test(loc)) {
            const locHost = new URL(loc).hostname.toLowerCase();
            /* 정확한 도메인 경계 — 접미사 매칭이면 무관한 *inpock.co.kr 류도 버려진다 */
            if (locHost === "inpock.co.kr" || locHost.endsWith(".inpock.co.kr")) return null;
            return { label: c.label, url: loc };
          }
        } catch {
          /* 한 개 실패가 전체를 무너뜨리지 않는다 — 그 링크만 버린다 */
        }
        return null;
      }),
    );
    for (const done of resolved) if (done) out.push(done);
  }

  if (out.length === 0) {
    return { ok: false, error: "그 페이지에서 가져올 링크를 찾지 못했어요." };
  }
  return { ok: true, pageTitle: parsed.pageTitle, links: out };
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
  pageId?: string,
): Promise<Result & { added?: number }> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
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
  const supabase = await createClient();
  if (patch.data !== undefined) {
    /* URL 이 들어 있는 필드는 전부 정규화·검증한다. javascript: 를 그대로 두면
       공개 페이지의 <a href> 가 방문자 브라우저에서 그걸 실행한다(저장형 XSS). */
    const cleaned = sanitizeBlockData(patch.data);
    if (cleaned.error || !cleaned.data) return { ok: false, error: cleaned.error ?? "저장하지 못했어요." };
    /* 강조·예약(메타)은 편집기 draft 가 아니라 **행의 현재 값**을 따른다 — 행을 펼친 뒤 ★ 를 켜고
       저장하면 오래된 draft 가 메타를 지워 버렸다(소넷 확정 1). 메타는 전용 액션만 바꾼다. */
    const { data: row } = await supabase.from("link_blocks").select("data").eq("id", id).maybeSingle();
    const current = (row?.data ?? {}) as Record<string, unknown>;
    for (const k of BLOCK_META_KEYS) {
      if (k in current) cleaned.data[k] = current[k];
      else delete cleaned.data[k];
    }
    fields.data = cleaned.data;
  }
  if (patch.active !== undefined) fields.active = patch.active;
  if (Object.keys(fields).length === 0) return { ok: true };

  /* RLS 가 "내 페이지의 블록만"을 이미 강제한다(0048). id 만으로도 남의 것은 0행 매치.
     ⚠️ 0행은 **명시적으로 실패**시킨다 — 삭제→복원으로 id 가 바뀐 블록을 옛 id 로 치는
     실행취소가 "되돌렸어요" 라고 거짓말하지 않도록(감사 #8). 정렬 undo 와 같은 계약. */
  const { data: hit, error } = await supabase.from("link_blocks").update(fields).eq("id", id).select("id");
  if (error) {
    console.error("[links] 블록 수정 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  if (!hit || hit.length === 0) {
    revalidatePath("/links");
    return { ok: false, error: "블록을 찾지 못했어요. 화면을 새로고침해 주세요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function deleteBlock(id: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { data: hit, error } = await supabase.from("link_blocks").delete().eq("id", id).select("id");
  if (error) {
    console.error("[links] 블록 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  if (!hit || hit.length === 0) {
    revalidatePath("/links");
    return { ok: false, error: "블록을 찾지 못했어요. 화면을 새로고침해 주세요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

/* ── 블록 공통 기능(리틀리 흡수 1단계): 강조 · 예약 공개 · 복사 ── */

/**
 * 강조(하단 고정 CTA) — 페이지당 **하나**. 켜면 다른 블록의 강조를 지운다.
 * 읽고-바꾸고-쓰기(서버 값 기준) — 클라이언트 draft 와 섞이지 않게 data 의 그 키만 만진다.
 */
export async function setBlockEmphasized(id: string, on: boolean, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };
  const supabase = await createClient();
  const { data: rows, error: readErr } = await supabase.from("link_blocks").select("id, type, data").eq("page_id", page.id);
  if (readErr || !rows) return { ok: false, error: "블록을 읽지 못했어요." };
  const target = rows.find((r) => r.id === id);
  if (!target) return { ok: false, error: "블록을 찾지 못했어요. 화면을 새로고침해 주세요." };
  if (on && !EMPHASIS_TYPES.includes(target.type as BlockType)) {
    return { ok: false, error: "강조는 링크·상품·후원 블록만 할 수 있어요." };
  }
  const strip = (d: unknown) => {
    const o = { ...((d ?? {}) as Record<string, unknown>) };
    delete o.emphasized;
    return o;
  };
  for (const r of rows) {
    const cur = (r.data ?? {}) as Record<string, unknown>;
    const wantOn = on && r.id === id;
    if (cur.emphasized === true && !wantOn) {
      const { error } = await supabase.from("link_blocks").update({ data: strip(cur) }).eq("id", r.id);
      if (error) {
        console.error("[links] 강조 해제 실패:", error.message);
        revalidatePath("/links");
        return { ok: false, error: "강조를 바꾸지 못했어요." };
      }
    } else if (wantOn && cur.emphasized !== true) {
      const { error } = await supabase.from("link_blocks").update({ data: { ...cur, emphasized: true } }).eq("id", r.id);
      if (error) {
        console.error("[links] 강조 설정 실패:", error.message);
        revalidatePath("/links");
        return { ok: false, error: "강조를 바꾸지 못했어요." };
      }
    }
  }
  revalidatePath("/links");
  return { ok: true };
}

/** 예약 공개·숨김 — 둘 다 null 이면 예약 해제. 공개 페이지는 요청 시점에 판정한다 */
export async function setBlockSchedule(id: string, openAt: string | null, closeAt: string | null): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  const parse = (v: string | null): string | null | false => {
    if (v === null || v === "") return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? false : new Date(t).toISOString();
  };
  const o = parse(openAt);
  const c = parse(closeAt);
  if (o === false || c === false) return { ok: false, error: "잘못된 날짜예요." };
  if (o && c && Date.parse(o) >= Date.parse(c)) return { ok: false, error: "숨김 날짜는 공개 날짜보다 뒤여야 해요." };
  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase.from("link_blocks").select("id, data").eq("id", id).maybeSingle();
  if (readErr || !row) return { ok: false, error: "블록을 찾지 못했어요. 화면을 새로고침해 주세요." };
  const next = { ...((row.data ?? {}) as Record<string, unknown>) };
  if (o) next.openAt = o;
  else delete next.openAt;
  if (c) next.closeAt = c;
  else delete next.closeAt;
  const { error } = await supabase.from("link_blocks").update({ data: next }).eq("id", id);
  if (error) {
    console.error("[links] 예약 설정 실패:", error.message);
    return { ok: false, error: "예약을 저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

/** 블록 복사 — 바로 아래에 같은 내용으로. 강조·예약은 복사하지 않는다(강조는 하나뿐, 예약은 의도가 다를 수 있다) */
export async function duplicateBlock(id: string, pageId?: string): Promise<Result & { id?: string }> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };
  const supabase = await createClient();
  const { data: rows, error: readErr } = await supabase
    .from("link_blocks")
    .select("id, type, data, sort_order, active")
    .eq("page_id", page.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (readErr || !rows) return { ok: false, error: "블록을 읽지 못했어요." };
  if (rows.length >= MAX_BLOCKS) return { ok: false, error: `블록은 ${MAX_BLOCKS}개까지예요.` };
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { ok: false, error: "블록을 찾지 못했어요. 화면을 새로고침해 주세요." };
  const src = rows[i];
  const data = { ...((src.data ?? {}) as Record<string, unknown>) };
  delete data.emphasized;
  delete data.openAt;
  delete data.closeAt;
  /* 목표 순서: 원본 바로 뒤. 먼저 끼워 넣고 0..n-1 로 다시 쓴다(moveBlock 과 같은 루프) */
  const { data: created, error } = await supabase
    .from("link_blocks")
    .insert({ page_id: page.id, type: src.type, data, sort_order: i + 1, active: src.active })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[links] 블록 복사 실패:", error?.message);
    return { ok: false, error: "복사하지 못했어요." };
  }
  const newId = created.id as string;
  const ids = rows.map((r) => r.id as string);
  ids.splice(i + 1, 0, newId);
  for (let k = 0; k < ids.length; k++) {
    const cur = rows.find((r) => r.id === ids[k]);
    if (cur ? cur.sort_order === k : k === i + 1) continue;
    const { error: e2 } = await supabase.from("link_blocks").update({ sort_order: k }).eq("id", ids[k]);
    if (e2) {
      console.error("[links] 복사 후 정렬 실패:", e2.message);
      break;
    }
  }
  revalidatePath("/links");
  return { ok: true, id: newId };
}

/**
 * 지운 블록을 되살린다 — 삭제 직후 「되돌리기」 한 번의 범위다.
 *
 * 전체 undo 스택을 만들지 않는 이유: 모든 변경이 이미 DB 에 커밋되는 구조라
 * 역방향 액션을 조작마다 새로 만들어야 하는데, 실수의 대부분은 "잘못 지웠다"다.
 * 삭제 확인 + 이 되돌리기로 그 실수를 막고, 나머지는 draft/발행 분리가 안전망이다.
 *
 * id 는 새로 나온다(옛 id 는 이미 지워졌다). 통계의 block_id 는 스냅샷에 굳은
 * id 를 가리키므로(0049) 다음 발행 때 자연히 새 id 로 이어진다.
 */
export async function restoreBlock(input: {
  type: BlockType;
  data: Record<string, unknown>;
  sortOrder: number;
  active: boolean;
}, pageId?: string): Promise<Result & { id?: string }> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };

  /* 클라이언트가 들고 있던 값이지만 원래 서버에서 나간 값이다 — 그래도 관문은
     그대로 태운다. 여기서만 건너뛰면 이 경로가 검증 우회 통로가 된다. */
  if (!BLOCK_TYPES.includes(input.type)) return { ok: false, error: "되살릴 수 없는 블록이에요." };
  const cleaned = sanitizeBlockData(input.data ?? {});
  if (cleaned.error) return { ok: false, error: cleaned.error };

  const supabase = await createClient();
  const { count } = await supabase
    .from("link_blocks")
    .select("id", { count: "exact", head: true })
    .eq("page_id", page.id);
  if ((count ?? 0) >= MAX_BLOCKS) {
    return { ok: false, error: `블록은 ${MAX_BLOCKS}개까지예요.` };
  }

  const sortOrder = Number.isInteger(input.sortOrder) && input.sortOrder >= 0 ? input.sortOrder : 0;
  /* id 를 되돌려준다 — 「삭제 실행취소 → 다시실행」이 복원된 새 행을 지워야 한다 */
  const { data: created, error } = await supabase
    .from("link_blocks")
    .insert({
      page_id: page.id,
      type: input.type,
      data: cleaned.data,
      sort_order: sortOrder,
      active: !!input.active,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[links] 블록 복원 실패:", error.message);
    return { ok: false, error: "되살리지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true, id: (created as { id: string } | null)?.id };
}

/**
 * 드래그 정렬 — id 블록을 beforeId 앞으로(null 이면 맨 뒤로) 옮긴다.
 *
 * moveBlock(한 칸)과 달리 시퀀스 전체를 다시 쓴다: 목표 순서를 만든 뒤
 * sort_order 가 달라진 행만 갱신한다. 트랜잭션이 아니라 중간 실패가 가능하지만,
 * 모든 조회가 (sort_order, created_at) 복합 정렬이라 순서는 항상 정의되고
 * 같은 드래그를 다시 하면 복구된다.
 */
export async function reorderBlock(id: string, beforeId: string | null, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("link_blocks")
    .select("id, sort_order")
    .eq("page_id", page.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const list = (rows ?? []) as Array<{ id: string; sort_order: number }>;
  const ids = list.map((x) => x.id);
  const from = ids.indexOf(id);
  if (from < 0) return { ok: false, error: "블록을 찾지 못했어요." };
  /* 자기 앞에 놓기 = 제자리. 걸러내지 않으면 splice(-1) 이 끝에서 두 번째로 보낸다(감사 L4) */
  if (beforeId === id) return { ok: true };
  /* 드롭 기준 블록이 그 사이 지워졌으면(다른 탭 등) 조용히 엉뚱한 자리로 넣지 않는다 */
  if (beforeId !== null && !ids.includes(beforeId)) {
    return { ok: false, error: "순서를 바꾸지 못했어요. 화면을 새로고침해 주세요." };
  }

  ids.splice(from, 1);
  const at = beforeId === null ? ids.length : ids.indexOf(beforeId);
  if (at < 0) return { ok: false, error: "순서를 바꾸지 못했어요. 화면을 새로고침해 주세요." };
  ids.splice(at, 0, id);

  /* 목표 순서 = 0..n-1. 달라진 행만 쓴다 — 대부분의 드래그는 소수 행만 움직인다 */
  for (let i = 0; i < ids.length; i++) {
    const cur = list.find((x) => x.id === ids[i]);
    if (!cur || cur.sort_order === i) continue;
    const { error } = await supabase.from("link_blocks").update({ sort_order: i }).eq("id", ids[i]);
    if (error) {
      console.error("[links] 드래그 정렬 실패:", error.message);
      /* 앞선 행 일부는 이미 커밋됐다 — revalidate 없이 돌아가면 클라이언트가
         드래그 전 상태를 그리고 DB 는 반쯤 섞인 상태로 남아 3중으로 어긋난다
         (소넷 확정 1). 실패해도 서버의 실제 순서를 다시 내려보낸다. */
      revalidatePath("/links");
      return { ok: false, error: "순서를 바꾸지 못했어요." };
    }
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function moveBlock(id: string, dir: "up" | "down", pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
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

  /* 값을 맞바꾸지 않고 **목표 순서 0..n-1 로 다시 쓴다**(reorderBlock 과 같은 루프).
     값 스왑은 두 행의 sort_order 가 같을 때(복원 블록이 옛 번호를 그대로 들고 들어오면 생긴다)
     아무것도 안 바뀌는데 ok 를 돌려줘 "옮겼어요" 와 undo 엔트리가 거짓으로 남았다(감사 #20). */
  const ids = list.map((x) => x.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (let k = 0; k < ids.length; k++) {
    const cur = list.find((x) => x.id === ids[k]);
    if (!cur || cur.sort_order === k) continue;
    const { error } = await supabase.from("link_blocks").update({ sort_order: k }).eq("id", ids[k]);
    if (error) {
      console.error("[links] 순서 이동 실패:", error.message);
      /* 일부 행은 이미 커밋됐다 — 서버의 실제 순서를 다시 내려보낸다 */
      revalidatePath("/links");
      return { ok: false, error: "순서를 바꾸지 못했어요." };
    }
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
export async function applyTemplate(key: string, pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };

  const tpl = LINK_TEMPLATES.find((t) => t.key === key);
  if (!tpl) return { ok: false, error: "없는 템플릿이에요." };

  const supabase = await createClient();
  /* 순서가 중요하다: **먼저 넣고, 나중에 지운다** (트랜잭션이 없다).
     지우고 나서 넣다가 실패하면 사용자 블록이 통째로 날아가고 되살릴 길이 없다(감사 #3).
     넣기가 실패하면 옛 블록은 손대지 않은 채 그대로다. */
  const { data: oldRows, error: listErr } = await supabase.from("link_blocks").select("id").eq("page_id", page.id);
  if (listErr) {
    console.error("[links] 템플릿 적용(기존 조회) 실패:", listErr.message);
    return { ok: false, error: "적용하지 못했어요." };
  }
  const oldIds = (oldRows ?? []).map((r) => r.id as string);

  const rows = tpl.blocks.map((b, i) => ({
    page_id: page.id,
    type: b.type,
    data: b.data,
    sort_order: i,
  }));
  const { data: inserted, error } = await supabase.from("link_blocks").insert(rows).select("id");
  if (error) {
    console.error("[links] 템플릿 적용 실패:", error.message);
    return { ok: false, error: "적용하지 못했어요." };
  }

  if (oldIds.length) {
    const { error: delErr } = await supabase.from("link_blocks").delete().in("id", oldIds);
    if (delErr) {
      console.error("[links] 템플릿 적용(기존 삭제) 실패 — 새 블록 되돌림:", delErr.message);
      /* 새 블록만 걷어내 원상 복구. 그래도 실패하면 revalidate 로 실제 DB 상태를 내려보낸다 */
      const newIds = (inserted ?? []).map((r) => r.id as string);
      if (newIds.length) await supabase.from("link_blocks").delete().in("id", newIds);
      revalidatePath("/links");
      return { ok: false, error: "적용하지 못했어요. 화면을 새로고침해 주세요." };
    }
  }

  /* 템플릿마다 어울리는 테마가 있다 — 블록만 바뀌고 테마가 그대로면 의도한 인상이 안 난다.
     직접 꾸미기도 함께 비운다(0056 미적용이면 컬럼 없이 재시도). */
  let themed = await supabase.from("link_pages").update({ theme: tpl.theme, theme_custom: null }).eq("id", page.id);
  if (themed.error && /theme_custom/i.test(themed.error.message)) {
    themed = await supabase.from("link_pages").update({ theme: tpl.theme }).eq("id", page.id);
  }
  /* ⚠️ 여기서 error 를 삼키면 블록만 바뀌고 테마는 그대로인데 "적용했어요"가 뜬다 */
  if (themed.error) {
    console.error("[links] 템플릿 테마 저장 실패:", themed.error.message);
    revalidatePath("/links");
    return { ok: false, error: "블록은 바뀌었지만 테마를 적용하지 못했어요. 테마 탭에서 다시 골라 주세요." };
  }

  revalidatePath("/links");
  return { ok: true };
}

/**
 * 초안을 마지막 발행본으로 되돌린다(발행한 적 없으면 블록만 비운다 — 프로필은 유지).
 * 2026-08-24 사장님 지시: "저장(라이브 반영)하지 않으면 남지 않는다" — 편집 되돌리기 버튼과
 * 나가기 폐기(모달·pagehide 비콘)가 전부 이 함수를 탄다.
 * 순서는 applyTemplate 과 같다: **넣고 나서 지운다**(중간 실패에도 유실 없음).
 * 복원 후 published_snapshot 을 같은 값으로 다시 써서 발행 스탬프를 맞춘다 — 안 하면
 * updated_at 만 앞서서 방금 되돌린 페이지가 곧바로 「초안 수정됨」으로 읽힌다.
 */
export async function revertLinkDraft(pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;
  const page = await myPage(pageId);
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("link_pages")
    .select("published_snapshot")
    .eq("id", page.id)
    .maybeSingle();
  if (readErr || !row) return { ok: false, error: "되돌리지 못했어요." };
  const snap = (row.published_snapshot ?? null) as Record<string, unknown> | null;

  const { data: draftRows, error: listErr } = await supabase
    .from("link_blocks")
    .select("id, active")
    .eq("page_id", page.id);
  if (listErr) return { ok: false, error: "되돌리지 못했어요." };
  const draft = (draftRows ?? []) as Array<{ id: string; active: boolean }>;

  const rawSnapBlocks = snap && Array.isArray((snap as { blocks?: unknown }).blocks)
    ? ((snap as { blocks: unknown[] }).blocks)
    : [];
  const snapBlocks = rawSnapBlocks.filter(
    (b): b is { id: string; type: string; data?: Record<string, unknown> } =>
      !!b && typeof b === "object" && typeof (b as { id?: unknown }).id === "string" && typeof (b as { type?: unknown }).type === "string",
  );
  const snapIds = new Set(snapBlocks.map((b) => b.id));

  /* ① 스냅샷 블록을 **같은 id 로** 되돌린다(upsert) — 지우고 새로 넣으면 id 가 바뀌어
        그 블록에 쌓인 클릭 집계가 이름 없는 과거 기록으로 끊긴다. 발행 당시 켜져 있었으므로
        active=true 로 돌린다(발행 뒤에 숨긴 블록도 스냅샷 상태로 복귀). */
  if (snapBlocks.length) {
    const rows = snapBlocks.map((b, i) => ({
      id: b.id,
      page_id: page.id,
      type: b.type,
      data: b.data ?? {},
      sort_order: i,
      active: true,
    }));
    const { error } = await supabase.from("link_blocks").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("[links] 되돌리기(블록 복원) 실패:", error.message);
      return { ok: false, error: "되돌리지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
  }

  /* ② 스냅샷에 없는 블록 = 발행 뒤에 추가한 것 → 지운다.
        ⚠️ **숨긴 블록(active=false)은 남긴다.** 발행은 켜진 블록만 담으므로 숨긴 블록은
        애초에 스냅샷에 없다 — 함께 지우면 몇 달 전에 숨겨둔 블록이 "오늘 편집 취소"에
        휩쓸려 복구 불가로 사라진다(소넷 확정, 데이터 유실). 공개 페이지엔 영향이 없다. */
  const toDelete = draft.filter((r) => !snapIds.has(r.id) && r.active).map((r) => r.id);
  if (toDelete.length) {
    const { error: delErr } = await supabase.from("link_blocks").delete().in("id", toDelete);
    if (delErr) {
      console.error("[links] 되돌리기(추가 블록 삭제) 실패:", delErr.message);
      return { ok: false, error: "되돌리지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
  }

  if (snap) {
    const sv = (k: string): string | null => (typeof snap[k] === "string" ? (snap[k] as string) : null);
    const { error: profErr } = await supabase
      .from("link_pages")
      .update({
        title: sv("title") ?? "",
        bio: sv("bio") ?? "",
        /* 기본값은 컬럼 기본값·publishLinkPage 폴백과 같은 "profile" 이어야 한다 —
           "list" 는 페이지 레이아웃 열거값에 아예 없는 값이다(소넷 확정) */
        layout: sv("layout") ?? "profile",
        theme: sv("theme") ?? DEFAULT_THEME_KEY,
        align: sv("align") ?? "center",
        avatar_path: sv("avatarPath"),
        cover_path: sv("coverPath"),
        sns_links: Array.isArray(snap.snsLinks) ? snap.snsLinks : [],
        sns_placement: sv("snsPlacement") ?? "profile",
        title_size: sv("titleSize") ?? "md",
        theme_custom: snap.themeCustom && typeof snap.themeCustom === "object" ? snap.themeCustom : null,
      })
      .eq("id", page.id);
    /* ⚠️ 프로필 복원이 실패하면 **스탬프를 찍지 않고 멈춘다.** 스탬프만 찍히면
       updated_at == published_at 이라 화면이 「최신」으로 읽히는데 프로필은 되돌려지지
       않은 옛 값이다 — 그 상태로 나중에 발행하면 옛 프로필이 라이브에 굳는다(소넷 확정 HIGH).
       블록은 이미 되돌아갔고 이 함수는 다시 불러도 같은 결과다(멱등) — 사용자에게 알리고 끝낸다. */
    if (profErr) {
      console.error("[links] 되돌리기(프로필 복원) 실패:", profErr.message);
      return { ok: false, error: "되돌리지 못했어요. 잠시 후 다시 시도해 주세요." };
    }

    /* 발행 스탬프 정렬 — 0049 트리거는 published_snapshot 이 **달라졌을 때만** published_at 을
       찍는다. 읽은 값을 그대로 다시 쓰면 jsonb 가 동일해 스탬프가 안 찍히고, 그 사이
       updated_at 만 올라가 되돌린 직후 다시 「초안 수정됨」이 된다(소넷 확정).
       되돌린 시각을 스냅샷에 남겨 실제로 다른 값을 쓴다 — 공개 렌더러는 모르는 키를 무시한다. */
    const stamped = { ...snap, revertedAt: new Date().toISOString() };
    const { error: stampErr } = await supabase.from("link_pages").update({ published_snapshot: stamped }).eq("id", page.id);
    if (stampErr) {
      /* 되돌리기 자체는 끝났다 — 상태 표시만 「초안 수정됨」으로 남는다. 조용히 넘기지 않고 말한다 */
      console.error("[links] 되돌리기(스탬프 정렬) 실패:", stampErr.message);
      revalidatePath("/links");
      return { ok: false, error: "되돌렸지만 발행 상태 표시를 갱신하지 못했어요. 새로고침해 주세요." };
    }
  }

  revalidatePath("/links");
  revalidatePath(`/p/${page.slug}`);
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   라이브 반영 — 초안을 공개 스냅샷으로 굽는다
   ══════════════════════════════════════════════════════════════════ */

export async function publishLinkPage(pageId?: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const target = await myPage(pageId);
  if (!target) return { ok: false, error: "프로필 링크가 없어요." };
  const supabase = await createClient();
  const PUB_COLS =
    "id, slug, title, bio, layout, theme, align, avatar_path, cover_path, sns_links, sns_placement, title_size, seo_title, seo_desc";
  /* theme_custom(0056) 계단식 — 미적용 DB 면 컬럼 없이(스냅샷엔 null 로 굳는다) */
  let pageRes = await supabase.from("link_pages").select(`${PUB_COLS}, theme_custom`).eq("id", target.id).maybeSingle();
  if (pageRes.error && /theme_custom/i.test(pageRes.error.message)) {
    pageRes = await supabase.from("link_pages").select(PUB_COLS).eq("id", target.id).maybeSingle();
  }
  const page = pageRes.data as (Record<string, unknown> & { id: string }) | null;
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
    /* 직접 꾸미기도 함께 굳는다 — 발행본이 초안과 같은 모습이어야 한다 */
    themeCustom: sanitizeThemeCustom(page.theme_custom),
    align: page.align ?? "center",
    avatarPath: page.avatar_path ?? null,
    coverPath: page.cover_path ?? null,
    /* 굽는 시점에 한 번 더 거른다 — 공개 페이지도 같은 관문을 태운다 */
    snsLinks: sanitizeSnsLinks(page.sns_links),
    snsPlacement: (page.sns_placement as string) ?? "profile",
    titleSize: (page.title_size as string) ?? "md",
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
    .eq("id", target.id);
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
  /* 일정 — 날짜는 "2026-09-01T20:00" 16자면 충분하다. 형식 검증은 렌더러의 parseEventAt 이 한다
     (여기서 거절하면 저장 도중의 반쯤 친 날짜가 오류로 튄다 — 잘못된 값은 조용히 안 보이는 게 낫다) */
  startAt: 16,
  endAt: 16,
  place: 40,
  emoji: 4,
  price: 40,
  originalPrice: 20,
  message: 140,
  placeholder: 40,
  fileName: 120,
  name: 60,
  phone: 60,
  email: 160,
  org: 60,
  role: 60,
  website: 200,
};
const ENUMS: Record<string, readonly string[]> = {
  emphasis: ["normal", "primary", "outline"],
  /* layout 은 타입마다 의미가 다르다(link: button/small/medium/large, card_row: list/carousel) — 렌더러가 제 것만 읽는다 */
  layout: ["button", "small", "medium", "large", "list", "carousel", "grid", "slide", "masonry"],
  aspect: ["square", "intrinsic"],
  textSize: ["sm", "md", "lg"],
  textWeight: ["medium", "semibold", "bold"],
  align: ["left", "center"],
  style: ["line", "dot"],
  tone: ["info", "primary", "warning"],
  channel: ["instagram", "tiktok", "threads"],
  /* 일정 — 지난 일정 처리. 모르는 값이면 키를 빼서 렌더러 기본값(hide)으로 떨어진다 */
  past: ["hide", "dim"],
};
/** 숫자 필드는 화이트리스트다 — spacer.size 는 렌더러가 그 값을 그대로 px 높이로 쓴다 */
const NUM_ENUMS: Record<string, readonly number[]> = {
  size: [8, 16, 24, 40],
  collapse: [0, 2, 3, 4, 6],
  columns: [2, 3],
  count: [3, 6, 9],
};
/** 스냅샷 한 블록의 상한(문자 수). 넘으면 공개 페이지 첫 바이트가 눈에 띄게 느려진다 */
const MAX_BLOCK_CHARS = 8192;

const URL_ERROR = "http 또는 https 로 시작하는 주소만 넣을 수 있어요.";

/* ══════════════════════════════════════════════════════════════════
   주소로 제목·이미지 불러오기 (OG) — 리틀리 「그룹 링크」의 자동 채움 카피(2단계)

   lib/links/index.ts 가 "서버가 남의 URL 을 fetch 하지 않는다" 고 정한 데 대한 **유일한 예외**다.
   그 주석이 요구한 방식으로만 연다: lib/links/safe-fetch.ts 가 node:http(s) + 커스텀 lookup 으로
   소켓이 붙을 IP 를 직접 고르고 검사한다(DNS 리바인딩 무력화). global fetch 는 쓰지 않는다.
   ══════════════════════════════════════════════════════════════════ */

/** 사용자별 분당 호출 상한 — 인스턴스 메모리라 서버리스에선 최선의 노력. 로그인 사용자만 부를 수 있다 */
const metaCalls = new Map<string, number[]>();
const META_PER_MIN = 20;
function metaRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (metaCalls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= META_PER_MIN) return true;
  recent.push(now);
  metaCalls.set(userId, recent);
  return false;
}

export async function fetchLinkMeta(raw: string): Promise<{
  ok: boolean;
  error?: string;
  title?: string;
  image?: string;
  description?: string;
}> {
  if (isDemoMode()) return { ok: false, error: "예시 페이지에서는 불러올 수 없어요." };
  const user = await getAuthUser();
  if (!user) return AUTH;
  if (metaRateLimited(user.id)) return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  const href = normalizeUrl(raw);
  if (!href) return { ok: false, error: URL_ERROR };

  let page: { url: URL; html: string };
  try {
    page = await fetchPublicHtml(new URL(href));
  } catch (e) {
    const code = e instanceof SafeFetchError ? e.message : "";
    const msg = code.startsWith("status:")
      ? `페이지를 열지 못했어요 (${code.slice(7)}).`
      : code === "private" || code === "scheme" || code === "port"
        ? "불러올 수 없는 주소예요."
        : code === "not-html"
          ? "웹 페이지가 아니라 제목을 읽을 수 없어요."
          : code === "timeout"
            ? "응답이 너무 느려요. 잠시 후 다시 시도해 주세요."
            : "주소에 연결하지 못했어요.";
    return { ok: false, error: msg };
  }
  const { url, html } = page;

  const meta = (prop: string): string | null => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
    const tag = re.exec(html)?.[0];
    if (!tag) return null;
    const c = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    return c ? decodeEntities(c).trim() : null;
  };
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  const title = sliceChars(meta("og:title") ?? (titleTag ? decodeEntities(titleTag).trim() : ""), 60);
  const description = sliceChars(meta("og:description") ?? meta("description") ?? "", 80);
  let image = meta("og:image") ?? meta("twitter:image") ?? "";
  if (image) {
    try {
      const abs = new URL(image, url);
      image = abs.protocol === "http:" || abs.protocol === "https:" ? abs.toString().replace(/^http:\/\//, "https://") : "";
    } catch {
      image = "";
    }
  }
  if (!title && !image) return { ok: false, error: "이 페이지에서는 제목·이미지를 찾지 못했어요." };
  return { ok: true, title: title || undefined, image: image || undefined, description: description || undefined };
}

function decodeEntities(t: string): string {
  return t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ");
}

function sanitizeBlockData(input: Record<string, unknown>): { data?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(input)) {
    /* cached 는 「라이브 반영」이 채우는 서버 생성 값이다. 클라이언트가 보낸 걸 그대로
       두면 연동하지 않은 계정의 썸네일·링크를 스냅샷에 심을 수 있다 — 발행 때 다시 채운다. */
    if (k === "cached") continue;

    if (k === "openAt" || k === "closeAt") {
      /* 예약 공개·숨김 — 날짜로 읽히는 문자열만, ISO 로 정규화. 공개 페이지가 요청 시점에 비교한다 */
      if (typeof v === "string" && v.trim() && !Number.isNaN(Date.parse(v))) out[k] = new Date(v).toISOString();
      continue;
    }
    if (k === "emphasized") {
      if (v === true) out[k] = true; // false 는 키 자체를 없앤다 — "없음" 이 기본
      continue;
    }

    if (k === "textColor") {
      /* 색은 #rrggbb 만 — 임의 문자열이 공개 페이지 inline style 로 나가면 안 된다 */
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v;
      continue;
    }

    if (k === "url" || k === "imagePath") {
      if (typeof v !== "string" || !v.trim()) continue;
      const href = normalizeUrl(v);
      if (!href) return { error: URL_ERROR };
      /* 이미지는 우리 문서 안에서 로드된다 — CSP img-src 가 https: 뿐이라 http 는 깨진다.
         링크(url)는 302 로 나가니 http 여도 되지만 이미지는 https 로 올려 저장한다(감사 #23). */
      out[k] = k === "imagePath" ? href.replace(/^http:\/\//, "https://") : href;
      continue;
    }

    if (k === "tags") {
      /* 강조 태그 — 문자열 최대 3개, 16자. 빈 값은 뺀다 */
      if (!Array.isArray(v)) continue;
      const tags = v
        .filter((x): x is string => typeof x === "string")
        .map((x) => sliceChars(x.trim(), 16))
        .filter(Boolean)
        .slice(0, 3);
      if (tags.length) out.tags = tags;
      continue;
    }

    if (k === "items") {
      if (!Array.isArray(v)) continue;
      const items: unknown[] = [];
      for (const raw of v.slice(0, 30)) {
        if (!raw || typeof raw !== "object") continue;
        const it: Record<string, unknown> = {};
        for (const [ik, iv] of Object.entries(raw as Record<string, unknown>)) {
          if (ik === "url" || ik === "imagePath") {
            if (typeof iv !== "string" || !iv.trim()) continue;
            const href = normalizeUrl(iv);
            if (!href) return { error: URL_ERROR };
            it[ik] = ik === "imagePath" ? href.replace(/^http:\/\//, "https://") : href;
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
      const uniq = [...new Set(picked)];
      /* submitLead 는 이메일·연락처 중 하나를 반드시 요구한다 — 둘 다 없는 폼을 저장해 두면
         방문자가 어떤 값을 넣어도 영원히 제출할 수 없다. 편집기 가드와 같은 불변식을 서버도 지킨다(감사 #27).
         빈 배열은 공개 폼이 기본 항목으로 폴백하므로 그대로 둔다. */
      if (uniq.length > 0 && !uniq.includes("email") && !uniq.includes("phone")) {
        return { error: "이메일·연락처 중 하나는 반드시 받아야 해요." };
      }
      out.fields = uniq;
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
      /* 연락처(vCard)·파일 이름은 앞뒤 공백을 떼고 저장 — 공백만 있는 이름은 렌더러가 버튼을
         그리는데 /vcard 라우트는 trim 뒤 빈 이름으로 404 를 낸다(소넷 점검 4단계 #3) */
      const sv = k === "name" || k === "fileName" ? v.trim() : v;
      out[k] = sliceChars(sv, Object.hasOwn(TEXT_CAPS, k) ? TEXT_CAPS[k] : 500);
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
