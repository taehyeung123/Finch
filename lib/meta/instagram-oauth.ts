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

/**
 * 인사이트 + 댓글 + 메시징 + 발행에 필요한 신형 스코프 (구형 값은 2025-01-27 폐기).
 *
 * ⚠️ content_publish 는 예약 발행(lib/meta/instagram-publish.ts)이 쓴다 — 여기서 빠지면
 * 발급된 토큰에 발행 권한이 없어 크론이 도는 순간에야 Meta 가 권한 오류로 거절한다.
 * 스코프는 **동의 시점에** 결정되므로 나중에 배열만 고쳐도 이미 연동한 사용자는
 * 재연동해야 한다 — 연동 시작 전에 맞춰 두는 것이 중요하다(2026-08-30 점검에서 누락 적발).
 */
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
  "instagram_business_content_publish",
] as const;

/**
 * 사람이 읽는 권한 설명 — 설정 화면 투명성 고지용.
 *
 * 배열 두 벌이 아니라 **스코프를 키로 한 한 벌**이다. 예전엔 나란한 두 배열이라
 * 스코프만 추가하고 라벨을 빠뜨려도 타입 오류도 런타임 오류도 안 났다 —
 * 설정 화면이 라벨만 순회하므로 «사용자에게 안 알리고 받아가는 권한»이 조용히 생긴다.
 * 이제 여기 한 줄을 빼면 컴파일이 막는다.
 */
export const INSTAGRAM_SCOPE_LABELS: Record<(typeof INSTAGRAM_SCOPES)[number], string> = {
  instagram_business_basic: "프로필 기본 정보 조회",
  instagram_business_manage_insights: "게시물·계정 인사이트 조회",
  instagram_business_manage_comments: "댓글 조회·답글 및 비공개 답장(DM)",
  instagram_business_manage_messages: "다이렉트 메시지 송수신",
  instagram_business_content_publish: "예약한 게시물 발행",
};

export interface InstagramOAuthConfig {
  appId: string;
  appSecret: string;
}

/**
 * 앱 설정 로드 — 미설정이면 null (연동 버튼은 비활성 안내).
 */
export function getInstagramOAuthConfig(): InstagramOAuthConfig | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  /* ⚠️ **Instagram 제품의 시크릿**을 쓴다 — 페이스북 앱 기본설정의 «앱 시크릿 코드» 와 다른 값이다.
     Instagram Login 은 제품 단위로 ID·시크릿 **한 쌍**을 발급하고, 토큰 교환은 그 쌍을 요구한다.
     (스레드도 THREADS_APP_ID/THREADS_APP_SECRET 한 쌍을 쓴다 — 인스타만 짝이 어긋나 있었다.)

     2026-08-06 커밋 «메타 앱 시크릿 이름 통일»(404fdb5)이 이걸 META_APP_SECRET 으로 바꿨다.
     «웹훅과 시크릿이 하나뿐» 이라는 전제였는데 그게 틀렸다. 그 뒤 6주 동안 OAuth 를 한 번도
     돌리지 않아 아무도 몰랐고, 2026-08-31 재연동에서 «Error validating verification code» 로 터졌다.
     인가는 client_id 만 쓰므로 동의 화면은 멀쩡히 뜨고, 시크릿을 처음 쓰는 토큰 교환에서 죽는다.

     폴백을 남긴다 — 전용 변수가 없는 환경에서 기존 동작을 깨지 않기 위해서다. */
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
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
  /* ⚠️ 프록시가 여러 겹이면 이 헤더가 «https,https» · «a.com,b.com» 처럼 **쉼표로 누적**된다.
     그대로 쓰면 redirect_uri 가 망가지고, 두 요청(인가·토큰교환)에서 값이 달라져
     Meta 가 «redirect_uri 가 인가 때와 다르다» 로 거절한다(2026-08-31 실제로 여기서 막혔다).
     첫 값만 취한다 — 원본 클라이언트에 가장 가까운 값이다. */
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const proto = first(request.headers.get("x-forwarded-proto")) ?? "https";
  const host =
    first(request.headers.get("x-forwarded-host")) ?? first(request.headers.get("host")) ?? "localhost:3000";
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

/**
 * 계정별 웹훅 구독 — 연동 직후 반드시 호출한다.
 * 앱 대시보드에서 comments/messages 필드를 구독해도, 계정 단위로 subscribed_apps를 켜지 않으면
 * 그 계정의 웹훅 이벤트는 발송되지 않는다 (docs/REAL_API_SPEC.md 1절, Meta Webhooks 문서).
 * 실패해도 연동 자체는 유효하므로 호출측은 로그만 남기고 진행한다.
 */
export async function subscribeWebhookFields(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  const q = new URLSearchParams({
    subscribed_fields: "comments,messages",
    access_token: accessToken,
  });
  try {
    const res = await fetch(`${GRAPH_INSTAGRAM_BASE}/me/subscribed_apps?${q.toString()}`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || json.success !== true) {
      return { ok: false, error: json.error?.message ?? `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface InstagramAccountInfo {
  id: string;
  username: string;
  name: string | null;
  /** 100팔로워 미만 계정은 인스타그램이 안 준다 — 그때는 null 이다(0 이 아니다) */
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
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
    /* ⚠️ 결측을 0 으로 확정하지 않는다. 100팔로워 미만 계정은 followers_count 가 **아예 안 온다**
       (스펙 1절 «소액 계정 제약»). 0 으로 두면 화면이 «팔로워 0» 을 확언하고, 그 값이 DB 까지
       덮어써 실제로 팔로워가 있는 계정도 0 이 된다. 모르는 것과 없는 것은 다르다 — null 로 둔다. */
    followersCount: typeof json.followers_count === "number" ? json.followers_count : null,
    followsCount: typeof json.follows_count === "number" ? json.follows_count : null,
    mediaCount: typeof json.media_count === "number" ? json.media_count : null,
    profilePictureUrl: typeof json.profile_picture_url === "string" ? json.profile_picture_url : null,
    biography: typeof json.biography === "string" ? json.biography : null,
    website: typeof json.website === "string" ? json.website : null,
  };
}
