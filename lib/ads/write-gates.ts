import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAdsWriteContext, type AdsWriteContext } from "@/lib/data/ads";
import { isMissingTableError } from "@/lib/supabase/errors";
import { isMissingColumnError } from "@/lib/publish-rules";
import { checkScope, REQUIRED_SCOPE } from "@/lib/meta/granted-scopes";
import { accountStatusWarning } from "@/lib/ads/meta-labels";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";
import type { AdsWriteError } from "@/lib/meta/ads-write";

/**
 * 광고 쓰기 관문 — 캠페인(1단계)과 광고 세트·소재·광고(2단계)가 **같은 함수**로 시작한다.
 * 2026-09-03 에 app/(finch)/(app)/ads/campaigns/actions.ts 안의 내부 함수를 여기로 끌어올렸다(동작 불변).
 *
 * 순서: 데모 → 설정 → 로그인 → 동의 → 역할(viewer·unknown 거절) → 토큰·통화 → 계정 상태 → 스코프 → 쿨다운.
 * 그 뒤 호출측이 **pending 예약**(DB 유니크 잠금)을 잡고 Meta 를 부른 다음 ok/failed 로 확정한다.
 *
 * ⚠️ 일시중지(PAUSED 전환)는 예약·쿨다운을 **거치지 않는다**(recordWrite 로 기록만) —
 * editor 의 체인이 죽어 pending 이 남아도 소유자가 캠페인을 끌 수 있어야 한다(«끄는 걸 막는 쪽이 더 위험하다»).
 * 2026-09-03 설계 검토 blocker.
 */

/** 서버측 쿨다운 — pending 잠금의 보조 겹(확정 직후 연속 재제출 차단) */
export const WRITE_COOLDOWN_SECONDS = 3;
/** 이보다 오래된 pending 은 고아(확정 실패)로 보고 지운 뒤 재시도한다 — 0081 delete 정책과 같은 값 */
export const PENDING_ORPHAN_SECONDS = 60;

/** 감사 로그 action — 0081 은 앞의 넷만 받고, 뒤의 다섯은 0082 가 check 제약을 넓혀야 들어간다 */
export type WriteAction =
  | "create"
  | "status"
  | "budget"
  | "name"
  | "create_ad"
  | "status_adset"
  | "status_ad"
  | "activate_tree"
  | "upload_image";

export interface GateOk {
  ctx: Extract<AdsWriteContext, { state: "ok" }>;
  actorId: string;
}

export type GateResult = { ok: true; gate: GateOk } | { ok: false; code: AdsWriteFailCode };

