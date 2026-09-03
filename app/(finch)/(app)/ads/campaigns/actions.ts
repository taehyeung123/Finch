"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adsWriteMessage,
  FORM_SPECIAL_AD_CATEGORIES,
  validateCampaignInput,
  type AdsWriteFailCode,
  type CreatableObjective,
  type SpecialAdCategory,
} from "@/lib/ads/campaign-rules";
import {
  passGates,
  recordWrite,
  reserveWrite,
  settleWrite,
  type GateOk,
  type WriteResult,
} from "@/lib/ads/write-gates";
import { fetchCampaignAccountId, fetchObjectStatus } from "@/lib/meta/ads";
import { createCampaign, updateCampaign, writeErrorCode, type AdsWriteError } from "@/lib/meta/ads-write";

/**
 * 캠페인 쓰기 서버 액션 — 돈이 걸린 경로라 관문을 겹겹이 세운다(lib/ads/write-gates.ts):
 * 데모 → 로그인 → 동의 → 역할(viewer 거절) → 토큰·통화 → 계정 상태 → 스코프 →
 * 쿨다운 → **pending 예약(DB 유니크 잠금)** → 규칙 → 캠페인 소유 대조 →
 * Meta validate_only → 실제 쓰기 → 예약 행을 ok/failed 로 확정.
 *
 * ⚠️ **쓰기 자동 재시도 금지** — 생성은 멱등하지 않다. 실패는 실패로 돌려주고 사람이 다시 누른다.
 * ⚠️ 실패 사유는 **코드**로만 나른다(URL 문구 주입 차단) — 문구는 ADS_WRITE_MESSAGES 단일 출처.
 * ⚠️ 2026-09-03 설계 검토 반영 둘:
 *   · 일시중지는 예약·쿨다운을 거치지 않는다 — 팀원의 고아 잠금이 소유자의 «끄기»를 막으면 안 된다.
 *   · 전송 실패(응답 없음)는 «실패»가 아니다 — GET 으로 실제 상태를 다시 읽어 판정한다(ACTIVE 는 돈이 나간다).
 */

export interface CampaignActionState {
  error: string | null;
  createdId: string | null;
  /** 오류로 돌아와도 입력값이 살아 있도록 폼이 되쓴다(React 19 는 제출 시 폼을 리셋한다) */
  values: { name: string; dailyBudget: string } | null;
}

function parseCategories(formData: FormData): SpecialAdCategory[] | null {
  /* «해당 없음» 명시 확인이 곧 빈 배열이다. 확인과 개별 선택이 **동시에** 오면
     모순된 입력이라 거부한다 — 조용히 한쪽을 고르면 사용자가 뭘 보냈는지 모른다. */
  const none = formData.get("noSpecialCategory") === "on";
  /* 폼에 없는 값(CREDIT)은 서버도 받지 않는다 — hidden 필드로 우회해 보내도 무시된다 */
  const picked = FORM_SPECIAL_AD_CATEGORIES.filter((c) => formData.get(`cat_${c}`) === "on");
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
    if (logId) await settleWrite(logId, "failed", {}, dryRun.error);
    return fail(writeErrorCode(dryRun.error));
  }

  const created = await createCampaign(base);
  if (!created.ok) {
    /* 생성의 전송 실패는 재확인할 id 가 없다 — 실패로 두고 사람이 목록을 확인한 뒤 다시 누른다(자동 재시도 금지) */
    if (logId) await settleWrite(logId, "failed", {}, created.error);
    return fail(created.error.transport ? "status_unverified" : writeErrorCode(created.error));
  }

  if (logId) await settleWrite(logId, "ok", { campaignId: created.data.id ?? null });
  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
  return { error: null, createdId: created.data.id ?? "created", values: null };
}

function statusFailPath(code: AdsWriteFailCode): string {
  return `/ads/campaigns?${new URLSearchParams({ write: "error", code }).toString()}`;
}

