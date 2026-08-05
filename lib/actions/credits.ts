import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  AI 생성 과금 헬퍼 — "무료 월 한도 → 크레딧 소비" 2단계 게이트.
  ----------------------------------------------------------------------------
  모델(2026-07-26 결정, 마이그레이션 0016_credits.sql 위에서 동작):
  - 각 AI 기능은 플랜별 무료 월 한도를 먼저 소비한다(use_quota — 기존 동작 유지,
    기존 무료 사용자는 아무것도 잃지 않는다).
  - 무료 한도 소진 후에는 크레딧을 소비한다(deduct_my_credits — 잔액 부족 시 차단).
  - 크레딧은 현재 HQ 관리자 지급으로만 충전된다(판매·자동충전은 별도 결정 후).
  - 유료 플랜은 한도가 사실상 무제한이라 크레딧 소비 구간에 도달하지 않는다.

  안전 원칙(CLAUDE.md 크레딧 트랜잭션 원칙 승계):
  - 잔액 직접 UPDATE 금지 — 차감은 deduct_my_credits, 환불은 add_credits RPC로만.
  - 크레딧이 차감됐는데 AI 호출이 실패하면 반드시 refundGenerationCredits로 복구
    (무료 한도 구간 실패는 기존과 동일하게 미복구 — 금전 성격이 없는 카운터).
*/

/** 기능별 크레딧 가격 — 호출 무게(토큰·데이터 조회) 기준. 변경 시 아래 표만 수정 */
export const CREDIT_COSTS = {
  /** AI 카드뉴스 생성(2안) 1회 */
  cardnews: 2,
  /** 성장 진단(실측 성과 분석 + AI) 1회 */
  diagnosis: 3,
  /** 레퍼런스 수집 1회 — 공급사 API 호출(기준당 1크레딧 원가) + AI 요약·태깅 */
  collect: 2,
} as const;

/** 플랜별 무료 월 한도 — planFeatures 표와 일치 유지 (무료 3회, 유료 사실상 무제한) */
export const FREE_MONTHLY_LIMITS: Record<string, Record<string, number>> = {
  ai_cardnews: { free: 3, creator: 1000000, pro: 1000000, agency: 1000000, enterprise: 1000000 },
  growth_diagnosis: { free: 3, creator: 1000000, pro: 1000000, agency: 1000000, enterprise: 1000000 },
  // 레퍼런스 수집은 공급사 원가가 실비로 나가므로 유료 플랜도 월 한도를 둔다(사실상 넉넉한 수준)
  reference_collect: { free: 3, creator: 60, pro: 150, agency: 300, enterprise: 1000 },
};

export type ChargeResult =
  | { ok: true; via: "quota" | "credits"; userId: string; remainingCredits: number | null }
  | { ok: false; error: string };

/**
 * 생성 1회 과금: 무료 월 한도(use_quota) 우선, 소진 시 크레딧(deduct_my_credits).
 * ok:false면 기능을 실행하지 말 것. via:"credits"였는데 이후 처리가 실패하면
 * 반드시 refundGenerationCredits(userId, cost, ...)로 환불할 것.
 */
export async function chargeGeneration(opts: {
  metric: keyof typeof FREE_MONTHLY_LIMITS | string;
  creditCost: number;
  reason: string;
}): Promise<ChargeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("users_profile")
    .select("plan, credits")
    .eq("id", user.id)
    .maybeSingle();
  const limits = FREE_MONTHLY_LIMITS[opts.metric] ?? { free: 3 };
  const limit = limits[profile?.plan ?? "free"] ?? limits.free ?? 3;

  // 1단계 — 플랜 무료 월 한도(기존 동작 그대로)
  const { data: allowed, error: quotaErr } = await supabase.rpc("use_quota", {
    p_metric: opts.metric,
    p_limit: limit,
    p_amount: 1,
  });
  if (quotaErr) {
    console.error(`[credits] use_quota 실패(${opts.metric}):`, quotaErr.message);
    return { ok: false, error: "사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (allowed) return { ok: true, via: "quota", userId: user.id, remainingCredits: null };

  // 2단계 — 무료 한도 소진: 크레딧 소비(원자적, 잔액 부족 시 false)
  const { data: paid, error: credErr } = await supabase.rpc("deduct_my_credits", {
    p_amount: opts.creditCost,
    p_reason: opts.reason,
  });
  if (credErr) {
    console.error(`[credits] deduct_my_credits 실패(${opts.metric}):`, credErr.message);
    return { ok: false, error: "크레딧 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (!paid) {
    const balance = profile?.credits ?? 0;
    return {
      ok: false,
      error: `이번 달 무료 한도(${limit === 1000000 ? "무제한" : `${limit}회`})를 다 썼고, 크레딧이 부족해요(필요 ${opts.creditCost} · 보유 ${balance}). 크레딧을 충전받거나 플랜을 업그레이드하면 계속 쓸 수 있어요.`,
    };
  }
  // 표시용 잔액 — 차감 전 조회값 기준 근사(동시 요청 시 오차 가능, 원장은 항상 정확)
  const remaining = Math.max(0, (profile?.credits ?? opts.creditCost) - opts.creditCost);
  return { ok: true, via: "credits", userId: user.id, remainingCredits: remaining };
}

/**
 * 크레딧 환불 — 차감 후 AI 호출이 실패했을 때만 사용.
 * add_credits는 service_role 전용이라 관리자 클라이언트로 호출한다.
 */
export async function refundGenerationCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[credits] 환불 실패: 관리자 클라이언트 미설정 —", userId, amount, reason);
    return;
  }
  const { error } = await admin.rpc("add_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) console.error("[credits] 환불 실패:", error.message);
}
