import "server-only";
import { actPath } from "@/lib/meta/ad-account-id";
import { GRAPH_FB_BASE } from "./ads-oauth";

/**
 * 광고 게시 주체 조회 — Facebook 페이지와 그에 연결된 Instagram 계정 (2단계 슬라이스 2).
 * 소재(object_story_spec)는 page_id 가 사실상 필수이고, 인스타 노출에는 instagram_user_id 가 필요하다.
 *
 * ⚠️ **실패(null)·권한 거부(denied)·0건([])을 가른다**(스펙 §13-6). 권한 부족(10·200·294)이나 일시 오류인데
 * «Instagram 계정이 연결돼 있지 않아요»라고 말하면 사용자가 엉뚱한 곳(Business Suite)으로 간다.
 * ⚠️ **페이지 토큰은 요청 안에서만 쓰고 저장·로그·클라이언트 전달 금지.** 함수 밖으로도 내보내지 않는다.
 *
 * IG 조회는 세 경로를 차례로 본다(권한 문서화가 갈려 있어 — 스펙 §3.3·§13-9, 첫 실 호출로 확정):
 *  ① /act_{id}/instagram_accounts (Marketing API — 비즈니스 관리자에 클레임된 IG)
 *  ② /{page_id}/instagram_accounts (페이지 토큰 — 사용자 토큰은 190 으로 거절된다, 2026-09-12 운영 로그)
 *  ③ /{page_id}?fields=instagram_business_account,connected_instagram_account (instagram_basic 이 필요할 수 있다)
 */

const READ_TIMEOUT_MS = 15_000;
const PERMISSION_CODES = new Set([10, 200, 294]);
/** OAuth 토큰 무효·만료 — «재시도»가 아니라 «재연동»이다(ads-write.ts writeErrorCode 와 같은 판정, 권한보다 먼저 본다) */
const TOKEN_EXPIRED_CODE = 190;

export type PagesFailReason = "denied" | "error" | "expired";
export type PagesResult<T> = { ok: true; data: T } | { ok: false; reason: PagesFailReason };

interface GraphError {
  message?: string;
  code?: number;
  error_subcode?: number;
}

/** 조회 한 번 — 권한 오류와 그 밖의 실패를 가른다 */
async function getJson<T>(path: string, accessToken: string, timeoutMs: number = READ_TIMEOUT_MS): Promise<PagesResult<T>> {
  const sep = path.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${GRAPH_FB_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: GraphError };
    if (!res.ok) {
      const code = json.error?.code;
      const message = json.error?.message ?? "";
      console.error(`[meta-pages] ${path.split("?")[0]} 실패:`, message || `http_${res.status}`);
      /* ⚠️ 190 이 전부 «만료»가 아니다(2026-09-12 운영 로그로 확인). `/{page}/instagram_accounts` 를 사용자 토큰으로 부르면
         메타가 «(#190) This method must be called with a Page Access Token» 을 준다 — 토큰은 멀쩡하고 **종류가 틀린** 것이다.
         예전엔 이걸 expired 로 읽어 페이지 토큰으로 다시 부르는 길(②)을 건너뛰고, 방금 다시 연결한 사람에게
         «광고 계정 연결이 만료됐어요»를 띄웠다. 토큰 종류 오류는 denied 로 돌려 호출측이 페이지 토큰으로 다시 부르게 한다. */
      const wrongTokenType =
        code === TOKEN_EXPIRED_CODE && json.error?.error_subcode === undefined && /page access token/i.test(message);
      const reason: PagesFailReason = wrongTokenType
        ? "denied"
        : code === TOKEN_EXPIRED_CODE
          ? "expired"
          : typeof code === "number" && PERMISSION_CODES.has(code)
            ? "denied"
            : "error";
      return { ok: false, reason };
    }
    return { ok: true, data: json };
  } catch (e) {
    console.error(`[meta-pages] ${path.split("?")[0]} 실패:`, e instanceof Error ? e.message : String(e));
    return { ok: false, reason: "error" };
  }
}

/* ── 페이지 ──────────────────────────────────────────────────────── */

