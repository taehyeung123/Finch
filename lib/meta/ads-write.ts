import "server-only";
import { GRAPH_FB_BASE } from "./ads-oauth";
import { toMinor } from "./ads";
import {
  AD_ERROR_CODE_MAP,
  type AdsWriteFailCode,
  type CreatableObjective,
  type SpecialAdCategory,
} from "@/lib/ads/campaign-rules";

/**
 * 메타 광고 **쓰기** 어댑터 — 캠페인 생성·수정(+ 2단계의 광고 세트·소재·광고가 같은 헬퍼를 쓴다).
 * 돈이 걸린 경로다.
 *
 * 조회 어댑터(ads.ts)와 파일을 가른 이유: 조회는 «실패 = null» 관례이고
 * 쓰기는 {ok:false, error} 유니온이다 — 한 파일에 두 관례가 섞이면 다음 사람이 헷갈린다.
 *
 * ⚠️ **쓰기는 자동 재시도 금지.** 생성은 멱등하지 않다(멱등 키를 문서에서 확인 못 함) —
 * 타임아웃 뒤 재시도하면 캠페인이 둘 생긴다. 레이트리밋(오류 17·613 등)도 백오프로 때리지 말 것:
 * 문서 원문이 "When the limit has been reached, stop making API calls" 다.
 *
 * ⚠️ **전송 실패는 «실패»가 아니다(2026-09-03 설계 검토).** 응답을 못 받았을 뿐 Meta 가 적용했을 수 있다 —
 * 특히 ACTIVE 전환이 그렇다(돈은 나가는데 화면은 «실패»). 그래서 error.transport 를 따로 들고,
 * 상태 쓰기의 호출측은 전송 실패 시 GET 으로 실제 상태를 다시 읽는다(actions.ts).
 *
 * ⚠️ 오류 코드표를 lib/meta/graph.ts 에서 베끼지 않는다 — 그 표에는 광고 쓰기 코드(80004)가
 * 없어 레이트리밋이 권한 오류로 정반대 분류된다. 서브코드 2446079 로도 분기하지 말 것
 * (17·80000·80003·80004 네 코드에 전부 붙는 값이라 판별자가 못 된다).
 */

/** Graph 왕복 상한 — 60초 함수 예산 안에서 체인 6회가 끝나야 한다(스펙 §2.1) */
const WRITE_TIMEOUT_MS = 15_000;
/** 멀티파트 업로드는 바이트가 실린다 — 조금 더 준다 */
const UPLOAD_TIMEOUT_MS = 25_000;

export interface AdsWriteError {
  message: string;
  code: number | null;
  subcode: number | null;
  /** 레이트리밋 — 사용자에게 «잠시 후»를 안내하고, 재시도는 사람이 한다 */
  rateLimited: boolean;
  /** 응답 자체를 못 받았다(네트워크·타임아웃) — 적용됐는지 **모른다**. 호출측이 GET 으로 재확인한다 */
  transport: boolean;
  /** Meta 가 사용자용으로 준 제목·문구 — **내부 로그용**. 화면에 그대로 뿌리지 않는다(문구는 ADS_WRITE_MESSAGES) */
  userTitle: string | null;
  userMessage: string | null;
}

export type AdsWriteResult<T> = { ok: true; data: T; usage: AdAccountUsage | null } | { ok: false; error: AdsWriteError };

/**
 * 레이트리밋 현황 — 두 헤더를 **함께** 읽는다(문서 둘이 어긋난다 — 스펙 §11-11):
 *  · X-Ad-Account-Usage: 점수제(개발 등급 60점·쓰기 3점·읽기 1점, 초과 시 300초 차단)
 *  · X-Business-Use-Case-Usage: BUC(호출 수·CPU·시간 %, 회복까지 분)
 * utilPct 는 둘 중 큰 값이다 — 어느 쪽이든 90 을 넘기면 다음 쓰기를 미루는 것이 맞다.
 */
