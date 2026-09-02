/**
 * 메타 광고 OAuth 어댑터 — **Facebook Login 경로**(graph.facebook.com).
 *
 * ⚠️ 인스타·스레드와 **완전히 다른 네 번째 연동**이다. 기존 토큰으로는 광고를 한 줄도 못 부른다:
 *  · 호스트가 다르다 — graph.facebook.com (인스타는 graph.instagram.com)
 *  · 자격증명이 다르다 — Facebook 앱 ID/시크릿 (인스타는 Instagram 제품의 ID/시크릿)
 *  · 스코프가 다르다 — ads_read (인스타 스코프엔 광고 권한이 아예 없다)
 *
 * ⚠️⚠️ **장기 토큰이 자동 갱신되지 않는다.** (developers.facebook.com 확인, 2026-09-01)
 * 약 60일 뒤 만료되면 **사용자가 다시 로그인하는 것 말고는 방법이 없다.**
 * 인스타(ig_refresh_token)·스레드(th_refresh_token)·틱톡(refresh_token)은 전부 갱신이 되는데
 * 광고만 안 된다 — 그래서 설정 화면이 만료일을 **숨기지 않고 보여줘야** 한다.
 *
 * 1단계는 **읽기 전용**이다. 캠페인 생성·수정(ads_management)은 Advanced Access 가 필요해 뒤로 미룬다.
 * 서버 전용: client_secret·토큰을 클라이언트로 절대 노출하지 않는다.
 */

/** Marketing API 버전 — graph.ts 의 인스타 버전과 별개다(제품이 다르다) */
export const GRAPH_FB_VERSION = "v25.0";
export const GRAPH_FB_BASE = `https://graph.facebook.com/${GRAPH_FB_VERSION}`;
const FB_DIALOG_BASE = `https://www.facebook.com/${GRAPH_FB_VERSION}/dialog/oauth`;

/**
 * 1단계는 읽기 전용이라 ads_read 하나만 받는다.
 * ads_management(생성·수정)를 넣으면 동의 화면이 무거워지고 심사도 별건이 된다 —
 * 실제로 쓸 수 있게 된 뒤에 추가한다(스코프는 동의 시점에 고정되므로 그때 재연동이 필요하다).
 */
export const META_ADS_SCOPES = ["ads_read"] as const;

/** 사람이 읽는 권한 설명 — 스코프를 키로 묶어 누락이 컴파일에서 걸리게 한다(instagram-oauth.ts 와 같은 규칙) */
export const META_ADS_SCOPE_LABELS: Record<(typeof META_ADS_SCOPES)[number], string> = {
  ads_read: "광고 계정·캠페인 성과 조회",
};

export interface MetaAdsOAuthConfig {
  appId: string;
  appSecret: string;
}

/**
 * 앱 설정 로드 — 미설정이면 null (연동 버튼 비활성).
 *
 * ⚠️ **Facebook 앱**의 ID·시크릿이다. Meta 앱 대시보드 «설정 > 기본 설정»의 값이고,
 * Instagram 제품 화면의 «Instagram 앱 ID/시크릿»과는 **다른 값**이다.
 * 2026-08-06 에 이 둘을 «통일»한다며 합쳤다가 인스타 토큰 교환이 6주간 조용히 깨져 있었다
 * (2026-08-31 적발). 제품마다 자격증명 쌍이 따로 있다는 것이 이 저장소가 비싸게 배운 사실이다.
 *
 * ⚠️ **광고 전용 변수를 먼저 본다.** 메타는 «이용 사례»끼리 호환되지 않으면 같은 앱에 못 붙인다
 * (공식 문서: 호환 안 되는 이용 사례는 회색으로 비활성화된다). 광고 이용 사례가 기존
 * 인스타·스레드 앱에 안 붙으면 **광고용 앱을 따로 만들어야 하는데**, 그때 META_APP_SECRET 을
 * 새 앱 값으로 덮으면 **인스타 웹훅 서명 검증이 조용히 깨진다**(같은 변수를 쓴다).
 * 그래서 광고는 자기 변수를 갖고, 없을 때만 공용 값으로 떨어진다 — 같은 앱이면 META_APP_ID 만 넣으면 된다.
 */
