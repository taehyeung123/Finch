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

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * 통화의 소수 자릿수 — 최소 단위를 주 단위로 되돌릴 때 쓴다.
 * ⚠️ 예산 필드(daily_budget·lifetime_budget)는 **최소 단위**로 오는데
 * insights.spend 는 **주 단위 문자열**이다. 같은 화면에 나란히 놓이는 두 금액의 단위가 다르다.
 * 이걸 안 맞추면 USD 계정에서 일 예산만 100배로 찍힌다(원화는 지수가 0이라 우연히 맞는다).
 */
export function minorUnitDigits(currency: string | null): number {
  if (!currency) return 0; // 모르면 손대지 않는다 — 잘못 나누느니 원문을 둔다
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 0
    );
  } catch {
    return 0;
  }
}

/** 최소 단위 → 주 단위 */
export function fromMinor(v: number, currency: string | null): number {
  const digits = minorUnitDigits(currency);
  return digits === 0 ? v : v / 10 ** digits;
}

/**
 * 주 단위 → 최소 단위 (쓰기 방향 — 캠페인 예산을 API 로 보낼 때).
 * ⚠️ fromMinor 와 **같은 표**(minorUnitDigits)를 역방향으로 쓴다.
 * 두 번째 통화 표를 만들면 그 순간 USD 계정에서 100배가 어긋난다.
 * KRW 는 지수 0이라 원 그대로다 — 우연히 맞는 것이지 규칙이 아니다.
 */
export function toMinor(v: number, currency: string | null): number {
  const digits = minorUnitDigits(currency);
  return digits === 0 ? Math.round(v) : Math.round(v * 10 ** digits);
}

/**
 * Graph 호출.
 *
 * ⚠️ **Next 페치 캐시를 쓰지 않는다(no-store).**
 * 토큰이 URL 쿼리에 들어가는데, next@16 의 페치 캐시는 **엔트리 본문에 요청 URL 을 그대로 저장한다**
 * (patch-fetch 가 username/password 만 지운다). 그러면 DB 에 AES-GCM 으로 봉인해 둔 토큰이
 * 캐시에는 평문으로 남는다 — 암호화가 무의미해진다.
 * Graph API 는 Authorization 헤더를 공식 문서로 보장하지 않아 헤더 이동도 못 한다.
 * 대신 한 렌더 안의 중복 호출은 React cache() 로 막는다(lib/data/ads.ts).
 */
/** 읽기 왕복 상한 — 60초 함수 예산 안에서 렌더가 끝나야 한다(쓰기 쪽 상수와 같은 이유) */
const READ_TIMEOUT_MS = 15_000;

