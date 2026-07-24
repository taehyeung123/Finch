/**
 * Threads OAuth 어댑터 — lib/meta/instagram-oauth.ts와 동일 구조.
 * 근거·전체 스펙: docs/REAL_API_SPEC.md 5절.
 *
 * IG Login과 달리 호스트가 3개가 아니라 인가만 별도(threads.net)고 토큰 관련은 전부
 * graph.threads.net에 모여 있다:
 *   1) 인가 리다이렉트  : https://threads.net/oauth/authorize
 *   2) code→단기토큰    : POST https://graph.threads.net/oauth/access_token
 *   3) 단기→장기(60일)  : GET  https://graph.threads.net/access_token (th_exchange_token)
 *   +) 리프레시(+60일)  : GET  https://graph.threads.net/refresh_access_token (th_refresh_token)
 *
 * 서버 전용: client_secret·토큰을 클라이언트로 절대 노출하지 않는다 (NEXT_PUBLIC_ 금지).
 * 개발자 모드 테스터 계정 기준 — 사업자등록·앱심사 없이 Standard Access(테스터 역할 계정)로 동작한다.
 */

import { GRAPH_THREADS_BASE } from "./graph";

/** 문서에서 확인된 전체 스코프. 최소 권한 원칙상 실제 요청은 필요한 기능만 넣는 게 이상적이나,
 *  핀치는 발행·인사이트·댓글까지 전부 쓰므로 전 범위를 요청한다 (docs/REAL_API_SPEC.md 5절). */
export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_replies",
  "threads_read_replies",
  "threads_manage_insights",
] as const;

/** 사람이 읽는 권한 설명 — 설정 화면 투명성 고지용 (스코프와 1:1) */
export const THREADS_SCOPE_LABELS = [
  "프로필 기본 정보 조회",
  "게시물 발행(카드뉴스 예약 발행)",
  "답글 작성",
  "답글 조회",
  "계정·게시물 인사이트 조회",
];

export interface ThreadsOAuthConfig {
  appId: string;
  appSecret: string;
}

/** 앱 설정 로드 — 미설정이면 null (연동 버튼은 비활성 안내) */
export function getThreadsOAuthConfig(): ThreadsOAuthConfig | null {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isThreadsOAuthConfigured(): boolean {
  return getThreadsOAuthConfig() !== null;
}

export const THREADS_CALLBACK_PATH = "/api/auth/threads/callback";

/**
 * 콜백(redirect_uri)을 계산한다. instagram-oauth.ts의 resolveCallbackUri와 동일한 우선순위:
 * NEXT_PUBLIC_SITE_URL(프로덕션 정본) → 요청 헤더(로컬/프리뷰).
 */
export function resolveThreadsCallbackUri(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return `${configured.replace(/\/$/, "")}${THREADS_CALLBACK_PATH}`;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3170";
  return `${proto}://${host}${THREADS_CALLBACK_PATH}`;
}

/** 인가 URL 생성 — state는 CSRF 방지용(쿠키에도 저장해 콜백에서 대조) */
export function buildThreadsAuthorizeUrl(params: { appId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: THREADS_SCOPES.join(","),
    state: params.state,
  });
  return `https://threads.net/oauth/authorize?${q.toString()}`;
}

export interface ThreadsShortLivedToken {
  accessToken: string;
  userId: string; // Threads 사용자 id (= platform_user_id)
  permissions: string[];
}

/** 2) code → 단기토큰(1시간 추정, IG와 동일 패턴). code·redirect_uri는 인가 때 값과 정확히 일치해야 한다. */
export async function exchangeThreadsCodeForToken(params: {
  code: string;
  redirectUri: string;
  config: ThreadsOAuthConfig;
}): Promise<ThreadsShortLivedToken> {
  const body = new URLSearchParams({
    client_id: params.config.appId,
    client_secret: params.config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  const res = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    user_id?: string | number;
    permissions?: string[] | string;
    error_message?: string;
    error_type?: string;
  };
  if (!res.ok || !json.access_token || json.user_id == null) {
    throw new Error(`code_exchange_failed: ${json.error_message ?? json.error_type ?? `http_${res.status}`}`);
  }
  return {
    accessToken: json.access_token,
    userId: String(json.user_id),
    // permissions 필드는 스펙 문서에서 명시적으로 확인되지 않음 — 오면 파싱, 없으면 빈 배열로 방어
    permissions: Array.isArray(json.permissions)
      ? json.permissions
      : typeof json.permissions === "string"
        ? json.permissions.split(",").filter(Boolean)
        : [],
  };
}

export interface ThreadsLongLivedToken {
  accessToken: string;
  expiresInSeconds: number;
}

/** 3) 단기 → 장기토큰(약 60일). 발급 즉시 이걸로 교환해 저장한다. */
export async function exchangeThreadsForLongLivedToken(params: {
  shortLivedToken: string;
  config: ThreadsOAuthConfig;
}): Promise<ThreadsLongLivedToken> {
  const q = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: params.config.appSecret,
    access_token: params.shortLivedToken,
  });
  const res = await fetch(`https://graph.threads.net/access_token?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`longlived_exchange_failed: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in ?? 60 * 24 * 60 * 60 };
}

/** 장기토큰 갱신(+60일). 24시간 이상 경과 & 미만료여야 가능. client_secret 불필요. */
export async function refreshThreadsLongLivedToken(longLivedToken: string): Promise<ThreadsLongLivedToken> {
  const q = new URLSearchParams({ grant_type: "th_refresh_token", access_token: longLivedToken });
  const res = await fetch(`https://graph.threads.net/refresh_access_token?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`refresh_failed: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in ?? 60 * 24 * 60 * 60 };
}

export interface ThreadsAccountInfo {
  id: string;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  biography: string | null;
  isVerified: boolean;
}

/**
 * 연동 직후 계정 기본 정보 조회 (설정·대시보드 표시용).
 * 주의: Threads 프로필 필드에는 followers_count/media_count가 없다(스펙 6절) —
 * 팔로워 수는 lib/meta/threads.ts의 threads_insights(followers_count)로 별도 조회해야 한다.
 */
export async function fetchThreadsAccountInfo(accessToken: string): Promise<ThreadsAccountInfo> {
  const fields = "id,username,name,threads_profile_picture_url,threads_biography,is_verified";
  const res = await fetch(`${GRAPH_THREADS_BASE}/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(`account_info_failed: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return {
    id: String(json.id),
    username: typeof json.username === "string" ? json.username : "",
    name: typeof json.name === "string" ? json.name : null,
    profilePictureUrl: typeof json.threads_profile_picture_url === "string" ? json.threads_profile_picture_url : null,
    biography: typeof json.threads_biography === "string" ? json.threads_biography : null,
    isVerified: json.is_verified === true,
  };
}
