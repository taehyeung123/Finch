import { GRAPH_FB_BASE } from "./ads-oauth";

/**
 * 메타 광고 조회 어댑터 — Marketing API (graph.facebook.com).
 * 1단계는 **읽기 전용**이다: 광고 계정 목록 · 캠페인 · 캠페인별 인사이트.
 *
 * ⚠️ **실패는 null 이다 — 0 이 아니다.**
 * 이 저장소가 반복해 밟은 함정이고(성과 분석·대시보드 두 번 고쳤다), 광고는 더 위험하다:
 * 「집행 금액 0원」·「ROAS 0.0배」는 «못 가져왔다»가 아니라 «돈을 안 썼다·성과가 없다»는
 * **사실 주장**으로 읽힌다. 광고주에게 보이는 숫자라 더더욱 그렇다.
 *
 * ⚠️ **금액은 계정 통화 그대로 다룬다.** 환산하지 않는다 —
 * 환율을 어디선가 가져와 곱하는 순간 그 값이 어느 시점 환율인지 아무도 모르게 된다.
 * 화면이 통화 코드를 함께 표기한다.
 */

/** 계정 통화의 최소 단위 여부는 필드마다 다르다 — insights.spend 는 **주 단위 문자열**이다(예: "12345.67") */
function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

async function fbGet<T>(path: string, accessToken: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_FB_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`, {
    /* 인사이트는 자주 안 바뀌고 레이트리밋이 빡빡하다 — 인스타 어댑터와 같은 300초 캐시.
       토큰이 URL 에 들어가므로 캐시 키가 사용자별로 갈린다(테넌트 격리 성립). */
    next: { revalidate: 300 },
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; type?: string; code?: number };
  };
  if (!res.ok) {
    throw new Error(`fb_get_failed ${path}: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return json;
}

/* ── 광고 계정 목록 ──────────────────────────────────────────────── */

export interface FbAdAccount {
  /** act_ 접두를 뺀 숫자 id — 저장·조립의 정본 */
  accountId: string;
  name: string | null;
  currency: string | null;
  timezoneName: string | null;
  /** 1=활성, 2=비활성, 3=미납 … (Meta AdAccount.account_status) */
  accountStatus: number | null;
}

