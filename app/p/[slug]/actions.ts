"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { unlockCookieName, unlockToken, verifyPagePassword } from "@/lib/links/password";
import { loadPublicPage } from "./public-page";
import type { LpErrorCode } from "@/lib/links/i18n";

/** 방문자 액션 결과 — error 는 한국어 기본 문구, code 는 페이지 언어로 번역할 키(감사 C8) */
export type VisitorResult = { ok: true } | { ok: false; error: string; code: LpErrorCode };
const fail = (code: LpErrorCode, error: string): VisitorResult => ({ ok: false, error, code });

/*
  공개 페이지의 방문자 액션 — 방문 기록 / 리드 제출.

  둘 다 **service_role 로 쓴다.** link_views·link_leads 에 익명 INSERT 정책을 주면
  아무나 통계를 부풀리고 스팸을 넣을 수 있다(0048 에 INSERT 정책이 없는 이유).

  개인 식별 정보를 저장하지 않는다:
   · IP·UA 원문·리퍼러 전체 URL 미저장 — 0058 부터 **기기 3분류**(UA 에서 판정만)와
     **리퍼러 호스트명**(경로·쿼리 없이)만 남긴다. 둘 다 개인을 가리키지 못하는 집계 단위다.
   · 재방문 판정은 **서버가 만든 임의 토큰**을 쿠키에 심고 그 해시만 남긴다.
     원문 토큰은 방문자 브라우저에만 있으므로 역추적이 불가능하고, 쿠키를 지우면 리셋된다.
*/

const VISITOR_COOKIE = "finch_lv";

/** 임의 토큰 → SHA-256 해시(앞 32자). 원문은 저장하지 않는다 */
async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * 쿠키의 방문자 토큰을 **읽기만** 한다 — 발급은 proxy.ts 가 /p/* 응답에서 한다.
 * 서버 액션 안에서 쿠키를 쓰면 Next 가 액션 응답에 페이지 전체를 다시 렌더해(DB 읽기 2배) 첫 방문마다 비용이 두 배였다(감사3 C4).
 * 쿠키가 없으면(프록시를 안 거친 요청·쿠키 차단) null — 재방문 판정만 포기한다.
 */
async function visitorHash(): Promise<string | null> {
  try {
    const jar = await cookies();
    const token = jar.get(VISITOR_COOKIE)?.value;
    return token ? await hashToken(token) : null;
  } catch {
    return null;
  }
}

/** 슬러그 → 이 요청이 볼 수 있는 공개 페이지 id. 비공개·잠긴(열지 못한) 페이지는 null — loadPublicPage 와 같은 규칙 */
async function publicPageId(slug: string): Promise<string | null> {
  const p = await loadPublicPage(slug);
  return p && p.published && !p.locked ? p.id : null;
}

/* ── 유입 제한 ──────────────────────────────────────────────────────
   세 경로(방문·클릭·리드)가 전부 인증 없이 service_role 로 INSERT 한다. 0048 이
   익명 INSERT 정책을 안 준 건 "스팸 창구가 된다"는 이유였는데, 서버 액션이 그
   자리를 그대로 대신하고 있었다 — 정책만 없고 창구는 열려 있었다.

   카운터는 반드시 **DB 로** 센다. Vercel 서버리스는 인스턴스가 여러 개라
   메모리 카운터는 공유되지 않는다(있으나 마나다).

   한계를 분명히 해 둔다: 방문자 해시는 쿠키에서 오므로 쿠키를 지우면 새 해시다.
   그래서 리드에는 **페이지 단위 상한**을 함께 건다 — 이쪽이 진짜 방어선이고,
   해시 단위는 실수·연타를 거르는 용도다. IP 는 저장하지 않는 방침이라 안 쓴다. */