export function getMetaAdsOAuthConfig(): MetaAdsOAuthConfig | null {
  const appId = process.env.META_ADS_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isMetaAdsOAuthConfigured(): boolean {
  return getMetaAdsOAuthConfig() !== null;
}

export const META_ADS_CALLBACK_PATH = "/api/auth/meta-ads/callback";

/**
 * 콜백(redirect_uri) 계산 — 인가·토큰교환 두 단계가 **글자까지 같아야** 한다.
 * 다르면 Meta 가 «Error validating verification code … redirect_uri» 로 거절한다(2026-08-31 실경험).
 * 프록시가 여러 겹이면 x-forwarded-* 가 쉼표로 누적되므로 첫 값만 취한다.
 */
export function resolveAdsCallbackUri(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return `${configured.replace(/\/$/, "")}${META_ADS_CALLBACK_PATH}`;
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  const proto = first(request.headers.get("x-forwarded-proto")) ?? "https";
  const host =
    first(request.headers.get("x-forwarded-host")) ?? first(request.headers.get("host")) ?? "localhost:3000";
  return `${proto}://${host}${META_ADS_CALLBACK_PATH}`;
}

/** 인가 URL — state 는 CSRF 방지용(쿠키에도 저장해 콜백에서 대조) */
export function buildAdsAuthorizeUrl(params: { appId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: params.redirectUri,
    state: params.state,
    response_type: "code",
    scope: META_ADS_SCOPES.join(","),
  });
  return `${FB_DIALOG_BASE}?${q.toString()}`;
}

export interface FbToken {
  accessToken: string;
  /** 단기 토큰은 이 값이 없을 수 있다 — 장기 교환 뒤의 값을 저장한다 */
  expiresInSeconds: number | null;
}

async function fbTokenCall(qs: URLSearchParams, what: string): Promise<FbToken> {
  const res = await fetch(`${GRAPH_FB_BASE}/oauth/access_token?${qs.toString()}`);
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string; type?: string; code?: number };
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`${what}: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return {
    accessToken: json.access_token,
    expiresInSeconds: typeof json.expires_in === "number" ? json.expires_in : null,
  };
}

/** code → 단기 사용자 토큰. redirect_uri 는 인가 때와 정확히 같아야 한다. */
export async function exchangeAdsCodeForToken(params: {
  code: string;
  redirectUri: string;
  config: MetaAdsOAuthConfig;
}): Promise<FbToken> {
  return fbTokenCall(
    new URLSearchParams({
      client_id: params.config.appId,
      client_secret: params.config.appSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
    }),
    "ads_code_exchange_failed",
  );
}

/**
 * 단기 → 장기 토큰(약 60일).
 * ⚠️ 이 토큰은 **다시 연장할 수 없다.** 만료되면 사용자가 재로그인해야 한다.
 */
export async function exchangeAdsForLongLivedToken(params: {
  shortLivedToken: string;
  config: MetaAdsOAuthConfig;
}): Promise<FbToken> {
  return fbTokenCall(
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: params.config.appId,
      client_secret: params.config.appSecret,
      fb_exchange_token: params.shortLivedToken,
    }),
    "ads_longlived_exchange_failed",
  );
}

export interface FbMe {
  id: string;
  name: string | null;
}

/** 토큰 주인 확인 — 연동 해제·데이터 삭제 콜백이 이 id 로 행을 찾는다 */
export async function fetchFbMe(accessToken: string): Promise<FbMe> {
  const res = await fetch(
    `${GRAPH_FB_BASE}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
  );
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.id) {
    throw new Error(`ads_me_failed: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return { id: String(json.id), name: typeof json.name === "string" ? json.name : null };
}

/**
 * 실제로 부여된 스코프 조회 — 요청한 것과 다를 수 있다(사용자가 개별 거부 가능).
 * 인스타는 토큰 교환 응답에 permissions 가 딸려 오는데 Facebook 은 안 준다 —
 * /me/permissions 를 따로 물어야 «무엇을 실제로 받았는지» 를 기록할 수 있다(0075 규칙).
 * 실패는 null — «권한 없음»이 아니라 «모름»이다.
 */
export async function fetchGrantedFbScopes(accessToken: string): Promise<string[] | null> {
  try {
    const res = await fetch(
      `${GRAPH_FB_BASE}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: { permission?: string; status?: string }[];
    };
    if (!res.ok || !Array.isArray(json.data)) return null;
    return json.data
      .filter((p) => p.status === "granted" && typeof p.permission === "string")
      .map((p) => p.permission as string);
  } catch {
    return null;
  }
}