/** 이 사용자가 접근할 수 있는 광고 계정 전부. 실패는 null. */
export async function fetchAdAccounts(accessToken: string): Promise<FbAdAccount[] | null> {
  try {
    const json = await fbGet<{
      data?: {
        account_id?: string;
        name?: string;
        currency?: string;
        timezone_name?: string;
        account_status?: number;
      }[];
    }>("/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status&limit=100", accessToken);
    return (json.data ?? [])
      .filter((a) => typeof a.account_id === "string" && a.account_id.length > 0)
      .map((a) => ({
        accountId: a.account_id as string,
        name: typeof a.name === "string" ? a.name : null,
        currency: typeof a.currency === "string" ? a.currency : null,
        timezoneName: typeof a.timezone_name === "string" ? a.timezone_name : null,
        accountStatus: typeof a.account_status === "number" ? a.account_status : null,
      }));
  } catch (e) {
    console.error("[meta-ads] 광고 계정 목록 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/* ── 캠페인 ──────────────────────────────────────────────────────── */

export interface FbCampaign {
  id: string;
  name: string;
  /** Meta 원문 목표 (OUTCOME_TRAFFIC 등) — 화면 표기는 호출측이 한국어로 옮긴다 */
  objective: string | null;
  /** Meta 원문 상태 (ACTIVE·PAUSED·ARCHIVED·DELETED) */
  status: string | null;
  /** 심사·거부 등 실제 게재 여부 — status 만으로는 «심사중»·«거부됨»이 안 보인다 */
  effectiveStatus: string | null;
  /** 계정 통화의 **최소 단위** 문자열이다(KRW 는 원, USD 는 센트). null 이면 광고세트 예산이라는 뜻 */
  dailyBudgetMinor: number | null;
  lifetimeBudgetMinor: number | null;
}

/** 캠페인 목록. 실패는 null(빈 배열과 구분한다 — 빈 배열은 «캠페인이 없다»는 사실이다). */
export async function fetchCampaigns(adAccountId: string, accessToken: string): Promise<FbCampaign[] | null> {
  try {
    const fields = "id,name,objective,status,effective_status,daily_budget,lifetime_budget";
    const json = await fbGet<{
      data?: {
        id?: string;
        name?: string;
        objective?: string;
        status?: string;
        effective_status?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      }[];
    }>(`/act_${adAccountId}/campaigns?fields=${fields}&limit=100`, accessToken);
    return (json.data ?? [])
      .filter((c) => typeof c.id === "string")
      .map((c) => ({
        id: c.id as string,
        name: typeof c.name === "string" ? c.name : "(이름 없음)",
        objective: typeof c.objective === "string" ? c.objective : null,
        status: typeof c.status === "string" ? c.status : null,
        effectiveStatus: typeof c.effective_status === "string" ? c.effective_status : null,
        /* 예산이 없는 것과 0인 것은 다르다 — 광고세트 예산(ABO)이면 캠페인에 값이 안 온다 */
        dailyBudgetMinor: c.daily_budget != null ? num(c.daily_budget) : null,
        lifetimeBudgetMinor: c.lifetime_budget != null ? num(c.lifetime_budget) : null,
      }));
  } catch (e) {
    console.error("[meta-ads] 캠페인 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/* ── 인사이트 ────────────────────────────────────────────────────── */

export interface FbCampaignInsight {
  campaignId: string;
  spend: number;
  impressions: number;
  reach: number;
  /** ⚠️ 링크 클릭이다 — Meta 의 `clicks` 는 «모든 클릭»(좋아요·프로필 등 포함)이라 화면 문구와 어긋난다 */
  linkClicks: number;
  /** 링크 클릭 기준 CTR·CPC — Meta 의 ctr/cpc 는 전체 클릭 기준이라 직접 계산한다 */
  ctr: number;
  cpc: number;
  /** 전환·ROAS 는 **픽셀이 없으면 애초에 존재하지 않는다** — 그때는 null(0 이 아니다) */
  conversions: number | null;
  roas: number | null;
}

/** actions/action_values 배열에서 한 종류를 뽑는다. 배열 자체가 없으면 «추적 안 됨»이라 null. */
function pickAction(
  rows: { action_type?: string; value?: string }[] | undefined,
  types: string[],
): number | null {
  if (!Array.isArray(rows)) return null;
  const hit = rows.filter((r) => typeof r.action_type === "string" && types.includes(r.action_type));
  if (hit.length === 0) return null;
  return hit.reduce((s, r) => s + num(r.value), 0);
}

/**
 * 캠페인별 인사이트를 **한 번의 호출**로 받는다(level=campaign).
 * 캠페인마다 따로 부르면 계정 하나에 수십 콜이 나가 레이트리밋에 바로 걸린다.
 */
export async function fetchCampaignInsights(
  adAccountId: string,
  accessToken: string,
  datePreset = "last_30d",
): Promise<FbCampaignInsight[] | null> {
  try {
    const fields = "campaign_id,spend,impressions,reach,inline_link_clicks,actions,action_values";
    const json = await fbGet<{
      data?: {
        campaign_id?: string;
        spend?: string;
        impressions?: string;
        reach?: string;
        inline_link_clicks?: string;
        actions?: { action_type?: string; value?: string }[];
        action_values?: { action_type?: string; value?: string }[];
      }[];
    }>(
      `/act_${adAccountId}/insights?level=campaign&date_preset=${datePreset}&fields=${fields}&limit=200`,
      accessToken,
    );

    return (json.data ?? [])
      .filter((r) => typeof r.campaign_id === "string")
      .map((r) => {
        const spend = num(r.spend);
        const impressions = num(r.impressions);
        const linkClicks = num(r.inline_link_clicks);
        const conversions = pickAction(r.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
        const revenue = pickAction(r.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
        return {
          campaignId: r.campaign_id as string,
          spend,
          impressions,
          reach: num(r.reach),
          linkClicks,
          /* 0 나눗셈 가드 — 노출·클릭이 0인 신규 캠페인에서 실제로 발생한다(NaN·Infinity 방지) */
          ctr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
          cpc: linkClicks > 0 ? spend / linkClicks : 0,
          conversions,
          /* 매출이 «추적 안 됨»이면 ROAS 도 없다. 지출이 0이면 나눌 수 없다 —
             둘 다 «0.0배»로 만들면 성과가 없다고 확언하는 셈이다. */
          roas: revenue === null || spend <= 0 ? null : revenue / spend,
        };
      });
  } catch (e) {
    console.error("[meta-ads] 인사이트 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