export interface AdAccountUsage {
  /** 0~100. 90 이상이면 새 쓰기를 미루는 게 맞다(초과 시 300초 하드 차단) */
  utilPct: number | null;
  /** 차단됐을 때 풀리기까지 초 */
  resetSeconds: number | null;
  tier: string | null;
}

export function parseUsage(res: Response): AdAccountUsage | null {
  let utilPct: number | null = null;
  let resetSeconds: number | null = null;
  let tier: string | null = null;

  const acc = res.headers.get("x-ad-account-usage");
  if (acc) {
    try {
      const j = JSON.parse(acc) as {
        acc_id_util_pct?: number;
        reset_time_duration?: number;
        ads_api_access_tier?: string;
      };
      if (typeof j.acc_id_util_pct === "number") utilPct = j.acc_id_util_pct;
      if (typeof j.reset_time_duration === "number") resetSeconds = j.reset_time_duration;
      if (typeof j.ads_api_access_tier === "string") tier = j.ads_api_access_tier;
    } catch {
      /* 헤더 형식이 바뀌어도 쓰기 자체는 막지 않는다 — 감시만 잃는다 */
    }
  }

  const buc = res.headers.get("x-business-use-case-usage");
  if (buc) {
    try {
      const j = JSON.parse(buc) as Record<
        string,
        { call_count?: number; total_cputime?: number; total_time?: number; estimated_time_to_regain_access?: number }[]
      >;
      for (const list of Object.values(j)) {
        if (!Array.isArray(list)) continue;
        for (const e of list) {
          const m = Math.max(e.call_count ?? 0, e.total_cputime ?? 0, e.total_time ?? 0);
          utilPct = Math.max(utilPct ?? 0, m);
          /* 문서상 분 단위 */
          if (typeof e.estimated_time_to_regain_access === "number" && e.estimated_time_to_regain_access > 0) {
            resetSeconds = Math.max(resetSeconds ?? 0, e.estimated_time_to_regain_access * 60);
          }
        }
      }
    } catch {
      /* 위와 같다 */
    }
  }

  if (utilPct === null && resetSeconds === null && tier === null) return null;
  return { utilPct, resetSeconds, tier };
}

/**
 * 레이트리밋 코드 — 문서 오류표 기준(2026-09-03 재대조):
 * 4(앱 요청 한도) · 17(사용자 요청 한도) · 613(호출 한도) · 80000·80003·80004·80014(광고 계정 호출 과다).
 */
const RATE_LIMIT_CODES = new Set([4, 17, 613, 80000, 80003, 80004, 80014]);

function transportError(e: unknown): AdsWriteError {
  return {
    message: e instanceof Error ? e.message : String(e),
    code: null,
    subcode: null,
    rateLimited: false,
    transport: true,
    userTitle: null,
    userMessage: null,
  };
}

async function readResult<T>(res: Response): Promise<AdsWriteResult<T>> {
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: {
      message?: string;
      code?: number;
      error_subcode?: number;
      error_user_title?: string;
      error_user_msg?: string;
    };
  };
  if (!res.ok) {
    const code = typeof json.error?.code === "number" ? json.error.code : null;
    return {
      ok: false,
      error: {
        message: json.error?.message ?? `http_${res.status}`,
        code,
        subcode: typeof json.error?.error_subcode === "number" ? json.error.error_subcode : null,
        rateLimited: code !== null && RATE_LIMIT_CODES.has(code),
        transport: false,
        userTitle: typeof json.error?.error_user_title === "string" ? json.error.error_user_title : null,
        userMessage: typeof json.error?.error_user_msg === "string" ? json.error.error_user_msg : null,
      },
    };
  }
  return { ok: true, data: json, usage: parseUsage(res) };
}