/** 같은 방문자의 방문을 이 간격 안에서는 1건으로 본다 */
const VIEW_WINDOW_MS = 30 * 60 * 1000;
/**
 * 해시를 못 만든(쿠키를 안 보낸) 방문의 페이지 단위 천장 — 분당.
 *
 * 해시 기반 30분 병합은 **쿠키를 보내는 브라우저에만** 걸린다. curl 로 반복하면
 * 매번 새 해시가 나와 한 번도 발동하지 않았다. 진짜 방문자는 거의 다 쿠키를
 * 받으므로 이 천장에 닿지 않고, 스크립트만 걸린다.
 * 실제 방문을 깎지 않도록 넉넉하게 잡았다 — 목적은 정밀 차단이 아니라 폭주 차단이다.
 */
const VIEW_ANON_PER_MIN = 60;
/**
 * 해시 유무와 **무관한** 페이지 단위 천장 — 분당.
 *
 * 쿠키 토큰은 서버가 발급하지만 검증하지 않는다(값을 그대로 해시). 요청마다 다른 쿠키를
 * 보내면 매번 새 해시가 나와 30분 병합도, 위의 익명 천장도 안 걸렸다(감사 #15).
 * 진짜 트래픽이 분당 600 방문을 넘는 페이지는 없다시피 하고, 넘어도 "깎이는" 것이지 깨지지 않는다.
 */
const VIEW_PAGE_PER_MIN = 600;
/** 리드: 같은 방문자 10분 5건 / 한 페이지 1시간 30건 */
const LEAD_VISITOR_WINDOW_MS = 10 * 60 * 1000;
const LEAD_VISITOR_MAX = 5;
const LEAD_PAGE_WINDOW_MS = 60 * 60 * 1000;
const LEAD_PAGE_MAX = 30;

/** 방문 1건 기록. 실패해도 조용히 넘어간다 — 통계 때문에 페이지가 깨지면 안 된다 */
/** 유입 표식 허용 목록 — 방문자가 URL 에 아무 값이나 달아도 통계 축이 안 오염된다 */
const VIEW_SRC = new Set(["instagram", "tiktok", "threads", "youtube", "x"]);

/* 크롤러 — /go 와 같은 목록. JS 를 실행하는 봇(Googlebot·Bingbot)이 비콘을 쏘면 조회만 부풀어 조회당 클릭이 낮게 나온다 */
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|kakaotalk-scrap|Slackbot|Twitterbot|Discordbot|LinkedInBot|TelegramBot|Googlebot|bingbot/i;

export async function recordView(slug: string, src?: string, ref?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (BOT_UA.test((await headers()).get("user-agent") ?? "")) return;
  const pageId = await publicPageId(slug);
  if (!pageId) return;

  const admin = createAdminClient();
  if (!admin) return;

  const hash = await visitorHash();

  /* 같은 방문자가 30분 안에 다시 왔으면 안 센다. 새로고침 한 번에 방문 1건씩
     쌓이면 조회수 분모가 부풀어 지표가 통째로 거짓말이 된다. */
  if (hash) {
    const { data: last } = await admin
      .from("link_views")
      .select("created_at")
      .eq("page_id", pageId)
      .eq("visitor_hash", hash)
      .gte("created_at", new Date(Date.now() - VIEW_WINDOW_MS).toISOString())
      .limit(1)
      .maybeSingle();
    if (last) return;
  } else {
    /* 해시가 없으면 위 병합이 아예 안 걸린다 — 쿠키를 안 보내는 스크립트가
       조회수를 무한히 부풀릴 수 있는 구멍이 여기였다. 해시 없는 방문만 따로 센다. */
    const { count } = await admin
      .from("link_views")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .is("visitor_hash", null)
      .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString());
    if ((count ?? 0) >= VIEW_ANON_PER_MIN) return;
  }
  /* 해시가 있어도 페이지 단위 천장은 건다 — 쿠키 값을 요청마다 바꾸는 스크립트 차단 */
  {
    const { count } = await admin
      .from("link_views")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString());
    if ((count ?? 0) >= VIEW_PAGE_PER_MIN) return;
  }

  const h = await headers();
  const row = {
    page_id: pageId,
    visitor_hash: hash,
    /* Vercel 이 주는 국가/도시 코드만 — 좌표·상세주소는 받지 않는다 */
    country: h.get("x-vercel-ip-country") ?? null,
    /* Vercel 은 도시명을 URL 인코딩해 보낸다(S%C3%A3o%20Paulo) — 풀어서 저장(감사 L17) */
    region: safeDecode(h.get("x-vercel-ip-city")),
  };
  const cleanSrc = src && VIEW_SRC.has(src) ? src : null;
  /* 0058 — 기기 3분류·리퍼러 호스트. 원문은 판정에만 쓰고 버린다.
     리퍼러는 **클라이언트가 보낸 document.referrer** 다 — 서버 액션 요청의 Referer 헤더는 늘 이 페이지 자신이라
     호스트가 100% null 이었다(감사 C10). 길이만 자르고 호스트명만 남긴다. */
  const extra = {
    device: deviceOf(h.get("user-agent")),
    referrer_host: referrerHostOf(typeof ref === "string" ? ref.slice(0, 2048) : null, h.get("host")),
  };
  const isColErr = (e: { code?: string; message: string }, col: RegExp) =>
    e.code === "42703" || (col.test(e.message) && /column|schema/i.test(e.message));
  /* 미적용 DB 폴백 — 계단식: 0058 컬럼 → 0055 컬럼 → 0048 원형. 의미 유실은 그 단계의 지표뿐이다 */
  let { error } = await admin.from("link_views").insert({ ...row, src: cleanSrc, ...extra });
  if (error && isColErr(error, /device|referrer_host|dwell_ms/i)) {
    ({ error } = await admin.from("link_views").insert({ ...row, src: cleanSrc }));
  }
  if (error && isColErr(error, /src/i)) {
    ({ error } = await admin.from("link_views").insert(row));
  }
  if (error) console.error("[links] 방문 기록 실패:", error.message);
}

