/**
 * 실 광고 데이터 프로바이더 (서버 전용) — 연동된 메타 광고 계정의 캠페인·성과를 조회한다.
 *
 * 흐름: meta_ad_connections 조회(RLS) → 토큰 복호화 → 광고 계정 선택 → 캠페인·인사이트 조회.
 * 인스타(live.ts)와 같은 규칙을 따르되 **갱신 단계가 없다** —
 * 페이스북 장기 사용자 토큰은 자동 갱신이 불가능하고, 만료되면 재연동뿐이다.
 *
 * ⚠️ **실패는 «없음»이 아니다.** 이 파일이 돌려주는 상태는 여섯이다:
 *   unconfigured — 연동 자체가 아직 안 열렸다(운영자 일)
 *   disconnected — 연동 안 함 (사용자가 연결하면 된다)
 *   expired      — 토큰 만료 (재연동해야 한다)
 *   no_accounts  — 연동은 됐는데 **접근 가능한 광고 계정이 없다** (메타에서 권한을 받아야 한다)
 *   error        — 조회 실패 (일시적일 수 있다)
 *   ok           — 조회 성공
 * 화면은 이 여섯을 **다르게** 그려야 한다. 하나로 뭉치면
 * 「아직 연결한 광고 계정이 없어요」가 조회 실패한 사람에게도 뜨고,
 * 새로고침으로 절대 안 풀리는 상태에 「잠시 후 새로고침해 주세요」가 붙는다.
 */

