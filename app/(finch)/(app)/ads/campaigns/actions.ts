"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdsWriteContext, type AdsWriteContext } from "@/lib/data/ads";
import { isMissingTableError } from "@/lib/supabase/errors";
import { checkScope, REQUIRED_SCOPE } from "@/lib/meta/granted-scopes";
import { accountStatusWarning } from "@/lib/ads/meta-labels";
import {
  adsWriteMessage,
  SPECIAL_AD_CATEGORIES,
  validateCampaignInput,
  type AdsWriteFailCode,
  type CreatableObjective,
  type SpecialAdCategory,
} from "@/lib/ads/campaign-rules";
import { fetchCampaignAccountId } from "@/lib/meta/ads";
import {
  createCampaign,
  updateCampaign,
  writeErrorCode,
  type AdsWriteError,
} from "@/lib/meta/ads-write";

/**
 * 캠페인 쓰기 서버 액션 — 돈이 걸린 경로라 관문을 겹겹이 세운다:
 * 데모 → 로그인 → 동의 → 역할(viewer 거절) → 토큰·통화 → 계정 상태 → 스코프 →
 * 쿨다운 → **pending 예약(DB 유니크 잠금)** → 규칙 → 캠페인 소유 대조 →
 * Meta validate_only → 실제 쓰기 → 예약 행을 ok/failed 로 확정.
 *
 * ⚠️ **쓰기 자동 재시도 금지** — 생성은 멱등하지 않다. 실패는 실패로 돌려주고 사람이 다시 누른다.
 * ⚠️ 실패 사유는 **코드**로만 나른다(URL 문구 주입 차단) — 문구는 ADS_WRITE_MESSAGES 단일 출처.
 */

export interface CampaignActionState {
  error: string | null;
  createdId: string | null;
  /** 오류로 돌아와도 입력값이 살아 있도록 폼이 되쓴다(React 19 는 제출 시 폼을 리셋한다) */
  values: { name: string; dailyBudget: string } | null;
}

/** 서버측 쿨다운 — pending 잠금의 보조 겹(확정 직후 연속 재제출 차단) */
const WRITE_COOLDOWN_SECONDS = 3;
/** 이보다 오래된 pending 은 고아(확정 실패)로 보고 지운 뒤 재시도한다 — 0081 delete 정책과 같은 값 */
const PENDING_ORPHAN_SECONDS = 60;

interface GateOk {
  ctx: Extract<AdsWriteContext, { state: "ok" }>;
  actorId: string;
}

async function passGates(): Promise<{ ok: true; gate: GateOk } | { ok: false; code: AdsWriteFailCode }> {
  const ctx = await getAdsWriteContext();
  if (ctx.state === "blocked") return { ok: false, code: ctx.code };

  /* 계정 상태 — 미납·비활성 계정에 쓰기를 보내 봐야 Meta 가 거절하거나, 더 나쁘게는
     문제가 풀리는 순간 잊힌 캠페인이 살아난다. */
  if (accountStatusWarning(ctx.accountStatus)) return { ok: false, code: "account_issue" };

  /* 스코프 — null 은 «확인 불가»라 통과, 확실히 없을 때만 막는다(0075 규칙).
     ads_read 하나로 연동한 초기 토큰이 실제로 존재한다(2026-09-02 이전 연동). */
  const scope = checkScope(ctx.grantedScopes, REQUIRED_SCOPE.adsManagement);
  if (scope.state === "missing") return { ok: false, code: "scope_missing" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "login_required" };

  /* 쿨다운 — 확정된 직전 쓰기와의 간격. (동시 제출은 아래 pending 예약이 DB 유니크로 막는다 —
     이 조회만으로는 Meta 왕복 동안의 경쟁을 못 막는다는 것이 감사 지적이었다.) */
  const since = new Date(Date.now() - WRITE_COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent, error: logErr } = await supabase
    .from("meta_ad_write_log")
    .select("id")
    .eq("user_id", ctx.ownerId)
    .eq("ad_account_id", ctx.adAccountId)
    .gte("created_at", since)
    .limit(1);
  if (!logErr && recent && recent.length > 0) {
    return { ok: false, code: "cooldown" };
  }

  return { ok: true, gate: { ctx, actorId: user.id } };
}

type Reservation =
  | { state: "reserved"; logId: string }
  /** 0081 미적용 — 예약 없이 진행한다(호출측이 ACTIVE 전환은 따로 막는다) */
  | { state: "no_table" }
  | { state: "rejected"; code: AdsWriteFailCode };