/**
 * Graph POST — 파라미터를 쿼리스트링에 싣는다(instagram-publish.ts 관례).
 * cache:"no-store" 필수 — 토큰이 URL 에 들어가므로 페치 캐시에 평문으로 남으면 안 된다(ads.ts 주석).
 * fetch 자체를 try/catch 로 감싼다 — 네트워크 예외가 시그니처를 뚫고 나가는 구멍을
 * 발행 어댑터에서 이미 겪었다(pollContainerStatus, 호출측이 메우고 있던 것).
 */
export async function fbPost<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<AdsWriteResult<T>> {
  const q = new URLSearchParams({ ...params, access_token: accessToken });
  try {
    const res = await fetch(`${GRAPH_FB_BASE}${path}?${q.toString()}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
    return await readResult<T>(res);
  } catch (e) {
    return { ok: false, error: transportError(e) };
  }
}

/**
 * Graph POST(멀티파트) — 이미지 바이트처럼 쿼리스트링에 못 싣는 것. 토큰은 본문 필드로 간다.
 * ⚠️ 호출측이 FormData 에 access_token 을 미리 넣지 않는다 — 여기서 한 번만 붙인다(로그·직렬화에 새는 것을 막는다).
 */
export async function fbPostForm<T>(path: string, form: FormData, accessToken: string): Promise<AdsWriteResult<T>> {
  form.set("access_token", accessToken);
  try {
    const res = await fetch(`${GRAPH_FB_BASE}${path}`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    return await readResult<T>(res);
  } catch (e) {
    return { ok: false, error: transportError(e) };
  } finally {
    form.delete("access_token");
  }
}

export interface CreateCampaignParams {
  adAccountId: string;
  accessToken: string;
  name: string;
  objective: CreatableObjective;
  /** 주 단위 — 여기서 toMinor 로 변환한다. 호출측이 미리 변환해 오면 이중 변환이 된다. */
  dailyBudget: number;
  /** null 금지는 호출측(액션) 책임 — 모르는 통화로 금액을 보내는 것은 100배 오차 직행로다 */
  currency: string;
  specialCategories: SpecialAdCategory[];
  /** true = execution_options=['validate_only'] — 만들지 않고 Meta 검증만 받는다 */
  validateOnly?: boolean;
}

/**
 * 캠페인 예산(CBO)일 때 하위 광고 세트가 자동 입찰로 돌게 하는 전략.
 * ⚠️ 생성 시 지정하지 않으면 기본이 **LOWEST_COST_WITH_BID_CAP** 이고, 그 전략은 광고 세트마다
 * bid_amount 가 필수라 2단계의 광고 세트 생성이 막힌다(캠페인 레퍼런스 원문 — 스펙 §13-7).
 */
export const CAMPAIGN_BID_STRATEGY = "LOWEST_COST_WITHOUT_CAP";
/** 특별 광고 카테고리 국가 — v1 은 한국 타겟만 만든다(스펙 §13-10). 타겟 국가가 열리면 그 집합으로 바꾼다 */
const SPECIAL_AD_CATEGORY_COUNTRIES = ["KR"];

function campaignParams(p: CreateCampaignParams): Record<string, string> {
  return {
    name: p.name,
    objective: p.objective,
    /* ⚠️ 생성은 **항상 PAUSED** — 상수로 박고 토글을 주지 않는다. 문서의 생성 예제 6종이 전부
       PAUSED 이고, 이 화면에서 실수로 돈이 나가는 것을 막는 두 번째 겹이다(첫 겹은 소재 부재). */
    status: "PAUSED",
    special_ad_categories: JSON.stringify(p.specialCategories),
    /* 카테고리가 하나라도 있으면 국가를 **항상** 보낸다 — 문서 원문 «When any special_ad_categories are
       selected, you must also set a special_ad_category_country». 정치에만 붙이면 도박·게이밍이 빈다. */
    ...(p.specialCategories.length > 0
      ? { special_ad_category_country: JSON.stringify(SPECIAL_AD_CATEGORY_COUNTRIES) }
      : {}),
    daily_budget: String(toMinor(p.dailyBudget, p.currency)),
    bid_strategy: CAMPAIGN_BID_STRATEGY,
    ...(p.validateOnly ? { execution_options: JSON.stringify(["validate_only"]) } : {}),
  };
}

/** 캠페인 생성 — 성공 시 새 캠페인 id. validateOnly 면 id 없이 통과 여부만 의미가 있다. */
export async function createCampaign(p: CreateCampaignParams): Promise<AdsWriteResult<{ id?: string }>> {
  return fbPost<{ id?: string }>(`/act_${p.adAccountId}/campaigns`, campaignParams(p), p.accessToken);
}

export interface UpdateCampaignParams {
  campaignId: string;
  accessToken: string;
  /** 바꿀 것만 담는다 */
  name?: string;
  /** ACTIVE 전환 = 돈이 나가기 시작할 수 있다 — 호출측이 ConfirmSubmit 을 거쳐야 한다 */
  status?: "ACTIVE" | "PAUSED";
  /** 주 단위 + 통화 — 예산을 바꿀 때만 함께 준다 */
  dailyBudget?: number;
  currency?: string;
  /** 입찰가 상한 캠페인을 자동 입찰로 되돌릴 때(스펙 §13-7) — 다른 값은 이 화면에서 만들지 않는다 */
  bidStrategy?: typeof CAMPAIGN_BID_STRATEGY;
}

/** 캠페인 수정 — 이름·상태·일 예산·입찰 전략. 응답은 {success:true}. */
export async function updateCampaign(p: UpdateCampaignParams): Promise<AdsWriteResult<{ success?: boolean }>> {
  const params: Record<string, string> = {};
  if (p.name !== undefined) params.name = p.name;
  if (p.status !== undefined) params.status = p.status;
  if (p.bidStrategy !== undefined) params.bid_strategy = p.bidStrategy;
  if (p.dailyBudget !== undefined) {
    if (!p.currency) {
      return {
        ok: false,
        error: {
          message: "currency_required_for_budget",
          code: null,
          subcode: null,
          rateLimited: false,
          transport: false,
          userTitle: null,
          userMessage: null,
        },
      };
    }
    params.daily_budget = String(toMinor(p.dailyBudget, p.currency));
  }
  if (Object.keys(params).length === 0) {
    return {
      ok: false,
      error: {
        message: "nothing_to_update",
        code: null,
        subcode: null,
        rateLimited: false,
        transport: false,
        userTitle: null,
        userMessage: null,
      },
    };
  }
  return fbPost<{ success?: boolean }>(`/${p.campaignId}`, params, p.accessToken);
}

/**
 * 실패 → 사유 코드 — 문구는 campaign-rules 의 ADS_WRITE_MESSAGES 가 정본이다.
 * (Meta 원문은 내부용이라 화면에 그대로 뿌리지 않고, URL 로 나를 때도 코드만 나른다.)
 *
 * 7자리 검증 오류는 문서 간에 위치가 갈린다(DSA 예제는 error_subcode, 오류 레퍼런스 샘플은 code) —
 * **둘 다** 본다(스펙 §8.1). 메시지 문자열 매칭은 하지 않는다(«Description string is subject to change»).
 */
export function writeErrorCode(e: AdsWriteError): AdsWriteFailCode {
  if (e.rateLimited) return "rate_limited";
  for (const k of [e.subcode, e.code]) {
    if (k !== null && k in AD_ERROR_CODE_MAP) return AD_ERROR_CODE_MAP[k];
  }
  if (e.code === 190) return "token_expired";
  /* 200·10 = 권한, 294 = ads_management 확장 권한/허용 목록, 3 = capability 없음 */
  if (e.code === 200 || e.code === 10 || e.code === 294 || e.code === 3) return "write_denied";
  /* 100 = 잘못된 파라미터, 194 = 필수 파라미터 누락 */
  if (e.code === 100 || e.code === 194) return "bad_input";
  return "failed";
}