import { cache } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidAdAccountId } from "@/lib/meta/ad-account-id";
import { isDemoMode } from "@/lib/supabase/config";
import { getWorkspaceMembership, getWorkspaceOwnerId } from "@/lib/team";
import { decryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { isMissingTableError } from "@/lib/supabase/errors";
import { isMissingColumnError } from "@/lib/publish-rules";
import { getConsentStatus } from "@/lib/legal/consent";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";
import { isMetaAdsOAuthConfigured } from "@/lib/meta/ads-oauth";
import { isChannelClosed } from "@/lib/channel-availability";
import {
  fetchAdAccountOwners,
  fetchCampaignInsights,
  fetchCampaigns,
  fetchMyBusinesses,
  type FbCampaign,
} from "@/lib/meta/ads";
import { checkScope, REQUIRED_SCOPE } from "@/lib/meta/granted-scopes";
import { resolveAccountBusiness, type AdPortfolioState } from "@/lib/ads/portfolio";
import {
  fetchAccountAdReview,
  fetchAds,
  fetchAdSets,
  fetchCampaignDetail,
  type AdReviewSummary,
  type FbAd,
  type FbAdSet,
  type FbCampaignDetail,
} from "@/lib/meta/ads-tree";

export interface LiveAdAccount {
  adAccountId: string;
  name: string | null;
  /** 계정 통화 코드(KRW·USD…). 화면은 이 값으로 포맷한다 — 원화로 가정하지 않는다. */
  currency: string | null;
  isDefault: boolean;
  /** 1=활성, 2=비활성, 3=미납 … null 이면 모름 */
  accountStatus: number | null;
}

/** 캠페인 + 성과 — 성과는 «아직 집행 전»이면 없을 수 있다(null 과 0 을 구분한다) */
export interface LiveAdCampaign {
  id: string;
  name: string;
  objective: string | null;
  /** Meta 원문 상태 — 화면이 한국어로 옮긴다 */
  status: string | null;
  effectiveStatus: string | null;
  /** 지출과 같은 **주 단위**. null 이면 광고 세트에서 예산을 관리한다는 뜻(0원이 아니다) */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  /** 조회 기간에 노출이 한 번도 없으면 인사이트 행 자체가 안 온다 → null */
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  linkClicks: number | null;
  ctr: number | null;
  cpc: number | null;
  /** 픽셀이 없으면 존재하지 않는 값 — 0 이 아니다 */
  conversions: number | null;
  roas: number | null;
}

export type LiveAdsState =
  | { state: "unconfigured" }
  | { state: "disconnected" }
  | { state: "expired"; expiredAt: string | null }
  | { state: "no_accounts" }
  | { state: "error" }
  | {
      state: "ok";
      accounts: LiveAdAccount[];
      selected: LiveAdAccount;
      campaigns: LiveAdCampaign[];
      /** 캠페인은 읽었는데 성과만 못 읽은 경우 — 캠페인 이름은 보여주되 숫자는 «—» 로 둔다 */
      insightsOk: boolean;
      /** 조회 기간(화면이 라벨로 쓴다 — «누적»이라고 말하면 거짓이 된다) */
      datePreset: string;
      /** 토큰 만료까지 남은 일수. 갱신이 없으므로 화면이 이걸 **숨기지 않고** 보여준다 */
      expiresInDays: number | null;
    };

interface ConnectionRow {
  id: string;
  access_token_cipher: string | null;
  token_expires_at: string | null;
  connected: boolean;
}

interface AdAccountRow {
  ad_account_id: string;
  account_name: string | null;
  currency: string | null;
  account_status: number | null;
  is_default: boolean;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * 연동이 **열려 있는가** — 앱 자격증명 + 토큰 암호화 키.
 * ⚠️ 설정 화면의 버튼 조건(metaAdsReady)과 **같은 기준**이어야 한다.
 * 예전엔 여기서 암호화 키를 안 봐서, 키만 빠진 환경에서 /ads 는 «연결하기»로 보내는데
 * 설정 화면엔 버튼이 없는 막다른 길이 생겼다.
 */
function isAdsConnectable(viewerEmail: string | null | undefined): boolean {
  /* «아직 열지 않은 기간»도 여기 포함한다 — 안 그러면 /ads 는 「연결하기」로 보내는데 설정 화면엔 버튼이 없는
     막다른 길이 다시 생긴다(2026-09-06, lib/channel-availability.ts).
     ⚠️ 운영자 예외를 **여기서도** 본다(2026-09-09). 전에는 이메일 없이 불러 운영자에게도 닫혀 있었다 — 설정 화면과
     연동 시작은 운영자를 통과시키는데 광고 화면만 막혀서, 연동을 끝내도 CHANNELS_OPEN 에 ads 를 넣기 전까지
     광고 화면이 전부 「준비 중」이었고, 넣는 순간 고객에게도 동시에 열렸다. 승인 전에 운영자가 먼저 점검할 길이 없었다. */
  return isMetaAdsOAuthConfigured() && isTokenEncryptionConfigured() && !isChannelClosed("ads", viewerEmail);
}

/**
 * 읽기 컨텍스트 — 연동 행 → 토큰 복호화 → 계정 선택까지. 캠페인 목록(loadLiveAds)과
 * 캠페인 상세 트리(getCampaignTree)가 **같은 단계·같은 상태 구분**을 쓰기 위해 뽑아 둔 공통부.
 * ⚠️ token 을 들고 있다 — 이 타입은 이 파일 밖으로 나가지 않는다(직렬화 경계를 넘기지 않는다).
 */
type ReadContext =
  | { state: "unconfigured" }
  | { state: "disconnected" }
  | { state: "expired"; expiredAt: string | null }
  | { state: "no_accounts" }
  | { state: "error" }
  | {
      state: "ok";
      token: string;
      accounts: LiveAdAccount[];
      selected: LiveAdAccount;
      expiresInDays: number | null;
    };

/**
 * ⚠️ 인자는 **항상 1개**로 부른다(`loadReadContextCached(undefined)` 포함). React cache() 는 arguments.length 를
 * 캐시 키의 일부로 쓴다 — `fn()` 과 `fn(undefined)` 가 서로 다른 슬롯이라 공유가 조용히 깨진다(슬라이스 1 소넷 점검).
 */
async function loadReadContext(adAccountId: string | undefined): Promise<ReadContext> {
  if (isDemoMode()) return { state: "disconnected" };

  /* 사용자를 먼저 읽는다 — 채널 개폐 판정에 운영자 예외가 필요하다(위 isAdsConnectable 주석) */
  const user = await getAuthUser();
  if (!isAdsConnectable(user?.email)) return { state: "unconfigured" };
  if (!user) return { state: "disconnected" };

  const supabase = await createClient();
  const ownerId = await getWorkspaceOwnerId(supabase, user.id);

  /* 토큰 암호문은 **service_role 로만** 읽는다(0085) — 세션 클라이언트로 읽던 시절엔 같은 조회를
     사용자가 PostgREST 로 직접 흉내 내 소유자의 광고 토큰 암호문을 가져갈 수 있었다(2026-09-07 감사).
     접근 범위는 위에서 정한 ownerId 가 정한다 — admin 은 RLS 를 우회하므로 필터가 곧 권한이다.
     ⚠️ **세션 클라이언트로 폴백하지 않는다** — 폴백은 0085 미적용 DB 에서만 성공하는데 그 성공이
     곧 이 수리가 막으려던 조회다(소넷 점검 #1). 닫는 쪽으로 실패한다. */
  const store = createAdminClient();
  if (!store) {
    console.error("[live-ads] 광고 연동 조회 불가 — 서버 자격증명 미설정");
    return { state: "error" };
  }

  const { data: connRaw, error: connErr } = await store
    .from("meta_ad_connections")
    .select("id, access_token_cipher, token_expires_at, connected")
    .eq("user_id", ownerId)
    .eq("connected", true)
    .limit(1)
    .maybeSingle();

  if (connErr) {
    /* 0077 미적용이면 표 자체가 없다 — 그건 «조회 실패»가 아니라 아직 열리지 않은 기능이다.
       실패로 다루면 「지금은 불러오지 못했어요」가 전원에게 뜨고, 새로고침해도 영영 그대로다. */
    if (isMissingTableError(connErr)) return { state: "disconnected" };
    console.error("[live-ads] 연동 조회 실패:", connErr.message);
    return { state: "error" };
  }
  const conn = connRaw as ConnectionRow | null;
  if (!conn || !conn.access_token_cipher) return { state: "disconnected" };

  const expiresInDays = daysUntil(conn.token_expires_at);
  /* 만료를 미리 걸러낸다 — 만료 토큰으로 호출하면 그냥 «조회 실패»로 보여서
     사용자가 **무엇을 해야 하는지**(재연동) 알 수 없다. */
  if (expiresInDays !== null && expiresInDays <= 0) {
    return { state: "expired", expiredAt: conn.token_expires_at };
  }

  const token = decryptToken(conn.access_token_cipher, {
    userId: ownerId,
    field: "meta_ad_connections.access_token_cipher",
  });
  if (!token) {
    /* v2 는 소유자 결속(AAD)까지 본다 — 다른 행에서 옮겨 온 암호문도 여기로 떨어진다(2026-09-08) */
    console.error("[live-ads] 토큰 복호화 실패 — 키가 바뀌었거나 소유자가 맞지 않는다");
    return { state: "error" };
  }

  /* ⚠️ **소유자 것으로 두 번 좁힌다** — connection_id 만으로는 부족하다(2026-09-08 감사, High).
     0077 RLS 는 meta_ad_accounts 에 «내 행인가»(user_id)만 보고 «내 연결인가»(connection_id)는 안 본다.
     그래서 활성 팀원이 자기 소유의 계정 행을 **소유자의 connection_id 에 매달아** 심을 수 있었고,
     그 행이 아래에서 selected 가 되면 Graph 호출이 **소유자 토큰**으로 나갔다.
     세션 클라이언트로 읽으면 공격자 자신의 행도 RLS 상 정상으로 보이므로, 여기서 admin 으로
     user_id = ownerId 를 함께 건다 — 소유자 워크스페이스의 계정만 고를 수 있게. */
  const { data: acctRaw, error: acctErr } = await store
    .from("meta_ad_accounts")
    .select("ad_account_id, account_name, currency, account_status, is_default")
    .eq("user_id", ownerId)
    .eq("connection_id", conn.id)
    .order("is_default", { ascending: false })
    .order("account_name", { ascending: true });

  if (acctErr) {
    console.error("[live-ads] 광고 계정 조회 실패:", acctErr.message);
    return { state: "error" };
  }
  /* ⚠️ 형식(숫자)이 아닌 ad_account_id 는 **고를 수 있는 계정에서 뺀다**(2026-09-08 감사, High).
     0088 이전에는 이 컬럼을 로그인 사용자가 PostgREST 로 임의 문자열로 바꿀 수 있었고,
     그 값이 Graph URL 경로에 인코딩 없이 조립돼 **소유자 토큰으로 임의 엔드포인트**를 부를 수 있었다.
     actPath 가 던져서 막기는 하지만, 그러면 화면이 «지금은 불러오지 못했어요» 로만 보인다 —
     여기서 미리 걸러야 사용자가 «연결된 계정이 없다» 는 정확한 상태를 본다.
     형식 위반은 «일시적 실패»가 아니라 정상 데이터가 아닌 것이므로 no_accounts 쪽으로 보낸다. */
  const rows = ((acctRaw ?? []) as AdAccountRow[]).filter((r) => isValidAdAccountId(r.ad_account_id));
  /* 연동은 됐는데 계정이 없다 — 메타에서 광고 계정 권한을 못 받은 것이다.
     이건 «일시적 실패»가 아니라 **새로고침으로는 절대 안 풀리는** 상태라 따로 돌려준다. */
  if (rows.length === 0) return { state: "no_accounts" };

  const accounts: LiveAdAccount[] = rows.map((r) => ({
    adAccountId: r.ad_account_id,
    name: r.account_name,
    currency: r.currency,
    isDefault: r.is_default,
    accountStatus: r.account_status,
  }));
  const selected =
    (adAccountId ? accounts.find((a) => a.adAccountId === adAccountId) : null) ??
    accounts.find((a) => a.isDefault) ??
    accounts[0];

  return { state: "ok", token, accounts, selected, expiresInDays };
}

/* 한 렌더 안에서 목록·상세·심사 요약이 같은 컨텍스트를 나눠 쓴다(연동 행 조회·복호화 1회) */
const loadReadContextCached = cache(loadReadContext);

async function loadLiveAds(datePreset: string, adAccountId?: string): Promise<LiveAdsState> {
  const rc = await loadReadContextCached(adAccountId);
  if (rc.state !== "ok") return rc;
  const { token, accounts, selected, expiresInDays } = rc;

  /* 캠페인과 인사이트를 나란히 부른다 — 둘은 서로를 기다릴 이유가 없다.
     인사이트만 실패해도 캠페인 목록은 보여줄 수 있다(그 반대는 의미가 없다). */
  const [campaigns, insights] = await Promise.all([
    fetchCampaigns(selected.adAccountId, token, selected.currency),
    fetchCampaignInsights(selected.adAccountId, token, datePreset),
  ]);

  if (campaigns === null) return { state: "error" };

  const byId = new Map((insights ?? []).map((i) => [i.campaignId, i]));
  const merged: LiveAdCampaign[] = campaigns.map((c: FbCampaign) => {
    const i = byId.get(c.id);
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effectiveStatus: c.effectiveStatus,
      dailyBudget: c.dailyBudget,
      lifetimeBudget: c.lifetimeBudget,
      /* 인사이트 조회 자체가 실패했으면 전부 null(«모름»).
         성공했는데 이 캠페인 행이 없으면 기간 중 집행이 없었다는 뜻이라 0 이 맞다. */
      spend: insights === null ? null : (i?.spend ?? 0),
      impressions: insights === null ? null : (i?.impressions ?? 0),
      reach: insights === null ? null : (i?.reach ?? 0),
      linkClicks: insights === null ? null : (i?.linkClicks ?? 0),
      ctr: insights === null ? null : (i?.ctr ?? null),
      cpc: insights === null ? null : (i?.cpc ?? null),
      conversions: insights === null ? null : (i?.conversions ?? null),
      roas: insights === null ? null : (i?.roas ?? null),
    };
  });

  return {
    state: "ok",
    accounts,
    selected,
    campaigns: merged,
    insightsOk: insights !== null,
    datePreset,
    expiresInDays,
  };
}

/**
 * 광고 성과 조회. adAccountId 를 주면 그 계정을, 안 주면 기본 계정을 본다.
 *
 * 팀 워크스페이스에서는 **소유자의 연동**을 본다 — 멤버가 각자 연결하게 두면
 * 같은 화면이 사람마다 다른 숫자를 낸다(live.ts 와 같은 규칙).
 *
 * ⚠️ React cache() 로 감싼다 — Next 페치 캐시를 끈 대신(토큰이 캐시 파일에 남는다),
 * 한 렌더 안에서 여러 번 불려도 Graph 호출은 한 번만 나가게 한다.
 */
const loadLiveAdsCached = cache(loadLiveAds);

export function getLiveAds(options?: {
  adAccountId?: string;
  datePreset?: string;
}): Promise<LiveAdsState> {
  return loadLiveAdsCached(options?.datePreset ?? "last_30d", options?.adAccountId);
}

/* ── 캠페인 상세 트리 (2단계 슬라이스 1 — 읽기 전용) ─────────────── */

export type CampaignTreeState =
  | { state: "unconfigured" }
  | { state: "disconnected" }
  | { state: "expired"; expiredAt: string | null }
  | { state: "no_accounts" }
  | { state: "error" }
  /** 캠페인이 없거나 **선택된 광고 계정의 것이 아니다** — 화면은 404 */
  | { state: "not_found" }
  | {
      state: "ok";
      selected: LiveAdAccount;
      campaign: FbCampaignDetail;
      /** null = 못 읽음(«없음»이 아니다). 화면이 «불러오지 못했어요»를 따로 그린다 */
      adsets: FbAdSet[] | null;
      ads: FbAd[] | null;
      expiresInDays: number | null;
    };

/**
 * 캠페인 하나의 하위 계층. **읽기에도 소유 대조**를 한다 — 소유자 토큰은 그 사람의 모든 광고 계정을
 * 커버하므로, URL 의 campaignId 만 믿으면 팀원이 id 를 바꿔 다른 고객사 캠페인 내부를 읽는다(설계 검토 major).
 * 대조 실패(null)는 error(«확인 못 함»), 계정 불일치는 not_found 다.
 */
export const getCampaignTree = cache(async (campaignId: string): Promise<CampaignTreeState> => {
  const rc = await loadReadContextCached(undefined);
  if (rc.state !== "ok") return rc;
  const { token, selected, expiresInDays } = rc;

  const campaign = await fetchCampaignDetail(campaignId, token, selected.currency);
  if (campaign === null) return { state: "error" };
  if (campaign.accountId === null || campaign.accountId !== selected.adAccountId) return { state: "not_found" };

  const [adsets, ads] = await Promise.all([
    fetchAdSets(campaignId, token, selected.currency),
    fetchAds(campaignId, token),
  ]);
  return { state: "ok", selected, campaign, adsets, ads, expiresInDays };
});

/**
 * 목록 배지용 심사 요약 — 계정 광고를 한 번에 읽어 캠페인별로 묶는다.
 * null = 못 읽음 → 배지를 **숨긴다**(0 을 그리지 않는다). 연동이 ok 가 아니어도 null.
 */
export const getAccountAdReview = cache(async (): Promise<Record<string, AdReviewSummary> | null> => {
  const rc = await loadReadContextCached(undefined);
  if (rc.state !== "ok") return null;
  return fetchAccountAdReview(rc.selected.adAccountId, rc.token);
});

/* ── 쓰기 컨텍스트 (캠페인 생성·수정 전용) ───────────────────────── */

/** 광고 게시 주체 — 0082 컬럼(meta_ad_accounts.ad_page_id …). 없으면 소재를 만들 수 없다 */
export interface AdPublisher {
  pageId: string;
  pageName: string | null;
  igUserId: string | null;
  igUsername: string | null;
}

export type AdsWriteContext =
  | {
      state: "ok";
      /** 복호화된 FB 토큰 — **클라이언트로 절대 내보내지 않는다**(서버 액션 안에서만) */
      accessToken: string;
      adAccountId: string;
      /** 쓰기에서 통화를 모르면 거절한다 — 모르는 통화로 금액을 보내면 100배 오차 직행로다 */
      currency: string;
      accountStatus: number | null;
      grantedScopes: string[] | null;
      /** 소유자 id — 감사 로그(user_id)와 권한 판정에 쓴다 */
      ownerId: string;
      /** 쓰기를 요청한 사람의 워크스페이스 역할 */
      role: "owner" | "editor" | "viewer" | "unknown";
      /** 저장된 게시 주체. null = 아직 고르지 않았다(또는 0082 미적용) */
      publisher: AdPublisher | null;
    }
  | { state: "blocked"; code: AdsWriteFailCode };

/**
 * 쓰기용 연동 컨텍스트 — getLiveAds 와 달리 **토큰을 밖으로 준다**(서버 액션 전용, 캐시 없음).
 * 조회 함수에 토큰을 실어 두면 언젠가 직렬화 경계를 넘는다 — 쓰기 경로만 따로 판다.
 */
export async function getAdsWriteContext(adAccountId?: string): Promise<AdsWriteContext> {
  if (isDemoMode()) return { state: "blocked", code: "demo_mode" };

  const user = await getAuthUser();
  if (!isAdsConnectable(user?.email)) return { state: "blocked", code: "unconfigured" };
  if (!user) return { state: "blocked", code: "login_required" };

  /* 동의 게이트(0079) — 페이지 게이트는 서버 액션 POST 를 못 막는다(감사 적발).
     돈이 걸린 쓰기는 미동의 상태로 열지 않는다. unknown 은 다른 게이트와 같은 이유로 통과. */
  if ((await getConsentStatus(user.id)) === "missing") {
    return { state: "blocked", code: "consent_required" };
  }

  const supabase = await createClient();
  const membership = await getWorkspaceMembership(supabase, user.id);
  /* 돈이 걸린 쓰기 — viewer·unknown 은 거절한다. 읽기의 fail-open 과 반대 방향이 맞다:
     모르는 채로 소유자 돈을 쓰게 두는 쪽이 더 나쁘다. 0077 RLS 는 읽기를 의도적으로
     열어 주므로 DB 가 못 막고, 여기가 유일한 관문이다. */
  if (membership.role !== "owner" && membership.role !== "editor") {
    return { state: "blocked", code: "role_denied" };
  }

  /* 토큰 암호문은 service_role 로만 — loadReadContext 와 같은 이유(0085).
     쓰기 자격은 바로 위 membership 검사가 이미 정했다(viewer·unknown 은 여기 못 온다).
     ⚠️ 세션 클라이언트 폴백 없음 — loadReadContext 와 같은 이유(소넷 점검 #1). */
  const store = createAdminClient();
  if (!store) {
    console.error("[live-ads] 광고 쓰기 컨텍스트 조회 불가 — 서버 자격증명 미설정");
    return { state: "blocked", code: "connection_unreadable" };
  }

  const { data: connRaw, error: connErr } = await store
    .from("meta_ad_connections")
    .select("id, access_token_cipher, token_expires_at, connected, granted_scopes")
    .eq("user_id", membership.ownerId)
    .eq("connected", true)
    .limit(1)
    .maybeSingle();
  if (connErr || !connRaw) {
    return { state: "blocked", code: "connection_missing" };
  }
  const conn = connRaw as ConnectionRow & { granted_scopes?: string[] | null };
  if (!conn.access_token_cipher) {
    return { state: "blocked", code: "connection_missing" };
  }
  const expiresInDays = daysUntil(conn.token_expires_at);
  if (expiresInDays !== null && expiresInDays <= 0) {
    return { state: "blocked", code: "connection_expired" };
  }
  const token = decryptToken(conn.access_token_cipher, {
    userId: membership.ownerId,
    field: "meta_ad_connections.access_token_cipher",
  });
  if (!token) {
    return { state: "blocked", code: "connection_unreadable" };
  }

  /* 게시 주체 컬럼(0082)은 없을 수 있다 — 빠지면 컬럼 없이 다시 읽는다(«아직 안 고름»과 같게 다룬다)
     ⚠️ 읽기 컨텍스트와 같은 이유로 **소유자 것으로 두 번 좁힌다**(user_id + connection_id, admin 으로).
     여기는 돈이 나가는 쪽이라 더 중요하다 — 팀원이 심은 행이 selected 가 되면 소유자 토큰으로
     소유자가 연결한 적 없는 광고 계정에 캠페인이 만들어진다(2026-09-08 감사, High). */
  const acctSelect = (cols: string) =>
    store
      .from("meta_ad_accounts")
      .select(cols)
      .eq("user_id", membership.ownerId)
      .eq("connection_id", conn.id)
      .order("is_default", { ascending: false });
  const primary = await acctSelect(
    "ad_account_id, currency, account_status, is_default, ad_page_id, ad_page_name, ad_ig_user_id, ad_ig_username",
  );
  let acctRows: unknown[] | null = primary.data;
  if (primary.error && isMissingColumnError(primary.error, /ad_page_id|ad_ig_user_id|ad_page_name|ad_ig_username/i)) {
    const fallback = await acctSelect("ad_account_id, currency, account_status, is_default");
    acctRows = fallback.data;
  }
  /* 읽기와 같은 필터 — 돈이 나가는 쪽이라 더 중요하다(2026-09-08 감사, High) */
  const rows = ((acctRows ?? []) as (AdAccountRow & {
    ad_page_id?: string | null;
    ad_page_name?: string | null;
    ad_ig_user_id?: string | null;
    ad_ig_username?: string | null;
  })[]).filter((r) => isValidAdAccountId(r.ad_account_id));
  const selected = (adAccountId ? rows.find((r) => r.ad_account_id === adAccountId) : null) ?? rows[0];
  if (!selected) {
    return { state: "blocked", code: "no_ad_account" };
  }
  if (!selected.currency) {
    // 통화를 모르면 쓰기 금지 — 조회의 «모르면 원문 그대로»와 반대다
    return { state: "blocked", code: "no_currency" };
  }

  return {
    state: "ok",
    accessToken: token,
    adAccountId: selected.ad_account_id,
    currency: selected.currency,
    accountStatus: selected.account_status,
    grantedScopes: conn.granted_scopes ?? null,
    ownerId: membership.ownerId,
    role: membership.role,
    publisher: selected.ad_page_id
      ? {
          pageId: selected.ad_page_id,
          pageName: selected.ad_page_name ?? null,
          igUserId: selected.ad_ig_user_id ?? null,
          igUsername: selected.ad_ig_username ?? null,
        }
      : null,
  };
}

/* ── 비즈니스 포트폴리오 (설정 › SNS 계정 연결, 2026-09-11) ───────────────── */

/** 예시 화면 — 설정 화면의 예시 광고 계정(«핀치 마케팅»)과 짝을 맞춘다 */
const DEMO_PORTFOLIOS: AdPortfolioState = {
  state: "ok",
  accounts: [
    { adAccountId: "demo", accountName: "핀치 마케팅", isDefault: true, business: { state: "owned", id: "demo-business", name: "핀치 컴퍼니" } },
  ],
};

/**
 * 내 광고 계정이 어느 비즈니스 포트폴리오 소속인지 — 설정 › SNS 계정 연결의 «비즈니스 포트폴리오» 줄(2026-09-11).
 *
 * 왜 있나: 메타 앱 심사에서 business_management 는 광고 이용 사례의 **필수 권한**인데, 요청한 권한마다
 * «성공한 호출 + 앱 안의 실제 쓰임»이 있어야 한다(docs/APP_REVIEW.md §4-1-3). 이 줄이 그 쓰임이다 —
 * 대행사처럼 계정이 여러 포트폴리오에 걸친 사람에게는 «이 계정이 누구 것인지»를 확인하는 자리이기도 하다.
 *
 * **저장하지 않고 열 때마다 읽는다** — 소속은 메타에서 바뀌는 값이고, 두 번의 조회(보통 수백 ms, 동시에 나간다)는 설정 화면이
 * Suspense 로 뒤따르게 그린다(연결 상태 줄은 기다리지 않는다). 저장하면 마이그레이션과 «옛 소속» 문제가 따라온다.
 *
 * ⚠️ «내 연결» 화면이라 **본인 연결**만 본다(user.id) — 워크스페이스 소유자의 것을 보는 getLiveAds 와 다르다.
 *    설정의 «Meta 광고» 줄(loadAdsCard)도 본인 행만 읽는다 — 둘이 같은 연결을 봐야 줄끼리 말이 맞는다.
 * ⚠️ 토큰 암호문은 service_role 로만(0085) — 범위는 `.eq("user_id", user.id)` 가 정한다(admin 은 RLS 를 우회한다).
 *    세션 클라이언트 폴백 없음(loadReadContext 와 같은 이유).
 * ⚠️ **던지지 않는다** — 설정 화면이 Suspense 안에서 부른다. 여기서 던지면 줄 하나가 아니라 설정 화면 전체가 오류 화면이 된다.
 */
export async function getOwnAdPortfolios(): Promise<AdPortfolioState> {
  try {
    return await loadOwnAdPortfolios();
  } catch (e) {
    console.error("[live-ads] 포트폴리오 조회 중 예외:", e instanceof Error ? e.message : String(e));
    return { state: "error" };
  }
}

async function loadOwnAdPortfolios(): Promise<AdPortfolioState> {
  if (isDemoMode()) return DEMO_PORTFOLIOS;

  const user = await getAuthUser();
  if (!user || !isAdsConnectable(user.email)) return { state: "unavailable" };

  const store = createAdminClient();
  if (!store) {
    console.error("[live-ads] 포트폴리오 조회 불가 — 서버 자격증명 미설정");
    return { state: "error" };
  }

  const { data: connRaw, error: connErr } = await store
    .from("meta_ad_connections")
    .select("id, access_token_cipher, token_expires_at, connected, granted_scopes")
    .eq("user_id", user.id)
    .eq("connected", true)
    .limit(1)
    .maybeSingle();
  if (connErr) {
    if (isMissingTableError(connErr)) return { state: "unavailable" };
    console.error("[live-ads] 포트폴리오용 연동 조회 실패:", connErr.message);
    return { state: "error" };
  }
  const conn = connRaw as (ConnectionRow & { granted_scopes?: string[] | null }) | null;
  if (!conn || !conn.access_token_cipher) return { state: "unavailable" };
  const expiresInDays = daysUntil(conn.token_expires_at);
  if (expiresInDays !== null && expiresInDays <= 0) return { state: "unavailable" };

  /* 권한이 **확실히** 없으면 호출하지 않는다 — 거절될 줄 아는 호출은 오류 로그만 쌓는다.
     모르면(null, 0075 이전) 불러 본다: 실패하면 error(«확인 못 함»)로 떨어진다. */
  if (checkScope(conn.granted_scopes ?? null, REQUIRED_SCOPE.businessManagement).state === "missing") {
    return { state: "scope_missing" };
  }

  const token = decryptToken(conn.access_token_cipher, { userId: user.id, field: "meta_ad_connections.access_token_cipher" });
  if (!token) {
    console.error("[live-ads] 포트폴리오용 토큰 복호화 실패 — 키가 바뀌었거나 소유자가 맞지 않는다");
    return { state: "error" };
  }

  /* 계정 행도 본인 것으로 두 번 좁힌다(user_id + connection_id) — loadReadContext 와 같은 이유(2026-09-08 감사) */
  const { data: acctRaw, error: acctErr } = await store
    .from("meta_ad_accounts")
    .select("ad_account_id, account_name, is_default")
    .eq("user_id", user.id)
    .eq("connection_id", conn.id)
    .order("is_default", { ascending: false })
    .order("account_name", { ascending: true });
  if (acctErr) {
    console.error("[live-ads] 포트폴리오용 광고 계정 조회 실패:", acctErr.message);
    return { state: "error" };
  }
  const rows = ((acctRaw ?? []) as Pick<AdAccountRow, "ad_account_id" | "account_name" | "is_default">[]).filter((r) =>
    isValidAdAccountId(r.ad_account_id),
  );
  if (rows.length === 0) return { state: "unavailable" };

  /* 두 조회는 서로를 기다릴 이유가 없다 */
  const [owners, businesses] = await Promise.all([fetchAdAccountOwners(token), fetchMyBusinesses(token)]);
  if (owners === null && businesses === null) return { state: "error" };

  return {
    state: "ok",
    accounts: rows.map((r) => ({
      adAccountId: r.ad_account_id,
      accountName: r.account_name,
      isDefault: r.is_default,
      business: resolveAccountBusiness(r.ad_account_id, owners, businesses),
    })),
  };
}

/** 조회 기간 라벨 — 화면이 «누적»이라고 말하지 않게 한 곳에서 정한다 */
export const DATE_PRESET_LABEL: Record<string, string> = {
  today: "오늘",
  yesterday: "어제",
  last_7d: "최근 7일",
  last_14d: "최근 14일",
  last_30d: "최근 30일",
  this_month: "이번 달",
  last_month: "지난달",
};

export function datePresetLabel(preset: string): string {
  return DATE_PRESET_LABEL[preset] ?? "선택 기간";
}

/* ── 홈 «광고 현황» 카드 ─────────────────────────────────────────── */

/**
 * 홈 우측 레일의 광고 요약. 클라이언트 컴포넌트로 넘어가므로 **직렬화 가능한 값만** 담는다.
 *
 * ⚠️ 예전 홈은 광고 계정을 연결하지 않은 사람에게도 「집행 금액 0원 · 진행 중 캠페인 0개」를
 * 단정했다. 그건 «모른다»가 아니라 «돈을 안 썼다»는 사실 주장이라 거짓이다.
 * connected=false 면 화면이 숫자 대신 «—» 를 그린다.
 */
export interface DashboardAdsSummary {
  connected: boolean;
  spend: number | null;
  activeCount: number | null;
  roas: number | null;
  currency: string | null;
  /** 조회 기간 라벨(«최근 30일») — 없이 «집행 금액»만 적으면 누적으로 읽힌다(/ads 는 이미 붙인다) */
  periodLabel: string | null;
  /** 숫자 밑에 한 줄 — 왜 «—» 인지, 또는 연결 전이라는 안내. null 이면 안 그린다 */
  note: string | null;
}

/**
 * 게재 중인 캠페인만 추린 요약 — 홈 카드가 «진행 중 캠페인 기준»이라고 적고 있다.
 *
 * ⚠️ 여섯 상태를 **다르게 말한다.** 예전엔 ok 가 아니면 전부 connected:false 로 접어, 연결이 **만료된** 사람에게
 * 홈이 「광고 계정을 연결하면 표시돼요」라고 말했다 — 같은 사람이 /ads 에서는 「연결 만료 — 다시 연결 필요」를 본다.
 * 조회 실패도 «연결 전»으로 보였다. 실패는 «없음»이 아니다(파일 머리 규약). 문구는 /ads 의 adsFootnote 와 같은 결.
 */
export function summarizeActiveAds(state: LiveAdsState): DashboardAdsSummary {
  const empty = (note: string): DashboardAdsSummary => ({
    connected: false,
    spend: null,
    activeCount: null,
    roas: null,
    currency: null,
    periodLabel: null,
    note,
  });
  switch (state.state) {
    case "expired":
      return empty("광고 계정 연결이 만료됐어요 — 설정에서 다시 연결해 주세요.");
    case "no_accounts":
      return empty("접근할 수 있는 광고 계정이 없어요. 메타에서 이 계정에 광고 계정 권한이 있는지 확인해 주세요.");
    case "error":
      return empty("광고 현황을 지금은 불러오지 못했어요. 잠시 후 다시 확인해 주세요.");
    case "unconfigured":
    case "disconnected":
      return empty("광고 계정을 연결하면 집행 현황이 여기에 표시돼요.");
    case "ok":
      break;
  }
  const active = state.campaigns.filter((c) => (c.effectiveStatus ?? c.status) === "ACTIVE");
  const totals = aggregateLiveCampaigns(active);
  return {
    connected: true,
    spend: totals.spend,
    activeCount: active.length,
    roas: totals.roas,
    currency: state.selected.currency,
    periodLabel: datePresetLabel(state.datePreset),
    /* 캠페인은 읽었는데 성과만 못 읽은 경우 — 숫자는 «—» 로 나가므로 이유를 한 줄 적는다 */
    note: state.insightsOk ? null : "성과 지표를 지금은 불러오지 못했어요.",
  };
}

/* ── 합계 ────────────────────────────────────────────────────────── */

export interface LiveAdTotals {
  count: number;
  /** 하나라도 못 읽었으면 합계는 «모름»이다 — 읽은 것만 더하면 조용히 작은 값이 나온다 */
  spend: number | null;
  impressions: number | null;
  linkClicks: number | null;
  /** 노출 가중 CTR (%) */
  ctr: number | null;
  /** 지출 가중 ROAS (배). 전환 추적이 없으면 null */
  roas: number | null;
}

/**
 * 캠페인 합계 — 가중 평균으로 계산한다(단순 평균은 규모가 다른 캠페인을 동일 취급해 왜곡된다).
 * lib/ads/metrics.ts 와 같은 계산이지만 **null 을 통과시킨다**는 점이 다르다.
 */
export function aggregateLiveCampaigns(list: LiveAdCampaign[]): LiveAdTotals {
  if (list.length === 0) {
    return { count: 0, spend: 0, impressions: 0, linkClicks: 0, ctr: null, roas: null };
  }
  const sum = (pick: (c: LiveAdCampaign) => number | null): number | null => {
    let acc = 0;
    for (const c of list) {
      const v = pick(c);
      if (v === null) return null;
      acc += v;
    }
    return acc;
  };

  const spend = sum((c) => c.spend);
  const impressions = sum((c) => c.impressions);
  const linkClicks = sum((c) => c.linkClicks);

  /* ROAS 는 «전환을 추적하는 캠페인만» 모아 가중 평균한다.
     추적 안 하는 캠페인의 지출까지 분모에 넣으면 ROAS 가 실제보다 낮게 나온다. */
  let roasSpend = 0;
  let revenue = 0;
  for (const c of list) {
    if (c.roas === null || c.spend === null) continue;
    roasSpend += c.spend;
    revenue += c.spend * c.roas;
  }

  return {
    count: list.length,
    spend,
    impressions,
    linkClicks,
    ctr:
      impressions === null || linkClicks === null || impressions <= 0
        ? null
        : (linkClicks / impressions) * 100,
    roas: roasSpend > 0 ? revenue / roasSpend : null,
  };
}