export interface FbPage {
  id: string;
  name: string;
  /** Pages API 과업 — 광고 생성은 ADVERTISE */
  tasks: string[];
  canAdvertise: boolean;
}

/**
 * 내가 역할을 가진 페이지. ADVERTISE 과업이 없는 페이지도 돌려주되 canAdvertise=false 로 표시한다
 * (화면이 «이 페이지에는 광고 권한이 없어요»를 말할 수 있게 — 조용히 빼면 «내 페이지가 안 보여요»가 된다).
 * ⚠️ access_token 필드를 요청하지 않는다 — 페이지 토큰은 필요한 순간(②)에만 따로 받는다.
 */
export async function fetchPages(accessToken: string): Promise<PagesResult<FbPage[]>> {
  const res = await getJson<{ data?: { id?: string; name?: string; tasks?: string[] }[]; paging?: { next?: string } }>(
    "/me/accounts?fields=id,name,tasks&limit=100",
    accessToken,
  );
  if (!res.ok) return res;
  const pages: FbPage[] = (res.data.data ?? [])
    .filter((p) => typeof p.id === "string" && p.id.length > 0)
    .map((p) => {
      const tasks = Array.isArray(p.tasks) ? p.tasks.filter((t): t is string => typeof t === "string") : [];
      return { id: p.id as string, name: typeof p.name === "string" ? p.name : "(이름 없음)", tasks, canAdvertise: tasks.includes("ADVERTISE") };
    });
  if (res.data.paging?.next) console.warn("[meta-pages] 페이지가 100개를 넘는다 — 첫 100개만 보여준다");
  return { ok: true, data: pages };
}

/* ── 페이지 최근 게시물 (pages_read_engagement, 2026-09-11) ─────────────── */

export interface FbPagePost {
  id: string;
  /** 본문 앞부분(공백 정리·잘라 냄). 글 없이 사진만 올린 게시물은 null */
  message: string | null;
  /** ISO 8601(UTC). 못 읽으면 null */
  createdTime: string | null;
  /** 메타 CDN(*.fbcdn.net)의 https 주소일 때만 — 그 밖이면 null(글만 보여 준다) */
  pictureUrl: string | null;
  /** facebook.com 의 https 고정 주소일 때만 */
  permalinkUrl: string | null;
}

/** 최근 게시물은 «맞는 페이지인지» 확인하는 곁가지다 — IG 조회(최대 수십 초)보다 먼저 끝나게 짧게 끊는다 */
const POSTS_TIMEOUT_MS = 8_000;
const POST_SNIPPET_MAX = 140;

