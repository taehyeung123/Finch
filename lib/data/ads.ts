/**
 * 실 광고 데이터 프로바이더 (서버 전용) — 연동된 메타 광고 계정의 캠페인·성과를 조회한다.
 *
 * 흐름: meta_ad_connections 조회(RLS) → 토큰 복호화 → 광고 계정 선택 → 캠페인·인사이트 조회.
 * 인스타(live.ts)와 같은 규칙을 따르되 **갱신 단계가 없다** —
 * 페이스북 장기 사용자 토큰은 자동 갱신이 불가능하고, 만료되면 재연동뿐이다.
 *
 * ⚠️ **실패는 «없음»이 아니다.** 이 파일이 돌려주는 상태는 넷이다:
 *   unconfigured — 앱 자격증명 미설정(운영자 일)
 *   disconnected — 연동 안 함 (사용자가 연결하면 된다)
 *   expired      — 토큰 만료 (재연동해야 한다)
 *   error        — 조회 실패 (일시적일 수 있다)
 *   ok           — 조회 성공
 * 화면은 이 다섯을 **다르게** 그려야 한다. campaigns.length 하나로 뭉치면
 * 「아직 연결한 광고 계정이 없어요」가 조회 실패한 사람에게도 뜬다.
 */

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getWorkspaceOwnerId } from "@/lib/team";
import { decryptToken } from "@/lib/crypto/tokens";
import { isMissingTableError } from "@/lib/supabase/errors";
import { isMetaAdsOAuthConfigured } from "@/lib/meta/ads-oauth";
import { fetchCampaignInsights, fetchCampaigns, type FbCampaign } from "@/lib/meta/ads";

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
  dailyBudgetMinor: number | null;
  lifetimeBudgetMinor: number | null;
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
  | { state: "error" }
  | {
      state: "ok";
      accounts: LiveAdAccount[];
      selected: LiveAdAccount;
      campaigns: LiveAdCampaign[];
      /** 캠페인은 읽었는데 성과만 못 읽은 경우 — 캠페인 이름은 보여주되 숫자는 «—» 로 둔다 */
      insightsOk: boolean;
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
 * 광고 성과 조회. adAccountId 를 주면 그 계정을, 안 주면 기본 계정을 본다.
 *
 * 팀 워크스페이스에서는 **소유자의 연동**을 본다 — 멤버가 각자 연결하게 두면
 * 같은 화면이 사람마다 다른 숫자를 낸다(live.ts 와 같은 규칙).
 */
export async function getLiveAds(options?: {
  adAccountId?: string;
  datePreset?: string;
}): Promise<LiveAdsState> {
  if (isDemoMode()) return { state: "disconnected" };
  if (!isMetaAdsOAuthConfigured()) return { state: "unconfigured" };

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
  if (rows.length === 0) {
    /* 연동은 됐는데 계정이 없다 — 권한을 못 받은 경우다. «미연동»과 구분해야
       사용자가 «다시 연결»이 아니라 «광고 계정 권한 확인»을 하러 간다. */
    return { state: "error" };
  }

  const accounts: LiveAdAccount[] = rows.map((r) => ({
    adAccountId: r.ad_account_id,
    name: r.account_name,
    currency: r.currency,
    isDefault: r.is_default,
    accountStatus: r.account_status,
  }));
  const selected =
    (options?.adAccountId ? accounts.find((a) => a.adAccountId === options.adAccountId) : null) ??
    accounts.find((a) => a.isDefault) ??
    accounts[0];

  /* 캠페인과 인사이트를 나란히 부른다 — 둘은 서로를 기다릴 이유가 없다.
     인사이트만 실패해도 캠페인 목록은 보여줄 수 있다(그 반대는 의미가 없다). */
  const [campaigns, insights] = await Promise.all([
    fetchCampaigns(selected.adAccountId, token),
    fetchCampaignInsights(selected.adAccountId, token, options?.datePreset ?? "last_30d"),
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
      dailyBudgetMinor: c.dailyBudgetMinor,
      lifetimeBudgetMinor: c.lifetimeBudgetMinor,
      /* 인사이트 조회 자체가 실패했으면 전부 null(«모름»).
         성공했는데 이 캠페인 행이 없으면 기간 중 집행이 없었다는 뜻이라 0 이 맞다. */
      spend: insights === null ? null : (i?.spend ?? 0),
      impressions: insights === null ? null : (i?.impressions ?? 0),
      reach: insights === null ? null : (i?.reach ?? 0),
      linkClicks: insights === null ? null : (i?.linkClicks ?? 0),
      ctr: insights === null ? null : (i?.ctr ?? 0),
      cpc: insights === null ? null : (i?.cpc ?? 0),
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
    expiresInDays,
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
