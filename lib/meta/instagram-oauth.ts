/**
 * Instagram Login OAuth 어댑터 — "Instagram API with Instagram Login" (graph.instagram.com).
 * 근거·전체 스펙: docs/REAL_API_SPEC.md 1절.
 *
 * 크리에이터가 자기 IG 프로페셔널 계정을 직접 연동하는 구조라 Facebook Page가 필요 없는
 * Instagram Login 경로를 쓴다. 한 플로우에 호스트가 3개 등장한다:
 *   1) 인가 리다이렉트  : https://www.instagram.com/oauth/authorize
 *   2) code→단기토큰    : POST https://api.instagram.com/oauth/access_token
 *   3) 단기→장기(60일)  : GET  https://graph.instagram.com/access_token (ig_exchange_token)
 *   +) 리프레시(+60일)  : GET  https://graph.instagram.com/refresh_access_token (ig_refresh_token)
 *
 * 서버 전용: client_secret·토큰을 클라이언트로 절대 노출하지 않는다 (NEXT_PUBLIC_ 금지).
 */

import { GRAPH_INSTAGRAM_BASE } from "./graph";

/** 인사이트 + 댓글 + 메시징에 필요한 신형 스코프 (구형 값은 2025-01-27 폐기) */
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;

/** 사람이 읽는 권한 설명 — 설정 화면 투명성 고지용 (스코프와 1:1) */
export const INSTAGRAM_SCOPE_LABELS = [
  "프로필 기본 정보 조회",
  "게시물·계정 인사이트 조회",
  "댓글 조회·답글 및 비공개 답장(DM)",
  "다이렉트 메시지 송수신",
];

export interface InstagramOAuthConfig {
  appId: string;
  appSecret: string;
}

/** 앱 설정 로드 — 미설정이면 null (연동 버튼은 비활성 안내) */
export function getInstagramOAuthConfig(): InstagramOAuthConfig | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isInstagramOAuthConfigured(): boolean {
  return getInstagramOAuthConfig() !== null;
}

export const INSTAGRAM_CALLBACK_PATH = "/api/auth/instagram/callback";

/**
 * 콜백(redirect_uri)을 계산한다. Meta는 인가·토큰교환 두 단계의 redirect_uri가 정확히 일치해야 하고
 * 앱 설정의 허용목록에도 등록돼 있어야 한다. start/callback이 같은 방식으로 계산하도록 한 곳에 둔다.
 * 우선순위: NEXT_PUBLIC_SITE_URL(프로덕션 정본) → 요청 헤더(로컬/프리뷰).
 */
export function resolveCallbackUri(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return `${configured.replace(/\/$/, "")}${INSTAGRAM_CALLBACK_PATH}`;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3170";
  return `${proto}://${host}${INSTAGRAM_CALLBACK_PATH}`;
}

/** 인가 URL 생성 — state는 CSRF 방지용(쿠키에도 저장해 콜백에서 대조) */
export function buildAuthorizeUrl(params: { appId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state: params.state,
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

export interface ShortLivedToken {
  accessToken: string;
  userId: string; // IG 사용자 id (= platform_user_id)
  permissions: string[];
}

/** 2) code → 단기토큰(1시간). code·redirect_uri는 인가 때 값과 정확히 일치해야 한다. */
export async function exchangeCodeForToken(params: {
  code: string;
  redirectUri: string;
  config: InstagramOAuthConfig;
}): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: params.config.appId,
    client_secret: params.config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
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
    permissions: Array.isArray(json.permissions)
      ? json.permissions
      : typeof json.permissions === "string"
        ? json.permissions.split(",").filter(Boolean)
        : [],
  };
}

export interface LongLivedToken {
  accessToken: string;
  expiresInSeconds: number;
}

/** 3) 단기 → 장기토큰(약 60일). 발급 즉시 이걸로 교환해 저장한다(단기토큰은 1시간). */
export async function exchangeForLongLivedToken(params: {
  shortLivedToken: string;
  config: InstagramOAuthConfig;
}): Promise<LongLivedToken> {
  const q = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: params.config.appSecret,
    access_token: params.shortLivedToken,
  });
  const res = await fetch(`${GRAPH_INSTAGRAM_BASE.replace(/\/v\d+\.\d+$/, "")}/access_token?${q.toString()}`);
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
export async function refreshLongLivedToken(longLivedToken: string): Promise<LongLivedToken> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: longLivedToken });
  const res = await fetch(`${GRAPH_INSTAGRAM_BASE.replace(/\/v\d+\.\d+$/, "")}/refresh_access_token?${q.toString()}`);
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

export interface InstagramAccountInfo {
  id: string;
  username: string;
  name: string | null;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  profilePictureUrl: string | null;
  biography: string | null;
  website: string | null;
}

/** 연동 직후 계정 기본 정보 조회 (설정·대시보드 표시용). 100팔로워 미만이면 일부 필드 결측 가능. */
export async function fetchAccountInfo(accessToken: string): Promise<InstagramAccountInfo> {
  const fields = "id,username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website";
  const res = await fetch(`${GRAPH_INSTAGRAM_BASE}/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(`account_info_failed: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return {
    id: String(json.id),
    username: typeof json.username === "string" ? json.username : "",
    name: typeof json.name === "string" ? json.name : null,
    followersCount: typeof json.followers_count === "number" ? json.followers_count : 0,
    followsCount: typeof json.follows_count === "number" ? json.follows_count : 0,
    mediaCount: typeof json.media_count === "number" ? json.media_count : 0,
    profilePictureUrl: typeof json.profile_picture_url === "string" ? json.profile_picture_url : null,
    biography: typeof json.biography === "string" ? json.biography : null,
    website: typeof json.website === "string" ? json.website : null,
  };
}