/**
 * 쓰기 예약 — Meta 호출 **전에** pending 행을 넣는다.
 * (user_id, ad_account_id) 부분 유니크가 동시 제출의 두 번째를 23505 로 튕긴다 —
 * 탭 두 개가 같은 순간 제출해도 캠페인은 하나만 생긴다.
 */
async function reserveWrite(
  gate: GateOk,
  action: "create" | "status" | "budget" | "name",
  request: Record<string, unknown>,
): Promise<Reservation> {
  const supabase = await createClient();

  /* 고아 pending 정리 — 확정(update)이 죽으면 잠금이 남는다. 60초 지난 것만 지울 수 있다(0081 정책). */
  await supabase
    .from("meta_ad_write_log")
    .delete()
    .eq("actor_user_id", gate.actorId)
    .eq("ad_account_id", gate.ctx.adAccountId)
    .eq("result", "pending")
    .lt("created_at", new Date(Date.now() - PENDING_ORPHAN_SECONDS * 1000).toISOString());

  const { data, error } = await supabase
    .from("meta_ad_write_log")
    .insert({
      user_id: gate.ctx.ownerId,
      actor_user_id: gate.actorId,
      ad_account_id: gate.ctx.adAccountId,
      campaign_id: null,
      action,
      request, // ⚠️ 토큰 금지 — 파라미터만
      result: "pending",
    })
    .select("id");

  if (error) {
    if (isMissingTableError(error)) return { state: "no_table" };
    if (error.code === "23505") return { state: "rejected", code: "busy" };
    console.error("[ads-write] 쓰기 예약 실패:", error.message);
    /* 돈 경로는 fail-closed — 기록 못 하는 쓰기를 열지 않는다(읽기의 fail-open 과 반대) */
    return { state: "rejected", code: "failed" };
  }
  if (!data || data.length === 0) {
    console.error("[ads-write] 쓰기 예약 0행 — RLS 로 막혔을 가능성");
    return { state: "rejected", code: "failed" };
  }
  return { state: "reserved", logId: (data[0] as { id: string }).id };
}

/** 예약 행 확정 — 실패해도 흐름은 막지 않는다(고아는 60초 뒤 정리된다) */
async function settleWrite(
  logId: string,
  result: "ok" | "failed",
  campaignId: string | null,
  error?: AdsWriteError,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data, error: upErr } = await supabase
      .from("meta_ad_write_log")
      .update({
        result,
        campaign_id: campaignId,
        meta_error_code: error?.code ?? null,
        meta_error_subcode: error?.subcode ?? null,
        error_message: error?.message ?? null,
      })
      .eq("id", logId)
      .select("id");
    if (upErr) console.error("[ads-write] 감사 로그 확정 실패:", upErr.message);
    else if (!data || data.length === 0) console.error("[ads-write] 감사 로그 확정 0행:", logId);
  } catch (e) {
    console.error("[ads-write] 감사 로그 확정 실패:", e);
  }
}

function parseCategories(formData: FormData): SpecialAdCategory[] | null {
  /* «해당 없음» 명시 확인이 곧 빈 배열이다. 확인과 개별 선택이 **동시에** 오면
     모순된 입력이라 거부한다 — 조용히 한쪽을 고르면 사용자가 뭘 보냈는지 모른다. */
  const none = formData.get("noSpecialCategory") === "on";
  const picked = SPECIAL_AD_CATEGORIES.filter((c) => formData.get(`cat_${c}`) === "on");
  if (none && picked.length > 0) return null;
  if (none) return [];
  return picked.length > 0 ? picked : null;
}

