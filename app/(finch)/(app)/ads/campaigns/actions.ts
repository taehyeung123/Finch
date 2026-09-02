"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdsWriteContext, type AdsWriteContext } from "@/lib/data/ads";
import { isMissingTableError } from "@/lib/supabase/errors";
import { checkScope, REQUIRED_SCOPE } from "@/lib/meta/granted-scopes";
import { accountStatusWarning } from "@/lib/ads/meta-labels";
import {
  SPECIAL_AD_CATEGORIES,
  validateCampaignInput,
  type CreatableObjective,
  type SpecialAdCategory,
} from "@/lib/ads/campaign-rules";
import {
  createCampaign,
  updateCampaign,
  writeErrorMessage,
  type AdsWriteError,
} from "@/lib/meta/ads-write";

/**
 * 캠페인 쓰기 서버 액션 — 돈이 걸린 경로라 관문을 겹겹이 세운다:
 * 데모 → 로그인 → 역할(viewer 거절) → 토큰·통화 → 계정 상태 → 스코프 → 연타 → 규칙 →
 * Meta validate_only → 실제 쓰기 → 감사 로그.
 *
 * ⚠️ **쓰기 자동 재시도 금지** — 생성은 멱등하지 않다. 실패는 실패로 돌려주고 사람이 다시 누른다.
 */

export interface CampaignActionState {
  error: string | null;
  /** 생성 성공 — 목록 재조회 실패와 «만들지 못함»을 구분하려고 성공 사실을 따로 든다 */
  createdId: string | null;
}

const INITIAL_OK: CampaignActionState = { error: null, createdId: null };

/** 서버측 연타 방어 — 직전 N초 내 같은 계정 쓰기가 로그에 있으면 거절 (탭 두 개는 pending 잠금이 못 막는다) */
const WRITE_COOLDOWN_SECONDS = 3;

interface GateOk {
  ctx: Extract<AdsWriteContext, { state: "ok" }>;
  actorId: string;
}

