import "server-only";
import { GRAPH_FB_BASE, } from "./ads-oauth";
import { toMinor } from "./ads";
import type { CreatableObjective, SpecialAdCategory } from "@/lib/ads/campaign-rules";

/**
 * 메타 광고 **쓰기** 어댑터 — 캠페인 생성·수정. 돈이 걸린 첫 경로다.
 *
 * 조회 어댑터(ads.ts)와 파일을 가른 이유: 조회는 «실패 = null» 관례이고
 * 쓰기는 {ok:false, error} 유니온이다 — 한 파일에 두 관례가 섞이면 다음 사람이 헷갈린다.
 *
 * ⚠️ **쓰기는 자동 재시도 금지.** 생성은 멱등하지 않다(멱등 키를 문서에서 확인 못 함) —
 * 타임아웃 뒤 재시도하면 캠페인이 둘 생긴다. 레이트리밋(오류 17·613)도 백오프로 때리지 말 것:
 * 문서 원문이 "When the limit has been reached, stop making API calls" 다.
 *
 * ⚠️ 오류 코드표를 lib/meta/graph.ts 에서 베끼지 않는다 — 그 표에는 광고 쓰기 코드(80004)가
 * 없어 레이트리밋이 권한 오류로 정반대 분류된다. 서브코드 2446079 로도 분기하지 말 것
 * (17·80000·80003·80004 네 코드에 전부 붙는 값이라 판별자가 못 된다).
 */

export interface AdsWriteError {
  message: string;
  code: number | null;
  subcode: number | null;
  /** 레이트리밋(17·613·80004) — 사용자에게 «잠시 후»를 안내하고, 재시도는 사람이 한다 */
  rateLimited: boolean;
}

export type AdsWriteResult<T> = { ok: true; data: T; usage: AdAccountUsage | null } | { ok: false; error: AdsWriteError };

/** X-Ad-Account-Usage 헤더 — 광고 계정 점수제(개발 등급 60점·쓰기 3점) 현황 */
export interface AdAccountUsage {
  /** 0~100. 90 이상이면 새 쓰기를 미루는 게 맞다(초과 시 300초 하드 차단) */
  utilPct: number | null;
  /** 차단됐을 때 풀리기까지 초 */
  resetSeconds: number | null;
  tier: string | null;
}

function parseUsage(res: Response): AdAccountUsage | null {
  const raw = res.headers.get("x-ad-account-usage");
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as {
      acc_id_util_pct?: number;
      reset_time_duration?: number;
      ads_api_access_tier?: string;
    };
    return {
      utilPct: typeof j.acc_id_util_pct === "number" ? j.acc_id_util_pct : null,
      resetSeconds: typeof j.reset_time_duration === "number" ? j.reset_time_duration : null,
      tier: typeof j.ads_api_access_tier === "string" ? j.ads_api_access_tier : null,
    };
  } catch {
    return null;
  }
}

const RATE_LIMIT_CODES = new Set([17, 613, 80004]);

/**
 * Graph POST — 파라미터를 쿼리스트링에 싣는다(instagram-publish.ts 관례).
 * cache:"no-store" 필수 — 토큰이 URL 에 들어가므로 페치 캐시에 평문으로 남으면 안 된다(ads.ts 주석).
 * fetch 자체를 try/catch 로 감싼다 — 네트워크 예외가 시그니처를 뚫고 나가는 구멍을
 * 발행 어댑터에서 이미 겪었다(pollContainerStatus, 호출측이 메우고 있던 것).
 */
async function fbPost<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<AdsWriteResult<T>> {
  const q = new URLSearchParams({ ...params, access_token: accessToken });
  try {
    const res = await fetch(`${GRAPH_FB_BASE}${path}?${q.toString()}`, {
      method: "POST",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number; error_subcode?: number };
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
        },
      };
    }
    return { ok: true, data: json, usage: parseUsage(res) };
  } catch (e) {
    return {
      ok: false,
      error: { message: e instanceof Error ? e.message : String(e), code: null, subcode: null, rateLimited: false },
    };
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

function campaignParams(p: CreateCampaignParams): Record<string, string> {
  return {
    name: p.name,
    objective: p.objective,
    /* ⚠️ 생성은 **항상 PAUSED** — 상수로 박고 토글을 주지 않는다. 문서의 생성 예제 6종이 전부
       PAUSED 이고, 이 화면에서 실수로 돈이 나가는 것을 막는 두 번째 겹이다(첫 겹은 소재 부재). */
    status: "PAUSED",
    special_ad_categories: JSON.stringify(p.specialCategories),
    daily_budget: String(toMinor(p.dailyBudget, p.currency)),
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
}

/** 캠페인 수정 — 이름·상태·일 예산. 응답은 {success:true}. */
export async function updateCampaign(p: UpdateCampaignParams): Promise<AdsWriteResult<{ success?: boolean }>> {
  const params: Record<string, string> = {};
  if (p.name !== undefined) params.name = p.name;
  if (p.status !== undefined) params.status = p.status;
  if (p.dailyBudget !== undefined) {
    if (!p.currency) {
      return {
        ok: false,
        error: { message: "currency_required_for_budget", code: null, subcode: null, rateLimited: false },
      };
    }
    params.daily_budget = String(toMinor(p.dailyBudget, p.currency));
  }
  if (Object.keys(params).length === 0) {
    return { ok: false, error: { message: "nothing_to_update", code: null, subcode: null, rateLimited: false } };
  }
  return fbPost<{ success?: boolean }>(`/${p.campaignId}`, params, p.accessToken);
}

/** 사람이 읽는 실패 문구 — Meta 원문은 내부용이라 화면에 그대로 뿌리지 않는다 */
export function writeErrorMessage(e: AdsWriteError): string {
  if (e.rateLimited) return "요청이 잠시 몰렸어요. 몇 분 뒤 다시 시도해 주세요.";
  if (e.code === 190) return "광고 계정 연결이 만료됐어요. 설정에서 다시 연결해 주세요.";
  if (e.code === 200 || e.code === 10) return "이 광고 계정에 쓰기 권한이 없어요. 다시 연결해 주세요.";
  if (e.code === 100) return "입력값을 광고 계정이 받지 않았어요. 예산과 이름을 확인해 주세요.";
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}