function httpsUrlOn(v: unknown, host: (h: string) => boolean): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 2048) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && host(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Graph 의 created_time 은 «+0000»(콜론 없음)이라 브라우저마다 해석이 갈린다 — 서버에서 ISO 로 고정한다 */
function toIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function snippet(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const flat = v.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > POST_SNIPPET_MAX ? `${flat.slice(0, POST_SNIPPET_MAX).trimEnd()}…` : flat;
}

/**
 * 페이지의 최근 게시물 — 광고 게시 페이지를 고를 때 «이 페이지가 맞는지» 눈으로 확인하게 한다.
 * (메타 앱 심사: pages_read_engagement 녹화 요건이 «페이지 게시물 내용을 앱에 보여 주기»다 — docs/APP_REVIEW.md §4-1-3.)
 *
 * 토큰: Graph 레퍼런스(Page Feed — /posts 가 같은 문서다)는 «페이지 액세스 토큰»과 pages_read_engagement 를 요구한다.
 * 그래서 사용자 토큰으로 먼저 찔러 보지 않고 곧장 **요청 안에서만** 페이지 토큰을 받는다(fetchPageInstagramAccounts 와 같은 방식).
 * 페이지 토큰은 이 함수의 지역 변수로 끝난다 — 반환값·로그·클라이언트 어디에도 담지 않는다.
 * 페이지 토큰은 내가 역할을 가진 페이지에서만 나온다 — 남의 페이지 id 를 넣으면 여기서 denied 로 끝난다.
 *
 * ⚠️ 같은 레퍼런스가 pages_read_user_content 도 함께 적는다(방문자 글·댓글용으로 보인다). 핀치는 요청하지 않는다 —
 *    페이지 **자신의** 글(/posts)만 읽는다. 첫 실 호출이 권한 오류(denied)면 이 판단부터 다시 본다(UNVERIFIED, 2026-09-11).
 * 실패(error)·권한(denied)·만료(expired)·0건([])을 가른다 — 0건은 «아직 게시물이 없다»는 사실이다.
 *
 * @param pageId 호출측이 숫자 형식을 확인한 값(경로에 그대로 들어간다)
 */
export async function fetchPageRecentPosts(pageId: string, accessToken: string, limit = 3): Promise<PagesResult<FbPagePost[]>> {
  const tokenRes = await getJson<{ access_token?: string }>(`/${pageId}?fields=access_token`, accessToken, POSTS_TIMEOUT_MS);
  if (!tokenRes.ok) return tokenRes;
  const pageToken = tokenRes.data.access_token;
  if (typeof pageToken !== "string" || pageToken.length === 0) return { ok: false, reason: "denied" };

  const res = await getJson<{
    data?: { id?: string; message?: string; created_time?: string; full_picture?: string; permalink_url?: string }[];
  }>(`/${pageId}/posts?fields=id,message,created_time,full_picture,permalink_url&limit=${limit}`, pageToken, POSTS_TIMEOUT_MS);
  if (!res.ok) return res;

  const posts: FbPagePost[] = (res.data.data ?? [])
    .filter((p) => typeof p.id === "string" && p.id.length > 0)
    .slice(0, limit)
    .map((p) => ({
      id: p.id as string,
      message: snippet(p.message),
      createdTime: toIso(p.created_time),
      /* 브라우저가 그대로 여는 주소라 메타 CDN 만 통과시킨다(CSP img-src 도 *.fbcdn.net 을 연다 — proxy.ts) */
      pictureUrl: httpsUrlOn(p.full_picture, (h) => h === "fbcdn.net" || h.endsWith(".fbcdn.net")),
      permalinkUrl: httpsUrlOn(p.permalink_url, (h) => h === "facebook.com" || h.endsWith(".facebook.com")),
    }));
  return { ok: true, data: posts };
}

/* ── Instagram 계정 ─────────────────────────────────────────────── */

export interface FbIgAccount {
  id: string;
  username: string | null;
}

function toIg(list: { id?: string; username?: string }[] | undefined): FbIgAccount[] {
  return (list ?? [])
    .filter((a) => typeof a.id === "string" && a.id.length > 0)
    .map((a) => ({ id: a.id as string, username: typeof a.username === "string" ? a.username : null }));
}

/** ① 광고 계정에 연결된 IG 계정(비즈니스 관리자 클레임 기준) */
export async function fetchAccountInstagramAccounts(
  adAccountId: string,
  accessToken: string,
): Promise<PagesResult<FbIgAccount[]>> {
  const res = await getJson<{ data?: { id?: string; username?: string }[] }>(
    `${actPath(adAccountId)}/instagram_accounts?fields=id,username&limit=50`,
    accessToken,
  );
  return res.ok ? { ok: true, data: toIg(res.data.data) } : res;
}

/**
 * ② 페이지의 IG 계정 — **처음부터 페이지 토큰으로** 부른다(2026-09-12).
 * 이 엣지는 사용자 토큰으로 부르면 «(#190) This method must be called with a Page Access Token» 을 준다(운영 로그로 확인).
 * 예전엔 사용자 토큰으로 먼저 불러 보고 «권한 거부»일 때만 페이지 토큰으로 다시 불렀는데, 이 거절이 190(보통 «만료»)이라
 * 재시도 없이 «광고 계정 연결이 만료됐어요»로 끝났다. 메타의 오류 문장에 기대지 않도록 순서를 아예 바꿨다.
 * 페이지 토큰은 이 함수의 지역 변수로 끝난다 — 반환값·로그 어디에도 담지 않는다.
 */
export async function fetchPageInstagramAccounts(
  pageId: string,
  accessToken: string,
): Promise<PagesResult<FbIgAccount[]>> {
  const tokenRes = await getJson<{ access_token?: string }>(`/${pageId}?fields=access_token`, accessToken);
  /* 토큰 조회 자체의 실패는 그 사유 그대로(일시 오류를 «권한 거부»로 뭉개면 불필요한 재연동을 시킨다 — 소넷 점검).
     응답은 왔는데 access_token 이 없으면 그건 «페이지 토큰을 못 받는 역할» = 권한 문제다 */
  if (!tokenRes.ok) return tokenRes;
  if (typeof tokenRes.data.access_token !== "string") return { ok: false, reason: "denied" };
  const res = await getJson<{ data?: { id?: string; username?: string }[] }>(
    `/${pageId}/instagram_accounts?fields=id,username&limit=50`,
    tokenRes.data.access_token,
  );
  return res.ok ? { ok: true, data: toIg(res.data.data) } : res;
}

/** ③ 페이지 노드의 연결 IG(instagram_basic 이 필요할 수 있다 — 거부되면 denied 로 온다) */
export async function fetchPageConnectedInstagram(
  pageId: string,
  accessToken: string,
): Promise<PagesResult<FbIgAccount[]>> {
  const res = await getJson<{
    instagram_business_account?: { id?: string; username?: string };
    connected_instagram_account?: { id?: string; username?: string };
  }>(`/${pageId}?fields=instagram_business_account{id,username},connected_instagram_account{id,username}`, accessToken);
  if (!res.ok) return res;
  const list: FbIgAccount[] = [];
  const seen = new Set<string>();
  for (const a of [res.data.instagram_business_account, res.data.connected_instagram_account]) {
    if (a && typeof a.id === "string" && a.id.length > 0 && !seen.has(a.id)) {
      seen.add(a.id);
      list.push({ id: a.id, username: typeof a.username === "string" ? a.username : null });
    }
  }
  return { ok: true, data: list };
}

export type IgLookup =
  | { state: "found"; accounts: FbIgAccount[] }
  /** 세 경로가 **모두** 성공했고 전부 0건 — 진짜 «연결 안 됨» */
  | { state: "none" }
  /** 어느 경로든 권한으로 막혔고 찾은 것도 없다 — scope_missing_pages */
  | { state: "denied" }
  /** 토큰 무효·만료 — token_expired(재연동) */
  | { state: "expired" }
  /** 일시 오류 — «확인 못 함» */
  | { state: "error" };

/**
 * 페이지에 연결된 IG 를 찾는다 — **페이지 스코프 경로(②·③)가 정본**이다.
 * ①(/act_{id}/instagram_accounts)은 광고 계정 전체(비즈니스 관리자 클레임)의 목록이라 «이 페이지의 것»이 아니다(소넷 점검):
 * 페이지 스코프에서 하나도 못 찾았고 ①이 **정확히 하나**만 줄 때에만 모호함이 없으니 그것을 쓴다.
 * 실패(error/denied/expired)가 섞여 있으면 «없음»으로 단정하지 않는다(§13-6).
 */
export async function lookupInstagramForPage(
  pageId: string,
  adAccountId: string,
  accessToken: string,
): Promise<IgLookup> {
  const pageScoped = [await fetchPageInstagramAccounts(pageId, accessToken), await fetchPageConnectedInstagram(pageId, accessToken)];
  const accountWide = await fetchAccountInstagramAccounts(adAccountId, accessToken);

  const found = new Map<string, FbIgAccount>();
  let denied = false;
  let error = false;
  let expired = false;
  const note = (r: PagesResult<FbIgAccount[]>) => {
    if (r.ok) return;
    if (r.reason === "denied") denied = true;
    else if (r.reason === "expired") expired = true;
    else error = true;
  };
  for (const r of pageScoped) {
    if (r.ok) for (const a of r.data) found.set(a.id, a);
    else note(r);
  }
  if (found.size === 0 && accountWide.ok && accountWide.data.length === 1) {
    found.set(accountWide.data[0].id, accountWide.data[0]);
  }
  note(accountWide);

  if (found.size > 0) return { state: "found", accounts: [...found.values()] };
  if (expired) return { state: "expired" };
  if (error) return { state: "error" };
  if (denied) return { state: "denied" };
  return { state: "none" };
}