async function passGates(): Promise<{ ok: true; gate: GateOk } | { ok: false; error: string }> {
  const ctx = await getAdsWriteContext();
  if (ctx.state === "blocked") return { ok: false, error: ctx.reason };

  /* 계정 상태 — 미납·비활성 계정에 쓰기를 보내 봐야 Meta 가 거절하거나, 더 나쁘게는
     문제가 풀리는 순간 잊힌 캠페인이 살아난다. 문구는 조회 화면과 같은 단일 출처를 쓴다. */
  const statusWarning = accountStatusWarning(ctx.accountStatus);
  if (statusWarning) return { ok: false, error: statusWarning };

  /* 스코프 — null 은 «확인 불가»라 통과, 확실히 없을 때만 막는다(0075 규칙).
     ads_read 하나로 연동한 초기 토큰이 실제로 존재한다(2026-09-02 이전 연동). */
  const scope = checkScope(ctx.grantedScopes, REQUIRED_SCOPE.adsManagement);
  if (scope.state === "missing") {
    return { ok: false, error: "이 연결에는 캠페인 관리 권한이 없어요. 설정에서 다시 연결해 주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  /* 연타 방어 — 감사 로그를 근거로 쓴다. 표가 없으면(0081 미적용) 이 방어만 건너뛴다.
     쓰기는 3점/60점 예산이라 연타 20번이면 계정 전체가 5분 차단된다(성과 화면까지 죽는다). */
  const since = new Date(Date.now() - WRITE_COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent, error: logErr } = await supabase
    .from("meta_ad_write_log")
    .select("id")
    .eq("user_id", ctx.ownerId)
    .eq("ad_account_id", ctx.adAccountId)
    .gte("created_at", since)
    .limit(1);
  if (!logErr && recent && recent.length > 0) {
    return { ok: false, error: "요청이 너무 빨라요. 잠시 후 다시 시도해 주세요." };
  }

  return { ok: true, gate: { ctx, actorId: user.id } };
}

/** 감사 로그 기록 — 실패해도 흐름을 막지 않는다(로그가 기능을 죽이면 안 된다). 0081 미적용도 통과. */
async function logWrite(params: {
  gate: GateOk;
  action: "create" | "status" | "budget" | "name";
  campaignId: string | null;
  request: Record<string, unknown>;
  result: "ok" | "failed";
  error?: AdsWriteError;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("meta_ad_write_log")
      .insert({
        user_id: params.gate.ctx.ownerId,
        actor_user_id: params.gate.actorId,
        ad_account_id: params.gate.ctx.adAccountId,
        campaign_id: params.campaignId,
        action: params.action,
        request: params.request, // ⚠️ 토큰 금지 — 파라미터만
        result: params.result,
        meta_error_code: params.error?.code ?? null,
        meta_error_subcode: params.error?.subcode ?? null,
        error_message: params.error?.message ?? null,
      })
      .select("id");
    if (error && !isMissingTableError(error)) {
      console.error("[ads-write] 감사 로그 기록 실패:", error.message);
    } else if (!error && (!data || data.length === 0)) {
      console.error("[ads-write] 감사 로그 0행 — RLS 로 막혔을 가능성");
    }
  } catch (e) {
    console.error("[ads-write] 감사 로그 기록 실패:", e);
  }
}

function parseCategories(formData: FormData): SpecialAdCategory[] | null {
  /* «해당 없음» 명시 확인이 곧 빈 배열이다 — 확인도 선택도 없으면 보내지 않는다(제재 사유) */
  if (formData.get("noSpecialCategory") === "on") return [];
  const picked = SPECIAL_AD_CATEGORIES.filter((c) => formData.get(`cat_${c}`) === "on");
  return picked.length > 0 ? picked : null;
}

export async function createCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const gates = await passGates();
  if (!gates.ok) return { ...INITIAL_OK, error: gates.error };
  const { gate } = gates;
  const { ctx } = gate;

  const name = String(formData.get("name") ?? "").trim();
  const objective = String(formData.get("objective") ?? "") as CreatableObjective;
  const dailyBudget = Number(formData.get("dailyBudget"));
  const categories = parseCategories(formData);
  if (categories === null) {
    return { ...INITIAL_OK, error: "특별 광고 카테고리를 선택하거나 «해당 없음»을 확인해 주세요." };
  }

  /* min_daily_budget 은 이번 요청에서 조회하지 않았으므로 null(모름) — Meta 검증이 잡는다 */
  const ruleError = validateCampaignInput({ name, objective, dailyBudget, minDailyBudget: null });
  if (ruleError) return { ...INITIAL_OK, error: ruleError };

  const base = {
    adAccountId: ctx.adAccountId,
    accessToken: ctx.accessToken,
    name,
    objective,
    dailyBudget,
    currency: ctx.currency,
    specialCategories: categories,
  };

  /* Meta 자체 검증을 먼저 받는다 — 만들지 않고 규칙만 돌린다(validate_only).
     실패 오류율(Full 승급 조건)도 지키고, 사용자가 «왜 안 되는지»를 생성 전에 안다. */
  const dryRun = await createCampaign({ ...base, validateOnly: true });
  if (!dryRun.ok) {
    await logWrite({
      gate,
      action: "create",
      campaignId: null,
      request: { ...base, accessToken: undefined, validateOnly: true },
      result: "failed",
      error: dryRun.error,
    });
    return { ...INITIAL_OK, error: writeErrorMessage(dryRun.error) };
  }

  const created = await createCampaign(base);
  if (!created.ok) {
    await logWrite({
      gate,
      action: "create",
      campaignId: null,
      request: { ...base, accessToken: undefined },
      result: "failed",
      error: created.error,
    });
    return { ...INITIAL_OK, error: writeErrorMessage(created.error) };
  }

  await logWrite({
    gate,
    action: "create",
    campaignId: created.data.id ?? null,
    request: { ...base, accessToken: undefined },
    result: "ok",
  });
  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
  return { error: null, createdId: created.data.id ?? "created" };
}

/** 실패를 쿼리 파라미터로 알린다 — ConfirmSubmit(void 액션) 경유라 반환값 자리가 없다 */
function statusFailPath(msg: string): string {
  return `/ads/campaigns?${new URLSearchParams({ write: "error", detail: msg }).toString()}`;
}

export async function setCampaignStatusAction(formData: FormData): Promise<void> {
  const gates = await passGates();
  const campaignId = String(formData.get("campaignId") ?? "");
  const status = String(formData.get("status") ?? "");
  const fail = statusFailPath;

  if (!gates.ok) {
    redirect(fail(gates.error));
  }
  const { gate } = gates;

  if (!campaignId || (status !== "ACTIVE" && status !== "PAUSED")) {
    redirect(fail("요청이 올바르지 않아요."));
  }

  /* ⚠️ ACTIVE 전환은 돈이 나가기 시작할 수 있는 유일한 MVP 경로다(기존 캠페인에 소재가 붙어
     있는 경우). 0081 미적용이면 감사 로그 없이 돈 쓰는 길이 열리므로 **전환만** 막는다 —
     PAUSED 전환(끄기)은 언제나 허용한다(끄는 걸 막는 쪽이 더 위험하다). */
  if (status === "ACTIVE") {
    const supabase = await createClient();
    const probe = await supabase.from("meta_ad_write_log").select("id").limit(1);
    if (probe.error && isMissingTableError(probe.error)) {
      redirect(fail("게재 시작은 아직 준비 중이에요."));
    }
  }

  const res = await updateCampaign({
    campaignId,
    accessToken: gate.ctx.accessToken,
    status: status as "ACTIVE" | "PAUSED",
  });
  await logWrite({
    gate,
    action: "status",
    campaignId,
    request: { status },
    result: res.ok ? "ok" : "failed",
    error: res.ok ? undefined : res.error,
  });
  if (!res.ok) redirect(fail(writeErrorMessage(res.error)));

  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
  redirect(`/ads/campaigns?write=${status === "ACTIVE" ? "activated" : "paused"}`);
}