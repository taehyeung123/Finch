import "server-only";
import { fbGet, fbGetAll, fromMinor } from "./ads";

/**
 * 캠페인 **하위 계층 조회** — 캠페인 상세 · 광고 세트 · 광고 · 계정 단위 심사 요약 (2단계 슬라이스 1).
 *
 * ads.ts 와 같은 규칙: **실패는 null 이다 — 빈 배열이 아니다.** «광고 세트가 없다»와 «못 읽었다»는
 * 화면에서 다르게 그려야 한다(광고주는 빈 표를 «없음»이라는 사실로 읽는다).
 *
 * ⚠️ 하위 조회는 반드시 `/{campaign_id}/adsets`·`/{campaign_id}/ads` **엣지**로만 한다 —
 * `/act_{id}/adsets?filtering=…` 로 우회하면 소유 대조(campaign.account_id ≠ 선택 계정 → 404)가 무의미해진다
 * (설계 검토: 읽기에도 소유 대조 — 소유자 토큰은 그 사람의 모든 광고 계정을 커버한다).
 *
 * ⚠️ 심사 거부 사유 **원문은 화면에 내지 않는다**(스펙 §13-16). 여기서는 key 만 모아 로그·개수에 쓴다.
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/* ── 캠페인 상세 ─────────────────────────────────────────────────── */

export interface FbCampaignDetail {
  id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  /** 주 단위(지출과 같은 단위). null = 광고 세트 예산(ABO) */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  /** LOWEST_COST_WITHOUT_CAP 이 아니면 핀치가 만든 광고 세트가 bid_amount 없이는 거절될 수 있다(스펙 §13-7) */
  bidStrategy: string | null;
  specialAdCategories: string[];
  /** act_ 접두 없는 숫자 — 선택 계정과 대조한다 */
  accountId: string | null;
  createdTime: string | null;
}