/** UA → mobile | tablet | desktop | null. 원문은 저장하지 않는다 */
function deviceOf(ua: string | null): "mobile" | "tablet" | "desktop" | null {
  if (!ua) return null;
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** 리퍼러 → 호스트명만(www. 제거). 우리 자신·빈 값은 null */
function referrerHostOf(ref: string | null, ownHost: string | null): string | null {
  if (!ref) return null;
  try {
    const host = new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === "localhost") return null;
    /* Host 헤더는 포트·IPv6 괄호가 붙는다(localhost:3000, [::1]:3000) — 같은 규칙으로 정규화해 비교(감사 L18) */
    let own: string | null = null;
    try {
      own = ownHost ? new URL(`http://${ownHost}`).hostname.toLowerCase().replace(/^www\./, "") : null;
    } catch {
      own = null;
    }
    if (own && host === own) return null;
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

function safeDecode(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/* ── 체류시간(0058) — 페이지를 떠날 때 비콘이 닿으면 같은 방문자의 최근 방문 행에 적는다 ── */
const DWELL_MAX_MS = 30 * 60 * 1000;

export async function recordDwell(slug: string, ms: number): Promise<void> {
  if (!isSupabaseConfigured() || isDemoMode()) return;
  if (!Number.isFinite(ms) || ms < 1000) return;
  const pageId = await publicPageId(slug);
  if (!pageId) return;
  const hash = await visitorHash();
  if (!hash) return; // 해시 없는 방문은 어느 행인지 알 수 없다
  const admin = createAdminClient();
  if (!admin) return;
  const { data: last } = await admin
    .from("link_views")
    .select("id, dwell_ms")
    .eq("page_id", pageId)
    .eq("visitor_hash", hash)
    /* 방문 창(30분) + 체류 상한(30분) — 31분 머문 방문의 첫 비콘도 자기 행을 찾아야 한다(감사 L16) */
    .gte("created_at", new Date(Date.now() - VIEW_WINDOW_MS - DWELL_MAX_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return;
  const next = Math.min(DWELL_MAX_MS, Math.round(ms));
  if (typeof last.dwell_ms === "number" && last.dwell_ms >= next) return;
  const { error } = await admin.from("link_views").update({ dwell_ms: next }).eq("id", last.id);
  /* 0058 미적용이면 dwell_ms 컬럼이 없다 — 조용히 포기(통계 화면도 그 섹션을 안 그린다) */
  if (error && error.code !== "42703" && !/dwell_ms/i.test(error.message)) console.error("[links] 체류 기록 실패:", error.message);
}

/* ── 비밀번호 페이지(0058) ─────────────────────────────────────────── */
/* 시도 제한 — **DB(link_unlock_attempts, 0059)** 에 센다. 메모리 카운터는 방문자 쿠키로 키를 잡아 쿠키를 안 보내면
   매번 새 키였고 인스턴스마다 따로였다(감사 C1). 페이지 단위 천장이 진짜 방어, 해시 단위는 오타 방지. */
const UNLOCK_WINDOW_MS = 10 * 60 * 1000;
const UNLOCK_VISITOR_MAX = 8;
const UNLOCK_PAGE_MAX = 30;
/* 0059 미적용 구간 전용 — 페이지 id 키(방문자가 바꿀 수 없다) */
const UNLOCK_FALLBACK = new Map<string, { n: number; until: number }>();

/** 비밀번호 대조 → 맞으면 열림 쿠키. 해시는 service_role 로만 읽는다(주인 외 아무도 못 읽는 표) */
export async function unlockLinkPage(slug: string, password: string): Promise<VisitorResult> {
  if (isDemoMode()) return { ok: true };
  if (!isSupabaseConfigured()) return fail("unavailable", "지금은 열 수 없어요.");
  const pw = (password ?? "").trim();
  if (!pw) return fail("empty", "비밀번호를 입력해 주세요.");
  /* 잠긴 페이지는 RLS 가 숨기므로(0058) id 는 service_role 로 찾는다 — 발행된 페이지만 */
  const admin0 = createAdminClient();
  if (!admin0) return fail("unavailable", "지금은 열 수 없어요.");
  const { data: pageRow } = await admin0.from("link_pages").select("id").eq("slug", slug).eq("published", true).maybeSingle();
  const pageId = (pageRow?.id as string | undefined) ?? null;
  if (!pageId) return fail("notFound", "페이지를 찾을 수 없어요.");

  const hash = await visitorHash();
  const since = new Date(Date.now() - UNLOCK_WINDOW_MS).toISOString();
  /* PBKDF2(100k) 를 태우기 **전에** 천장을 본다 — 안 그러면 제한 자체가 CPU 소진 통로다 */
  const { count: pageFails, error: cntErr } = await admin0
    .from("link_unlock_attempts")
    .select("id", { count: "exact", head: true })
    .eq("page_id", pageId)
    .gte("created_at", since);
  /* 0059 미적용(표 없음) — 배포와 SQL 적용 사이 잠깐은 **페이지 단위 메모리 카운터**로 버틴다(쿠키와 무관한 키라
     0058 의 구멍은 아니다). 이미 걸린 비밀번호 페이지가 통째로 안 열리는 게 더 나쁘다(소넷 점검). 다른 오류는 닫힌 쪽으로. */
  const tableMissing = !!cntErr && (cntErr.code === "42P01" || /link_unlock_attempts/i.test(cntErr.message));
  if (cntErr && !tableMissing) return fail("unavailable", "지금은 열 수 없어요.");
  if (tableMissing) {
    const now = Date.now();
    const m = UNLOCK_FALLBACK.get(pageId);
    if (m && m.until > now && m.n >= UNLOCK_PAGE_MAX) return fail("tooMany", "시도가 너무 많아요. 잠시 후 다시 해 주세요.");
    if (UNLOCK_FALLBACK.size > 2000) UNLOCK_FALLBACK.clear();
  } else {
    if ((pageFails ?? 0) >= UNLOCK_PAGE_MAX) return fail("tooMany", "시도가 너무 많아요. 잠시 후 다시 해 주세요.");
    if (hash) {
      const { count: mine } = await admin0
        .from("link_unlock_attempts")
        .select("id", { count: "exact", head: true })
        .eq("page_id", pageId)
        .eq("visitor_hash", hash)
        .gte("created_at", since);
      if ((mine ?? 0) >= UNLOCK_VISITOR_MAX) return fail("tooMany", "시도가 너무 많아요. 잠시 후 다시 해 주세요.");
    }
  }

  const { data: secret } = await admin0.from("link_page_secrets").select("password_hash").eq("page_id", pageId).maybeSingle();
  const stored = (secret?.password_hash as string | undefined) ?? "";
  if (!stored || !(await verifyPagePassword(pw, stored))) {
    if (tableMissing) {
      const now = Date.now();
      const m = UNLOCK_FALLBACK.get(pageId);
      UNLOCK_FALLBACK.set(pageId, m && m.until > now ? { n: m.n + 1, until: m.until } : { n: 1, until: now + UNLOCK_WINDOW_MS });
    } else {
      await admin0.from("link_unlock_attempts").insert({ page_id: pageId, visitor_hash: hash });
    }
    return fail("wrongPassword", "비밀번호가 맞지 않아요.");
  }

  try {
    const jar = await cookies();
    jar.set(unlockCookieName(pageId), unlockToken(pageId, stored), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24, // 하루
      path: `/p/${slug}`,
    });
  } catch {
    return fail("unavailable", "지금은 열 수 없어요.");
  }
  return { ok: true };
}

/** 문의·구독 제출 */
export async function submitLead(input: {
  slug: string;
  blockId: string;
  kind: "contact" | "subscribe";
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}): Promise<VisitorResult> {
  /* 데모 페이지의 폼은 **누르기 전에** 예시라고 말한다(lead-form.tsx). 여기까지
     오는 건 폼을 우회한 호출뿐이므로 그대로 거절한다 — ok:true 로 위장하면
     "접수됐어요"를 보여주고 아무 데도 저장하지 않는 더 나쁜 거짓말이 된다. */
  if (isDemoMode()) return fail("demo", "예시 페이지라 접수되지 않아요.");
  if (!isSupabaseConfigured()) return fail("unavailable", "지금은 접수할 수 없어요.");

  /* 페이지뿐 아니라 **발행 스냅샷에 그 폼 블록이 실제로 있는지**까지 본다 — 폼을 두지 않은
     페이지에 임의 uuid 로 리드를 꽂아 「받은 내용」을 오염시키는 경로를 막는다(감사 #26).
     /go 경로가 스냅샷에서만 블록을 찾는 것과 같은 기준. */
  /* 잠긴 페이지(0058)는 열림 쿠키가 맞을 때만 스냅샷이 온다 — 비밀번호 없이 폼만 꽂는 길을 막는다 */
  const pageRow = await loadPublicPage(input.slug);
  if (!pageRow || !pageRow.published || pageRow.locked) return fail("notFound", "페이지를 찾을 수 없어요.");
  const pageId = pageRow.id;
  const snapBlocks = (pageRow.snapshot as { blocks?: unknown } | null)?.blocks;
  const target = Array.isArray(snapBlocks)
    ? (snapBlocks as Array<{ id?: unknown; type?: unknown }>).find((b) => b && b.id === input.blockId)
    : undefined;
  if (!target || target.type !== input.kind) return fail("invalid", "접수할 수 없는 요청이에요.");

  const email = (input.email ?? "").trim().slice(0, 160);
  const name = (input.name ?? "").trim().slice(0, 60);
  const phone = (input.phone ?? "").trim().slice(0, 40);
  const message = (input.message ?? "").trim().slice(0, 2000);

  /* 최소 하나는 연락 가능한 값이어야 한다 — 빈 제출이 쌓이면 목록이 쓸모없어진다 */
  if (!email && !phone) return fail("needContact", "이메일 또는 연락처를 입력해 주세요.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("badEmail", "이메일 형식이 올바르지 않아요.");
  }

  const admin = createAdminClient();
  if (!admin) return fail("unavailable", "지금은 접수할 수 없어요.");

  /* 스팸이 들어오면 진짜 문의가 묻힌다 — 편집 화면은 최근 50건만 보여주고
     지우는 방법도 없다. 페이지 단위 상한이 실질 방어선이다. */
  const { count: pageCount } = await admin
    .from("link_leads")
    .select("id", { count: "exact", head: true })
    .eq("page_id", pageId)
    .gte("created_at", new Date(Date.now() - LEAD_PAGE_WINDOW_MS).toISOString());
  if ((pageCount ?? 0) >= LEAD_PAGE_MAX) {
    return fail("busy", "지금은 접수가 몰려 있어요. 잠시 후 다시 시도해 주세요.");
  }

  const hash = await visitorHash();
  if (hash) {
    const { count: mine } = await admin
      .from("link_leads")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .eq("visitor_hash", hash)
      .gte("created_at", new Date(Date.now() - LEAD_VISITOR_WINDOW_MS).toISOString());
    if ((mine ?? 0) >= LEAD_VISITOR_MAX) {
      return fail("tooMany", "너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  const { error } = await admin.from("link_leads").insert({
    visitor_hash: hash,
    page_id: pageId,
    block_id: input.blockId,
    kind: input.kind,
    name: name || null,
    email: email || null,
    phone: phone || null,
    message: message || null,
  });
  if (error) {
    console.error("[links] 리드 저장 실패:", error.message);
    return fail("failed", "접수하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return { ok: true };
}

/* ── 방명록(리틀리 흡수 4단계, 0057) ── */
const GUEST_VISITOR_WINDOW_MS = 10 * 60 * 1000;
const GUEST_VISITOR_MAX = 3;
const GUEST_PAGE_WINDOW_MS = 60 * 60 * 1000;
const GUEST_PAGE_MAX = 40;

export async function submitGuestbook(input: { slug: string; blockId: string; name: string; message: string }): Promise<VisitorResult> {
  if (isDemoMode()) return fail("demo", "예시 페이지라 남길 수 없어요.");
  if (!isSupabaseConfigured()) return fail("unavailable", "지금은 남길 수 없어요.");

  const name = (input.name ?? "").trim().slice(0, 40);
  const message = (input.message ?? "").trim().slice(0, 500);
  if (!name || !message) return fail("empty", "이름과 내용을 적어 주세요.");

  /* 리드와 같은 기준 — 발행 스냅샷에 그 방명록 블록이 실제로 있을 때만 받는다. 잠긴 페이지는 열린 요청만 */
  const pageRow = await loadPublicPage(input.slug);
  if (!pageRow || !pageRow.published || pageRow.locked) return fail("notFound", "페이지를 찾을 수 없어요.");
  const pageId = pageRow.id;
  const snapBlocks = (pageRow.snapshot as { blocks?: unknown } | null)?.blocks;
  const target = Array.isArray(snapBlocks)
    ? (snapBlocks as Array<{ id?: unknown; type?: unknown }>).find((b) => b && b.id === input.blockId)
    : undefined;
  if (!target || target.type !== "guestbook") return fail("invalid", "접수할 수 없는 요청이에요.");

  const admin = createAdminClient();
  if (!admin) return fail("unavailable", "지금은 남길 수 없어요.");

  const { count: pageCount, error: cntErr } = await admin
    .from("link_guestbook")
    .select("id", { count: "exact", head: true })
    .eq("page_id", pageId)
    .gte("created_at", new Date(Date.now() - GUEST_PAGE_WINDOW_MS).toISOString());
  if (cntErr) return fail("unavailable", "지금은 남길 수 없어요.");
  if ((pageCount ?? 0) >= GUEST_PAGE_MAX) return fail("busy", "지금은 글이 몰려 있어요. 잠시 후 다시 시도해 주세요.");

  const hash = await visitorHash();
  if (hash) {
    const { count: mine } = await admin
      .from("link_guestbook")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .eq("visitor_hash", hash)
      .gte("created_at", new Date(Date.now() - GUEST_VISITOR_WINDOW_MS).toISOString());
    if ((mine ?? 0) >= GUEST_VISITOR_MAX) return fail("tooMany", "너무 자주 남겼어요. 잠시 후 다시 시도해 주세요.");
  }

  const { error } = await admin.from("link_guestbook").insert({ page_id: pageId, block_id: input.blockId, visitor_hash: hash, name, message });
  if (error) {
    console.error("[links] 방명록 저장 실패:", error.message);
    return fail("failed", "남기지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  revalidatePath(`/p/${input.slug}`);
  return { ok: true };
}
