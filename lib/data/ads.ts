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
import { isDemoMode } from "@/lib/supabase/config";
import { getWorkspaceMembership, getWorkspaceOwnerId } from "@/lib/team";
import { decryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { isMissingTableError } from "@/lib/supabase/errors";
import { isMissingColumnError } from "@/lib/publish-rules";
import { getConsentStatus } from "@/lib/legal/consent";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";
import { isMetaAdsOAuthConfigured } from "@/lib/meta/ads-oauth";
import { fetchCampaignInsights, fetchCampaigns, type FbCampaign } from "@/lib/meta/ads";
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
function isAdsConnectable(): boolean {
  return isMetaAdsOAuthConfigured() && isTokenEncryptionConfigured();
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
  if (!isAdsConnectable()) return { state: "unconfigured" };

  const user = await getAuthUser();
  if (!user) return { state: "disconnected" };

  const supabase = await createClient();
  const ownerId = await getWorkspaceOwnerId(supabase, user.id);

  const { data: connRaw, error: connErr } = await supabase
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

  const token = decryptToken(conn.access_token_cipher);
  if (!token) {
    console.error("[live-ads] 토큰 복호화 실패 — TOKEN_ENCRYPTION_KEY 가 바뀌었을 수 있다");
    return { state: "error" };
  }

  const { data: acctRaw, error: acctErr } = await supabase
    .from("meta_ad_accounts")
    .select("ad_account_id, account_name, currency, account_status, is_default")
    .eq("connection_id", conn.id)
    .order("is_default", { ascending: false })
    .order("account_name", { ascending: true });

  if (acctErr) {
    console.error("[live-ads] 광고 계정 조회 실패:", acctErr.message);
    return { state: "error" };
  }
  const rows = (acctRaw ?? []) as AdAccountRow[];
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
  if (!isAdsConnectable()) return { state: "blocked", code: "unconfigured" };

  const user = await getAuthUser();
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

  const { data: connRaw, error: connErr } = await supabase
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
  const token = decryptToken(conn.access_token_cipher);
  if (!token) {
    return { state: "blocked", code: "connection_unreadable" };
  }

  /* 게시 주체 컬럼(0082)은 없을 수 있다 — 빠지면 컬럼 없이 다시 읽는다(«아직 안 고름»과 같게 다룬다) */
  const primary = await supabase
    .from("meta_ad_accounts")
    .select("ad_account_id, currency, account_status, is_default, ad_page_id, ad_page_name, ad_ig_user_id, ad_ig_username")
    .eq("connection_id", conn.id)
    .order("is_default", { ascending: false });
  let acctRows: unknown[] | null = primary.data;
  if (primary.error && isMissingColumnError(primary.error, /ad_page_id|ad_ig_user_id|ad_page_name|ad_ig_username/i)) {
    const fallback = await supabase
      .from("meta_ad_accounts")
      .select("ad_account_id, currency, account_status, is_default")
      .eq("connection_id", conn.id)
      .order("is_default", { ascending: false });
    acctRows = fallback.data;
  }
  const rows = (acctRows ?? []) as (AdAccountRow & {
    ad_page_id?: string | null;
    ad_page_name?: string | null;
    ad_ig_user_id?: string | null;
    ad_ig_username?: string | null;
  })[];
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
}

/** 게재 중인 캠페인만 추린 요약 — 홈 카드가 «진행 중 캠페인 기준»이라고 적고 있다 */
export function summarizeActiveAds(state: LiveAdsState): DashboardAdsSummary {
  if (state.state !== "ok") {
    /* 미연동·만료·실패·미설정·계정없음 전부 «모름»이다. 다섯을 여기서 구분하지 않는 이유는
       홈 카드가 숫자 세 줄뿐이라 안내를 실을 자리가 없어서다 — 구분은 /ads 화면이 한다. */
    return { connected: false, spend: null, activeCount: null, roas: null, currency: null };
  }
  const active = state.campaigns.filter((c) => (c.effectiveStatus ?? c.status) === "ACTIVE");
  const totals = aggregateLiveCampaigns(active);
  return {
    connected: true,
    spend: totals.spend,
    activeCount: active.length,
    roas: totals.roas,
    currency: state.selected.currency,
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