export async function fbGet<T>(path: string, accessToken: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_FB_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; type?: string; code?: number };
  };
  if (!res.ok) {
    throw new Error(`fb_get_failed ${path}: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return json;
}

interface Paged<T> {
  data?: T[];
  paging?: { next?: string; cursors?: { after?: string } };
}

/**
 * 커서 페이지네이션을 끝까지 따라간다.
 *
 * ⚠️ limit 만 걸고 한 장만 읽으면 **합계가 조용히 작아진다.**
 * 캠페인이 120개인 계정에서 「누적 집행 금액」이 100개분만 나오는데 화면 어디에도 잘렸다는 표시가 없다 —
 * 광고주는 그 숫자를 사실로 읽는다. 폭주 방지로 장수는 제한하고, 잘렸으면 로그를 남긴다.
 */
export async function fbGetAll<T>(path: string, accessToken: string, what: string): Promise<T[]> {
  const MAX_PAGES = 20;
  const out: T[] = [];
  let page = await fbGet<Paged<T>>(path, accessToken);
  out.push(...(page.data ?? []));

  for (let i = 1; i < MAX_PAGES; i++) {
    const next = page.paging?.next;
    if (!next) return out;
    /* next 는 토큰까지 박힌 완전한 URL 이라 그대로 부른다 */
    const res = await fetch(next, { cache: "no-store" });
    if (!res.ok) throw new Error(`fb_get_failed ${what} page${i}: http_${res.status}`);
    page = (await res.json().catch(() => ({}))) as Paged<T>;
    out.push(...(page.data ?? []));
  }
  if (page.paging?.next) {
    console.warn(`[meta-ads] ${what}: ${MAX_PAGES}장에서 끊었다 — 합계가 실제보다 작을 수 있다`);
  }
  return out;
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
    const rows = await fbGetAll<{
      account_id?: string;
      name?: string;
      currency?: string;
      timezone_name?: string;
      account_status?: number;
    }>(
      "/me/adaccounts?fields=account_id,name,currency,timezone_name,account_status&limit=100",
      accessToken,
      "adaccounts",
    );
    return rows
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
  /** **주 단위**로 되돌린 값(지출과 같은 단위). null 이면 광고 세트에서 예산을 관리한다는 뜻 */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
}

/**
 * 캠페인 목록. 실패는 null(빈 배열과 구분한다 — 빈 배열은 «캠페인이 없다»는 사실이다).
 * currency 는 예산을 주 단위로 되돌리는 데 쓴다 — 모르면 원문 그대로 둔다.
 */
export async function fetchCampaigns(
  adAccountId: string,
  accessToken: string,
  currency: string | null,
): Promise<FbCampaign[] | null> {
  try {
    const fields = "id,name,objective,status,effective_status,daily_budget,lifetime_budget";
    const rows = await fbGetAll<{
      id?: string;
      name?: string;
      objective?: string;
      status?: string;
      effective_status?: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>(`/act_${adAccountId}/campaigns?fields=${fields}&limit=100`, accessToken, "campaigns");
    return rows
      .filter((c) => typeof c.id === "string")
      .map((c) => ({
        id: c.id as string,
        name: typeof c.name === "string" ? c.name : "(이름 없음)",
        objective: typeof c.objective === "string" ? c.objective : null,
        status: typeof c.status === "string" ? c.status : null,
        effectiveStatus: typeof c.effective_status === "string" ? c.effective_status : null,
        /* 예산이 없는 것과 0인 것은 다르다 — 광고세트 예산(ABO)이면 캠페인에 값이 안 온다 */
        dailyBudget: c.daily_budget != null ? fromMinor(num(c.daily_budget), currency) : null,
        lifetimeBudget: c.lifetime_budget != null ? fromMinor(num(c.lifetime_budget), currency) : null,
      }));
  } catch (e) {
    console.error("[meta-ads] 캠페인 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * 캠페인이 속한 광고 계정 id (act_ 접두 없음). 실패는 null(«모름»).
 *
 * 쓰기 전에 **캠페인이 선택된 계정 것인지** 대조하는 용도다 — 소유자 FB 토큰은
 * 그 사람이 관리하는 **모든** 광고 계정을 커버하므로, 클라이언트가 보낸 campaignId 를
 * 그대로 믿으면 워크스페이스가 고르지도 않은 계정의 캠페인을 켤 수 있다(감사 적발).
 */
export async function fetchCampaignAccountId(
  campaignId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const json = await fbGet<{ account_id?: string }>(`/${campaignId}?fields=account_id`, accessToken);
    return typeof json.account_id === "string" && json.account_id.length > 0 ? json.account_id : null;
  } catch (e) {
    console.error("[meta-ads] 캠페인 계정 확인 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * 캠페인·광고 세트·광고의 현재 상태 — **전송 실패 뒤 재확인용**(ads-write.ts 헤더).
 * ACTIVE 쓰기의 응답을 못 받았을 때 «실패»로 단정하면 돈은 나가는데 화면은 꺼졌다고 말한다.
 * 실패는 null(«모름») — 호출측은 그때 status_unverified 로 사용자에게 «목록에서 확인»을 안내한다.
 */
export async function fetchObjectStatus(
  objectId: string,
  accessToken: string,
): Promise<{ status: string | null; effectiveStatus: string | null } | null> {
  try {
    const json = await fbGet<{ status?: string; effective_status?: string }>(
      `/${objectId}?fields=status,effective_status`,
      accessToken,
    );
    return {
      status: typeof json.status === "string" ? json.status : null,
      effectiveStatus: typeof json.effective_status === "string" ? json.effective_status : null,
    };
  } catch (e) {
    console.error("[meta-ads] 상태 재확인 실패:", e instanceof Error ? e.message : String(e));
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
  /** 링크 클릭 기준 CTR·CPC. 분모가 0이면 **존재하지 않는 값**이라 null 이다(0% · 0원이 아니다) */
  ctr: number | null;
  cpc: number | null;
  /** 전환·ROAS 는 **픽셀이 없으면 애초에 존재하지 않는다** — 그때는 null(0 이 아니다) */
  conversions: number | null;
  roas: number | null;
}

/**
 * 구매 전환의 action_type 우선순위.
 *
 * ⚠️ **더하면 안 된다.** Meta 는 같은 구매 하나를 여러 이름으로 **중복해서** 준다 —
 * 픽셀 구매 1건이 offsite_conversion.fb_pixel_purchase(원본)·purchase(통합)·
 * omni_purchase(옴니채널 통합) 세 행으로 온다. 셋을 합하면 전환수와 ROAS 가 3배가 된다.
 * 3.0배는 «못 가져왔다»가 아니라 «3배 벌었다»는 사실 주장이고, 예산 증액 결정을 유발한다.
 * 그래서 **가장 넓은 집계 하나만** 택한다(있으면 omni_purchase, 없으면 purchase, …).
 */
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] as const;

/**
 * actions/action_values 배열에서 **한 종류만** 뽑는다(우선순위 순).
 * 배열 자체가 없으면 «추적 안 됨»이라 null.
 * 어떤 타입을 골랐는지 함께 돌려준다 — 전환수와 매출이 **같은 타입**이어야 ROAS 가 맞는다.
 */
function pickPurchase(
  rows: { action_type?: string; value?: string }[] | undefined,
  preferred?: string,
): { type: string; value: number } | null {
  if (!Array.isArray(rows)) return null;
  const order = preferred ? [preferred, ...PURCHASE_TYPES] : [...PURCHASE_TYPES];
  for (const t of order) {
    const hit = rows.filter((r) => r.action_type === t);
    if (hit.length > 0) {
      return { type: t, value: hit.reduce((s, r) => s + num(r.value), 0) };
    }
  }
  return null;
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
    const rows = await fbGetAll<{
      campaign_id?: string;
      spend?: string;
      impressions?: string;
      reach?: string;
      inline_link_clicks?: string;
      actions?: { action_type?: string; value?: string }[];
      action_values?: { action_type?: string; value?: string }[];
    }>(
      `/act_${adAccountId}/insights?level=campaign&date_preset=${datePreset}&fields=${fields}&limit=200`,
      accessToken,
      "insights",
    );

    return rows
      .filter((r) => typeof r.campaign_id === "string")
      .map((r) => {
        const spend = num(r.spend);
        const impressions = num(r.impressions);
        const linkClicks = num(r.inline_link_clicks);
        const conv = pickPurchase(r.actions);
        /* 매출은 전환수와 **같은 타입**으로 맞춘다 — 다른 타입을 섞으면 ROAS 분자·분모가 어긋난다 */
        const rev = pickPurchase(r.action_values, conv?.type);
        return {
          campaignId: r.campaign_id as string,
          spend,
          impressions,
          reach: num(r.reach),
          linkClicks,
          /* 분모가 0이면 비율이 «존재하지 않는다». 0% · 0원으로 만들면
             「클릭이 한 번도 없었다」가 「클릭당 0원」이라는 좋은 성적으로 읽힌다. */
          ctr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
          cpc: linkClicks > 0 ? spend / linkClicks : null,
          conversions: conv?.value ?? null,
          /* 매출이 «추적 안 됨»이면 ROAS 도 없다. 지출이 0이면 나눌 수 없다 —
             둘 다 «0.0배»로 만들면 성과가 없다고 확언하는 셈이다. */
          roas: rev === null || spend <= 0 ? null : rev.value / spend,
        };
      });
  } catch (e) {
    console.error("[meta-ads] 인사이트 조회 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