export async function passGates(options?: {
  /** PAUSED 전환처럼 «멈추는» 쓰기 — 쿨다운으로 막지 않는다 */
  skipCooldown?: boolean;
}): Promise<GateResult> {
  const ctx = await getAdsWriteContext();
  if (ctx.state === "blocked") return { ok: false, code: ctx.code };

  /* 계정 상태 — 미납·비활성 계정에 쓰기를 보내 봐야 Meta 가 거절하거나, 더 나쁘게는
     문제가 풀리는 순간 잊힌 캠페인이 살아난다. */
  if (accountStatusWarning(ctx.accountStatus)) return { ok: false, code: "account_issue" };

  /* 스코프 — null 은 «확인 불가»라 통과, 확실히 없을 때만 막는다(0075 규칙).
     ads_read 하나로 연동한 초기 토큰이 존재할 수 있다(2026-09-02 이전 연동 — 실측 전이라 «없다»고 단정하지 않는다). */
  const scope = checkScope(ctx.grantedScopes, REQUIRED_SCOPE.adsManagement);
  if (scope.state === "missing") return { ok: false, code: "scope_missing" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "login_required" };

  if (!options?.skipCooldown) {
    /* 쿨다운 — 확정된 직전 쓰기와의 간격. (동시 제출은 pending 예약이 DB 유니크로 막는다 —
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
  }

  return { ok: true, gate: { ctx, actorId: user.id } };
}

export type Reservation =
  | { state: "reserved"; logId: string }
  /** 0081 미적용 — 예약 없이 진행한다(호출측이 ACTIVE 전환은 따로 막는다) */
  | { state: "no_table" }
  | { state: "rejected"; code: AdsWriteFailCode };

/**
 * 쓰기 예약 — Meta 호출 **전에** pending 행을 넣는다.
 * (user_id, ad_account_id) 부분 유니크가 동시 제출의 두 번째를 23505 로 튕긴다 —
 * 탭 두 개가 같은 순간 제출해도 캠페인은 하나만 생긴다.
 */
export async function reserveWrite(
  gate: GateOk,
  action: WriteAction,
  request: Record<string, unknown>,
): Promise<Reservation> {
  const supabase = await createClient();

  /* 고아 pending 정리 — 확정(update)이 죽으면 잠금이 남는다. 60초 지난 것만 지울 수 있다(0081 정책).
     ⚠️ actor 조건을 두지 않는다 — 누구의 고아인지는 RLS 가 정한다(0081: 본인 것, 0082: 소유자도).
     actor 로 좁히면 팀원이 남긴 잠금을 소유자가 영영 못 지운다(설계 검토 blocker). */
  await supabase
    .from("meta_ad_write_log")
    .delete()
    .eq("user_id", gate.ctx.ownerId)
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
    /* 23514 = check 위반 — 0082 미적용 DB 에 2단계 action 을 넣은 것. «다시 시도»가 아니라 «준비 중»이다 */
    if (error.code === "23514") return { state: "rejected", code: "not_ready" };
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

export interface WriteIds {
  campaignId?: string | null;
  /** 0082 컬럼 — 없으면 빼고 다시 쓴다 */
  adsetId?: string | null;
  adId?: string | null;
}

/**
 * 쓰기 결과 — unverified 는 «전송 실패 + 재확인 실패»다. Meta 가 적용했을 수도 있는 상태를
 * failed 로 확정하면 감사 로그가 거짓이 된다(슬라이스 0 소넷 점검). 0082 가 check 에 값을 더한다;
 * 그 전 DB(23514)에서는 failed 로 내려 쓰되 error_message 에 UNVERIFIED 를 남긴다.
 */
export type WriteResult = "ok" | "failed" | "unverified";

function downgradeUnverified(result: WriteResult, row: Record<string, unknown>): Record<string, unknown> {
  if (result !== "unverified") return row;
  return { ...row, result: "failed", error_message: `UNVERIFIED | ${String(row.error_message ?? "")}`.slice(0, 1000) };
}

function errorColumns(error?: AdsWriteError): Record<string, unknown> {
  if (!error) return { meta_error_code: null, meta_error_subcode: null, error_message: null };
  /* Meta 의 사용자용 제목·문구는 내부 조사용으로만 함께 남긴다(화면 금지) */
  const detail = [error.message, error.userTitle, error.userMessage, error.transport ? "(transport)" : null]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 1000);
  return { meta_error_code: error.code, meta_error_subcode: error.subcode, error_message: detail };
}

/** 예약 행 확정 — 실패해도 흐름은 막지 않는다(고아는 60초 뒤 정리된다) */
export async function settleWrite(
  logId: string,
  result: WriteResult,
  ids: WriteIds,
  error?: AdsWriteError,
): Promise<void> {
  try {
    const supabase = await createClient();
    const base: Record<string, unknown> = {
      result,
      campaign_id: ids.campaignId ?? null,
      ...errorColumns(error),
    };
    const extra: Record<string, unknown> = {};
    if (ids.adsetId !== undefined) extra.adset_id = ids.adsetId;
    if (ids.adId !== undefined) extra.ad_id = ids.adId;

    let res = await supabase
      .from("meta_ad_write_log")
      .update({ ...base, ...extra })
      .eq("id", logId)
      .select("id");
    if (res.error && Object.keys(extra).length > 0 && isMissingColumnError(res.error, /adset_id|ad_id/i)) {
      res = await supabase.from("meta_ad_write_log").update(base).eq("id", logId).select("id");
    }
    /* 0082 이전 DB — result check 에 unverified 가 없다(23514). failed 로 내려 쓰되 표식을 남긴다 */
    if (res.error && res.error.code === "23514" && result === "unverified") {
      res = await supabase.from("meta_ad_write_log").update(downgradeUnverified(result, base)).eq("id", logId).select("id");
    }
    if (res.error) console.error("[ads-write] 감사 로그 확정 실패:", res.error.message);
    else if (!res.data || res.data.length === 0) console.error("[ads-write] 감사 로그 확정 0행:", logId);
  } catch (e) {
    console.error("[ads-write] 감사 로그 확정 실패:", e);
  }
}

/**
 * 예약 없이 결과만 기록 — **일시중지**처럼 잠금을 걸면 안 되는 쓰기용.
 * pending 을 거치지 않으므로 부분 유니크에 안 걸리고, 다른 사람의 고아 잠금과도 무관하다.
 * 0081 미적용이면 조용히 건너뛴다(끄는 것을 기록 부재로 막지 않는다).
 */
export async function recordWrite(
  gate: GateOk,
  action: WriteAction,
  request: Record<string, unknown>,
  result: WriteResult,
  ids: WriteIds,
  error?: AdsWriteError,
): Promise<void> {
  try {
    const supabase = await createClient();
    const row: Record<string, unknown> = {
      user_id: gate.ctx.ownerId,
      actor_user_id: gate.actorId,
      ad_account_id: gate.ctx.adAccountId,
      campaign_id: ids.campaignId ?? null,
      action,
      request,
      result,
      ...errorColumns(error),
    };
    if (ids.adsetId !== undefined) row.adset_id = ids.adsetId;
    if (ids.adId !== undefined) row.ad_id = ids.adId;

    let res = await supabase.from("meta_ad_write_log").insert(row).select("id");
    if (res.error && isMissingColumnError(res.error, /adset_id|ad_id/i)) {
      const { adset_id: _a, ad_id: _b, ...withoutTree } = row;
      void _a;
      void _b;
      res = await supabase.from("meta_ad_write_log").insert(withoutTree).select("id");
    }
    /* 0082 이전 DB — result check 에 unverified 가 없다(23514) */
    if (res.error && res.error.code === "23514" && result === "unverified") {
      const { adset_id: _c, ad_id: _d, ...plain } = row;
      void _c;
      void _d;
      res = await supabase.from("meta_ad_write_log").insert(downgradeUnverified(result, plain)).select("id");
    }
    if (res.error) {
      if (!isMissingTableError(res.error)) console.error("[ads-write] 쓰기 기록 실패:", res.error.message);
      return;
    }
    if (!res.data || res.data.length === 0) console.error("[ads-write] 쓰기 기록 0행 — RLS 로 막혔을 가능성");
  } catch (e) {
    console.error("[ads-write] 쓰기 기록 실패:", e);
  }
}