/** 캠페인 한 건. 실패는 null. */
export async function fetchCampaignDetail(
  campaignId: string,
  accessToken: string,
  currency: string | null,
): Promise<FbCampaignDetail | null> {
  try {
    const fields =
      "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,special_ad_categories,account_id,created_time";
    const c = await fbGet<{
      id?: string;
      name?: string;
      objective?: string;
      status?: string;
      effective_status?: string;
      daily_budget?: string;
      lifetime_budget?: string;
      bid_strategy?: string;
      special_ad_categories?: string[];
      account_id?: string;
      created_time?: string;
    }>(`/${campaignId}?fields=${fields}`, accessToken);
    if (!str(c.id)) return null;
    return {
      id: c.id as string,
      name: str(c.name) ?? "(이름 없음)",
      objective: str(c.objective),
      status: str(c.status),
      effectiveStatus: str(c.effective_status),
      dailyBudget: c.daily_budget != null ? fromMinor(num(c.daily_budget) ?? 0, currency) : null,
      lifetimeBudget: c.lifetime_budget != null ? fromMinor(num(c.lifetime_budget) ?? 0, currency) : null,
      bidStrategy: str(c.bid_strategy),
      specialAdCategories: Array.isArray(c.special_ad_categories)
        ? c.special_ad_categories.filter((v): v is string => typeof v === "string")
        : [],
      accountId: str(c.account_id),
      createdTime: str(c.created_time),
    };
  } catch (e) {
    console.error("[meta-ads] 캠페인 상세 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/* ── 광고 세트 ───────────────────────────────────────────────────── */

export interface FbAdSetTargetingSummary {
  /** ISO 국가 코드 */
  countries: string[];
  /** 시·도 이름(Meta 가 준 name) */
  regions: string[];
  ageMin: number | null;
  ageMax: number | null;
  /** 1=남성, 2=여성. 비어 있으면 전체 */
  genders: number[];
  interests: string[];
  /** 비어 있으면 Advantage+ 노출 위치(자동) */
  platforms: string[];
  /** targeting_automation.advantage_audience — null 이면 필드 없음(구 광고 세트) */
  advantageAudience: boolean | null;
}

export interface FbAdSet {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  destinationType: string | null;
  startTime: string | null;
  /** «종료 없음»은 Meta 가 값을 안 준다(또는 0) → null */
  endTime: string | null;
  /** 주 단위. CBO 캠페인의 광고 세트는 둘 다 null 이 정상 */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  targeting: FbAdSetTargetingSummary | null;
}

interface RawTargeting {
  geo_locations?: { countries?: string[]; regions?: { key?: string; name?: string }[] };
  age_min?: number;
  age_max?: number;
  genders?: number[];
  flexible_spec?: { interests?: { id?: string; name?: string }[] }[];
  publisher_platforms?: string[];
  targeting_automation?: { advantage_audience?: number };
}

function summarizeTargeting(t: RawTargeting | undefined | null): FbAdSetTargetingSummary | null {
  if (!t || typeof t !== "object") return null;
  const interests: string[] = [];
  for (const spec of t.flexible_spec ?? []) {
    for (const i of spec.interests ?? []) if (str(i.name)) interests.push(i.name as string);
  }
  const aa = t.targeting_automation?.advantage_audience;
  return {
    countries: (t.geo_locations?.countries ?? []).filter((v): v is string => typeof v === "string"),
    regions: (t.geo_locations?.regions ?? []).map((r) => str(r.name)).filter((v): v is string => v !== null),
    ageMin: num(t.age_min),
    ageMax: num(t.age_max),
    genders: (t.genders ?? []).filter((g): g is number => typeof g === "number"),
    interests,
    platforms: (t.publisher_platforms ?? []).filter((v): v is string => typeof v === "string"),
    advantageAudience: aa === 1 ? true : aa === 0 ? false : null,
  };
}

/** 캠페인의 광고 세트 전부(엣지). 실패는 null, 없으면 []. */
export async function fetchAdSets(
  campaignId: string,
  accessToken: string,
  currency: string | null,
): Promise<FbAdSet[] | null> {
  try {
    const fields =
      "id,name,status,effective_status,optimization_goal,billing_event,destination_type,start_time,end_time,daily_budget,lifetime_budget,targeting";
    const rows = await fbGetAll<{
      id?: string;
      name?: string;
      status?: string;
      effective_status?: string;
      optimization_goal?: string;
      billing_event?: string;
      destination_type?: string;
      start_time?: string;
      end_time?: string;
      daily_budget?: string;
      lifetime_budget?: string;
      targeting?: RawTargeting;
    }>(`/${campaignId}/adsets?fields=${fields}&limit=100`, accessToken, "adsets");
    return rows
      .filter((r) => str(r.id))
      .map((r) => ({
        id: r.id as string,
        name: str(r.name) ?? "(이름 없음)",
        status: str(r.status),
        effectiveStatus: str(r.effective_status),
        optimizationGoal: str(r.optimization_goal),
        billingEvent: str(r.billing_event),
        destinationType: str(r.destination_type),
        startTime: str(r.start_time),
        endTime: str(r.end_time),
        dailyBudget: r.daily_budget != null ? fromMinor(num(r.daily_budget) ?? 0, currency) : null,
        lifetimeBudget: r.lifetime_budget != null ? fromMinor(num(r.lifetime_budget) ?? 0, currency) : null,
        targeting: summarizeTargeting(r.targeting),
      }));
  } catch (e) {
    console.error("[meta-ads] 광고 세트 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/* ── 광고 ────────────────────────────────────────────────────────── */

export interface FbAd {
  id: string;
  name: string;
  status: string | null;
  /** PENDING_REVIEW·DISAPPROVED·WITH_ISSUES 는 **광고 단에서만** 보인다(캠페인·세트에는 없다) */
  effectiveStatus: string | null;
  adsetId: string | null;
  createdTime: string | null;
  creativeId: string | null;
  creativeName: string | null;
  thumbnailUrl: string | null;
  /** 거부 사유 key(global + 노출 위치별) — **로그·수집용**. 화면은 «거부됨 — 사유는 광고 관리자에서» 만 말한다 */
  reviewKeys: string[];
  /** issues_info 항목 수 — WITH_ISSUES 배지 옆 «문제 N건» */
  issueCount: number;
}

/** 캠페인의 광고 전부(엣지). 실패는 null, 없으면 []. */
export async function fetchAds(campaignId: string, accessToken: string): Promise<FbAd[] | null> {
  try {
    const fields =
      "id,name,status,effective_status,adset_id,created_time,ad_review_feedback,issues_info,creative{id,name,thumbnail_url}";
    const rows = await fbGetAll<{
      id?: string;
      name?: string;
      status?: string;
      effective_status?: string;
      adset_id?: string;
      created_time?: string;
      ad_review_feedback?: { global?: Record<string, string>; placement_specific?: Record<string, Record<string, string>> };
      issues_info?: unknown[];
      creative?: { id?: string; name?: string; thumbnail_url?: string };
    }>(`/${campaignId}/ads?fields=${fields}&limit=100`, accessToken, "ads");
    return rows
      .filter((r) => str(r.id))
      .map((r) => {
        const keys = new Set<string>();
        for (const k of Object.keys(r.ad_review_feedback?.global ?? {})) keys.add(k);
        for (const [placement, map] of Object.entries(r.ad_review_feedback?.placement_specific ?? {})) {
          for (const k of Object.keys(map ?? {})) keys.add(`${placement}:${k}`);
        }
        return {
          id: r.id as string,
          name: str(r.name) ?? "(이름 없음)",
          status: str(r.status),
          effectiveStatus: str(r.effective_status),
          adsetId: str(r.adset_id),
          createdTime: str(r.created_time),
          creativeId: str(r.creative?.id),
          creativeName: str(r.creative?.name),
          thumbnailUrl: str(r.creative?.thumbnail_url),
          reviewKeys: [...keys],
          issueCount: Array.isArray(r.issues_info) ? r.issues_info.length : 0,
        };
      });
  } catch (e) {
    console.error("[meta-ads] 광고 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/* ── 계정 단위 심사 요약(목록 배지용) ─────────────────────────────── */

export interface AdReviewSummary {
  total: number;
  pendingReview: number;
  disapproved: number;
  withIssues: number;
}

/**
 * 계정의 광고 전부를 **한 번에** 읽어 캠페인별로 묶는다 — 캠페인마다 부르지 않는다(레이트리밋).
 * 실패는 null → 화면은 배지를 **숨긴다**(0 이 아니다).
 */
export async function fetchAccountAdReview(
  adAccountId: string,
  accessToken: string,
): Promise<Record<string, AdReviewSummary> | null> {
  try {
    const rows = await fbGetAll<{ campaign_id?: string; effective_status?: string }>(
      `/act_${adAccountId}/ads?fields=campaign_id,effective_status&limit=500`,
      accessToken,
      "account-ads-review",
    );
    const out: Record<string, AdReviewSummary> = {};
    for (const r of rows) {
      const cid = str(r.campaign_id);
      if (!cid) continue;
      const s = (out[cid] ??= { total: 0, pendingReview: 0, disapproved: 0, withIssues: 0 });
      s.total += 1;
      if (r.effective_status === "PENDING_REVIEW") s.pendingReview += 1;
      else if (r.effective_status === "DISAPPROVED") s.disapproved += 1;
      else if (r.effective_status === "WITH_ISSUES") s.withIssues += 1;
    }
    return out;
  } catch (e) {
    console.error("[meta-ads] 계정 광고 심사 요약 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
