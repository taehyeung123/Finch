/**
 * TikTok Login Kit OAuth 어댑터 — lib/meta/instagram-oauth.ts / threads-oauth.ts와 동일 구조.
 * 근거·전체 스펙: docs/REAL_API_SPEC.md 6절.
 *
 * IG/Threads와 가장 큰 차이: 장기토큰이 자기 자신을 갱신하는 모델이 아니라
 *   access_token(24시간) + refresh_token(365일)이 분리된 표준 OAuth2 리프레시 모델이다.
 * 그래서 connected_accounts에 refresh_token도 별도 암호화 컬럼(refresh_token_cipher, 0011 마이그레이션)
 * 으로 저장해야 한다 — access_token_cipher 하나만 갱신하는 기존 패턴을 그대로 쓸 수 없다.
 *
 * PKCE 관련 결정: TikTok 공식 문서(Login Kit for Web)의 authorize URL 파라미터 목록에는
 * code_challenge가 없고, code_verifier는 "Desktop/Mobile(공개 클라이언트) 전용"으로 명시돼 있다
 * (핀치는 client_secret을 서버에 보관하는 confidential client이므로 web 플로우 대상).
 * 따라서 이 구현은 PKCE를 사용하지 않는다. TODO: TikTok이 향후 web 플로우에도 PKCE를 요구하도록
 * 문서를 바꾸면(실무에서 종종 문서와 실제 동작이 다르다는 보고가 있어 완전히 배제하긴 어렵다) 여기에
 * code_verifier(unreserved 문자셋, 43~128자)/code_challenge(SHA256 hex, S256) 생성을 추가할 것.
 * 출처: https://developers.tiktok.com/doc/login-kit-web/ , https://developers.tiktok.com/doc/login-kit-desktop/
 *
 * 서버 전용: client_secret·토큰을 클라이언트로 절대 노출하지 않는다 (NEXT_PUBLIC_ 금지).
 * 사업자등록·앱심사 없이 Sandbox + 등록된 target user(테스터 계정, 최대 10개)로 동작한다.
 */

/** 문서에서 확인된 범위 — 팔로워/좋아요/영상 수 + 기본 프로필(아바타·닉네임·아이디)까지만 요청한다.
 *  video.list 등 영상 목록/인사이트 관련 스코프는 심사 없이 동작한다는 확답을 얻지 못해 요청하지 않는다. */
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats"] as const;

/** 사람이 읽는 권한 설명 — 설정 화면 투명성 고지용 (스코프와 1:1) */
export const TIKTOK_SCOPE_LABELS = [
  "프로필 기본 정보 조회(닉네임·아바타)",
  "사용자명(고유 아이디) 조회",
  "팔로워·좋아요·영상 수 조회",
];

export interface TiktokOAuthConfig {
  clientKey: string;
  clientSecret: string;
}

/** 앱 설정 로드 — 미설정이면 null (연동 버튼은 비활성 안내) */
export function getTiktokOAuthConfig(): TiktokOAuthConfig | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return null;
  return { clientKey, clientSecret };
}

export function isTiktokOAuthConfigured(): boolean {
  return getTiktokOAuthConfig() !== null;
}

export const TIKTOK_CALLBACK_PATH = "/api/auth/tiktok/callback";

/**
 * 콜백(redirect_uri)을 계산한다. instagram-oauth.ts의 resolveCallbackUri와 동일한 우선순위:
 * NEXT_PUBLIC_SITE_URL(프로덕션 정본) → 요청 헤더(로컬/프리뷰).
 * 주의: TikTok 개발자 콘솔의 "Redirect URI" 허용목록에도 정확히 같은 값이 등록돼 있어야 한다.
 */
export function resolveTiktokCallbackUri(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return `${configured.replace(/\/$/, "")}${TIKTOK_CALLBACK_PATH}`;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3170";
  return `${proto}://${host}${TIKTOK_CALLBACK_PATH}`;
}

/** 인가 URL 생성 — state는 CSRF 방지용(쿠키에도 저장해 콜백에서 대조) */
export function buildTiktokAuthorizeUrl(params: { clientKey: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_key: params.clientKey,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: params.redirectUri,
    state: params.state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q.toString()}`;
}

const TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";

export interface TiktokTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
  openId: string;
  scope: string;
}

interface TiktokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  token_type?: string;
  // 에러 형태가 문서상 명확히 통일돼 있지 않아(구형 플랫 OAuth2 vs 신형 v2 { error: {...} } 래핑) 둘 다 방어적으로 파싱한다.
  error?: string | { code?: string; message?: string; log_id?: string };
  error_description?: string;
}

function extractTiktokError(json: TiktokTokenResponse, httpStatus: number): string {
  if (typeof json.error === "string") return json.error_description ?? json.error;
  if (json.error && typeof json.error === "object") return json.error.message ?? json.error.code ?? `http_${httpStatus}`;
  return `http_${httpStatus}`;
}

/**
 * code → 토큰 교환. code·redirect_uri는 인가 요청 때 값과 정확히 일치해야 한다.
 * 응답에 access_token(24시간)과 refresh_token(365일)이 함께 온다 — 둘 다 암호화해 저장해야 한다.
 */
export async function exchangeTiktokCodeForToken(params: {
  code: string;
  redirectUri: string;
  config: TiktokOAuthConfig;
}): Promise<TiktokTokenResult> {
  const body = new URLSearchParams({
    client_key: params.config.clientKey,
    client_secret: params.config.clientSecret,
    code: params.code,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TiktokTokenResponse;
  if (!res.ok || !json.access_token || !json.refresh_token || !json.open_id) {
    throw new Error(`code_exchange_failed: ${extractTiktokError(json, res.status)}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in ?? 24 * 60 * 60,
    refreshExpiresInSeconds: json.refresh_expires_in ?? 365 * 24 * 60 * 60,
    openId: json.open_id,
    scope: json.scope ?? "",
  };
}

/**
 * 리프레시 — refresh_token으로 새 access_token(+보통 새 refresh_token)을 받는다.
 * 응답의 refresh_token이 기존 값과 다를 수 있어(회전) 호출측이 항상 재저장해야 한다.
 */
export async function refreshTiktokToken(refreshToken: string, config: TiktokOAuthConfig): Promise<TiktokTokenResult> {
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TiktokTokenResponse;
  if (!res.ok || !json.access_token || !json.refresh_token || !json.open_id) {
    throw new Error(`refresh_failed: ${extractTiktokError(json, res.status)}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in ?? 24 * 60 * 60,
    refreshExpiresInSeconds: json.refresh_expires_in ?? 365 * 24 * 60 * 60,
    openId: json.open_id,
    scope: json.scope ?? "",
  };
}