type StatusOutcome =
  | { kind: "ok" }
  | { kind: "failed"; error: AdsWriteError; code: AdsWriteFailCode }
  /** 전송 실패 뒤 재확인도 실패 — 적용 여부를 모른다 */
  | { kind: "unverified"; error: AdsWriteError };

/**
 * 상태 쓰기 한 번 + 전송 실패 시 재확인.
 * 응답을 못 받았을 때(transport) Meta 가 이미 적용했을 수 있다 — 특히 ACTIVE 는 돈이 나간다.
 * GET 으로 실제 status 를 읽어 «적용됨/안 됨/모름» 을 가른다. 자동 재시도는 하지 않는다.
 */
async function writeStatus(
  gate: GateOk,
  objectId: string,
  wanted: "ACTIVE" | "PAUSED",
): Promise<StatusOutcome> {
  const res = await updateCampaign({ campaignId: objectId, accessToken: gate.ctx.accessToken, status: wanted });
  if (res.ok) return { kind: "ok" };
  if (!res.error.transport) return { kind: "failed", error: res.error, code: writeErrorCode(res.error) };

  const observed = await fetchObjectStatus(objectId, gate.ctx.accessToken);
  if (observed === null) return { kind: "unverified", error: res.error };
  if (observed.status === wanted) return { kind: "ok" };
  return { kind: "failed", error: res.error, code: "failed" };
}

export async function setCampaignStatusAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") ?? "");
  const status = String(formData.get("status") ?? "");
  const pausing = status === "PAUSED";

  /* 관문이 먼저다(HEAD 와 같은 순서 — 로그인 안 한 요청은 입력이 어떻든 login_required 를 본다).
     일시중지는 쿨다운·예약을 건너뛴다 — «멈추기»를 잠금이 막으면 안 된다 */
  const gates = await passGates({ skipCooldown: pausing });
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
  const wanted = status as "ACTIVE" | "PAUSED";

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

  const request = { campaignId, status: wanted };
  /* 감사 로그 결과 — «모름»은 모름으로 남긴다(failed 로 확정하지 않는다) */
  const logResult = (o: StatusOutcome): WriteResult =>
    o.kind === "ok" ? "ok" : o.kind === "unverified" ? "unverified" : "failed";

  if (pausing) {
    const outcome = await writeStatus(gate, campaignId, wanted);
    await recordWrite(
      gate,
      "status",
      request,
      logResult(outcome),
      { campaignId },
      outcome.kind === "ok" ? undefined : outcome.error,
    );
    if (outcome.kind === "failed") redirect(statusFailPath(outcome.code));
    /* 목록·홈을 새로 그린다 — 꺼졌을 수도 있는 상태를 사용자가 실제 값으로 보게 */
    revalidatePath("/ads/campaigns");
    revalidatePath("/ads");
    if (outcome.kind === "unverified") redirect(statusFailPath("status_unverified"));
    redirect("/ads/campaigns?write=paused");
  }

  const reservation = await reserveWrite(gate, "status", request);
  if (reservation.state === "rejected") {
    redirect(statusFailPath(reservation.code));
  }
  /* ⚠️ ACTIVE 전환은 이 MVP 에서 돈이 나갈 수 있는 유일한 경로다(소재가 붙은 기존 캠페인).
     0081 미적용이면 감사 로그 없이 돈 쓰는 길이 열리므로 **전환을 막는다**. */
  if (reservation.state === "no_table") {
    redirect(statusFailPath("not_ready"));
  }
  const logId = reservation.logId;

  const outcome = await writeStatus(gate, campaignId, wanted);
  await settleWrite(logId, logResult(outcome), { campaignId }, outcome.kind === "ok" ? undefined : outcome.error);
  if (outcome.kind === "failed") {
    redirect(statusFailPath(outcome.code));
  }
  /* 켜졌을 수도 있다 — 목록·홈을 새로 그려 사용자가 실제 상태를 보게 한다 */
  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
  if (outcome.kind === "unverified") {
    redirect(statusFailPath("status_unverified"));
  }
  redirect("/ads/campaigns?write=activated");
}