export async function createCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const dailyBudgetRaw = String(formData.get("dailyBudget") ?? "");
  /* 오류 시 입력값을 돌려준다 — React 19 가 제출 순간 폼을 리셋해서,
     안 돌려주면 서버 오류 한 번에 쓰던 이름·예산이 통째로 날아간다(감사 지적). */
  const values = { name, dailyBudget: dailyBudgetRaw };
  const fail = (code: AdsWriteFailCode): CampaignActionState => ({
    error: adsWriteMessage(code),
    createdId: null,
    values,
  });

  const gates = await passGates();
  if (!gates.ok) return fail(gates.code);
  const { gate } = gates;
  const { ctx } = gate;

  const objective = String(formData.get("objective") ?? "") as CreatableObjective;
  const dailyBudget = Number(dailyBudgetRaw);
  const categories = parseCategories(formData);
  if (categories === null) {
    return {
      error: "특별 광고 카테고리를 선택하거나 «해당 없음»을 확인해 주세요. (둘을 동시에 고를 수는 없어요)",
      createdId: null,
      values,
    };
  }

  const ruleError = validateCampaignInput({ name, objective, dailyBudget, minDailyBudget: null });
  if (ruleError) return { error: ruleError, createdId: null, values };

  const base = {
    adAccountId: ctx.adAccountId,
    accessToken: ctx.accessToken,
    name,
    objective,
    dailyBudget,
    currency: ctx.currency,
    specialCategories: categories,
  };
  const logRequest = { name, objective, dailyBudget, currency: ctx.currency, specialCategories: categories };

  /* pending 예약 — Meta 호출 전. 생성은 PAUSED 상수라 돈이 안 나가므로
     0081 미적용(no_table)이어도 통과시킨다(ACTIVE 전환만 로그 없이는 안 연다). */
  const reservation = await reserveWrite(gate, "create", logRequest);
  if (reservation.state === "rejected") return fail(reservation.code);
  const logId = reservation.state === "reserved" ? reservation.logId : null;

  /* Meta 자체 검증 먼저(validate_only) — 만들지 않고 규칙만 돌린다 */
  const dryRun = await createCampaign({ ...base, validateOnly: true });
  if (!dryRun.ok) {
    if (logId) await settleWrite(logId, "failed", null, dryRun.error);
    return fail(writeErrorCode(dryRun.error));
  }

  const created = await createCampaign(base);
  if (!created.ok) {
    if (logId) await settleWrite(logId, "failed", null, created.error);
    return fail(writeErrorCode(created.error));
  }

  if (logId) await settleWrite(logId, "ok", created.data.id ?? null);
  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
  return { error: null, createdId: created.data.id ?? "created", values: null };
}

function statusFailPath(code: AdsWriteFailCode): string {
  return `/ads/campaigns?${new URLSearchParams({ write: "error", code }).toString()}`;
}

export async function setCampaignStatusAction(formData: FormData): Promise<void> {
  const gates = await passGates();
  const campaignId = String(formData.get("campaignId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!gates.ok) {
    redirect(statusFailPath(gates.code));
  }
  const { gate } = gates;

  /* ⚠️ campaignId 는 클라이언트 hidden 필드다 — **숫자만** 허용한다.
     검증 없이 URL 경로에 보간하면 ?·&·/ 주입으로 status=DELETED·임의 필드 변경·
     임의 Graph POST 프록시까지 열린다(감사 high 적발). */
  if (!/^\d{1,30}$/.test(campaignId) || (status !== "ACTIVE" && status !== "PAUSED")) {
    redirect(statusFailPath("invalid_request"));
  }

  /* 소유 대조 — 소유자 토큰은 그 사람이 관리하는 **모든** 광고 계정을 커버하므로,
     id 만 믿으면 워크스페이스가 고르지도 않은 계정의 캠페인을 켤 수 있다(감사 적발).
     확인 실패(null)는 돈 경로라 fail-closed. */
  const campaignAccount = await fetchCampaignAccountId(campaignId, gate.ctx.accessToken);
  if (campaignAccount === null) {
    redirect(statusFailPath("campaign_unverified"));
  }
  if (campaignAccount !== gate.ctx.adAccountId) {
    redirect(statusFailPath("campaign_not_yours"));
  }

  const reservation = await reserveWrite(gate, "status", { campaignId, status });
  if (reservation.state === "rejected") {
    redirect(statusFailPath(reservation.code));
  }
  /* ⚠️ ACTIVE 전환은 이 MVP 에서 돈이 나갈 수 있는 유일한 경로다(소재가 붙은 기존 캠페인).
     0081 미적용이면 감사 로그 없이 돈 쓰는 길이 열리므로 **전환만** 막는다 —
     PAUSED 전환(끄기)·생성은 통과다(끄는 걸 막는 쪽이 더 위험하다). */
  if (reservation.state === "no_table" && status === "ACTIVE") {
    redirect(statusFailPath("not_ready"));
  }
  const logId = reservation.state === "reserved" ? reservation.logId : null;

  const res = await updateCampaign({
    campaignId,
    accessToken: gate.ctx.accessToken,
    status: status as "ACTIVE" | "PAUSED",
  });
  if (logId) await settleWrite(logId, res.ok ? "ok" : "failed", campaignId, res.ok ? undefined : res.error);
  if (!res.ok) {
    redirect(statusFailPath(writeErrorCode(res.error)));
  }

  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
  redirect(`/ads/campaigns?write=${status === "ACTIVE" ? "activated" : "paused"}`);
}
