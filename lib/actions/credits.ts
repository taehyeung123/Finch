import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaidPlan } from "@/lib/toss/config";

/*
  AI 생성 과금 헬퍼 — 2026-08-14 4차 개편: "무료=기능별 횟수, 유료=통합 크레딧".
  ----------------------------------------------------------------------------
  - 무료 플랜: 기존 그대로 기능별 월 한도(use_quota, FREE_MONTHLY_LIMITS)만 본다.
  - 유료 플랜(creator/pro/agency/enterprise): 기능별 한도를 없애고 플랜당 "월 크레딧
    지급량"(PLAN_CREDIT_ALLOWANCE) 하나로 통합한다 — 카드뉴스에 몰아 쓰든 챗에 몰아
    쓰든 자유. 크레딧은 결제 성공 시점(첫 결제·업그레이드·정기갱신, grant_plan_credits
    RPC)마다 지급량"까지 채워진다"(top-up, 0039) — 미사용분이 다음 달로 누적되지 않고
    (잔액이 지급량 이하면 지급량으로 리필, 이월 합산 없음), 관리자 지급·환불로 지급량을
    넘어선 잔액은 보존된다. 0037의 "리셋"은 관리자 지급분까지 파괴해서 0039에서 고쳤다.
  - 플랜 해지·강등 후 남은 크레딧은 소멸시키지 않는다(의도된 동작) — 이미 결제로 지급된
    돈이고, 무료 전환 후에도 2단계 게이트(무료 한도 소진 → 크레딧)로 이어 쓸 수 있다.
    새 지급은 결제 성공 시에만 일어나므로 무기한 증식은 불가능하다.
  - 크레딧 1개 = 10원 고정 환율. CREDIT_COSTS는 기능별 실측 원가를 올림(ceil)해서 뒀다
    (예: 카드뉴스 200원→20크레딧, 대본추출 2원→최소 1크레딧). 그래서 어떤 기능 조합으로
    크레딧을 다 써도 실제 원가는 "지급 크레딧 수 × 10원"을 못 넘는다 — 기능별 캡이
    없어져도 플랜의 최악 원가 상한은 그대로 지켜진다.
  - 무료 플랜은 한도 소진 후에도 관리자 지급 크레딧(add_credits)이 있으면 그걸로 이어
    쓸 수 있다(기존 동작 유지).

  안전 원칙(CLAUDE.md 크레딧 트랜잭션 원칙 승계):
  - 잔액 직접 UPDATE 금지 — 차감은 deduct_my_credits, 환불은 add_credits RPC로만,
    플랜 지급/리셋은 grant_plan_credits RPC로만(전부 supabase/migrations/0016·0037).
  - 크레딧이 차감됐는데 AI 호출이 실패하면 반드시 refundGenerationCredits로 복구
    (무료 한도 구간 실패는 기존과 동일하게 미복구 — 금전 성격이 없는 카운터).
*/

/**
 * 기능별 크레딧 가격 — 1크레딧 = 10원 고정 환율로 실측 원가를 올림(ceil)한 값.
 * 원가 자체가 바뀌면(공급사 단가 변동 등) 이 표만 다시 계산해서 고친다.
 */
export const CREDIT_COSTS = {
  /** AI 카드뉴스 생성 1회 — 실측 200원 */
  cardnews: 20,
  /** 성장 진단(실측 성과 분석 + AI) 1회 — 실측 200원 */
  diagnosis: 20,
  /** 레퍼런스 수집 1회(개인 수집 + 실시간 풀 수집 공용) — 실측 100원 */
  collect: 10,
  /** 메타광고 레퍼런스 수집 1회 — 실측 100원 */
  adCollect: 10,
  /** 릴스 대본 추출 1회 — 실측 2원(최소 단위 1크레딧) */
  transcript: 1,
  /** 아이디어 추천 1회 — 카드뉴스와 토큰·사고 설정이 같아 원가도 같다 */
  ideas: 20,
  /** 브랜드 톤 학습 1회 — 실측 100원 */
  brandTone: 10,
  /** AI 에이전트 메시지 1건 — 실측 35원 */
  agentChat: 4,
} as const;

/**
 * 무료 플랜 전용 — 기능별 월 한도. 유료 플랜은 더 이상 이 표를 쓰지 않고
 * PLAN_CREDIT_ALLOWANCE(통합 크레딧) 하나로 관리한다(2026-08-14 4차 개편).
 *
 * ai_video_analysis·board_saves는 실제로 chargeGeneration을 호출하는 곳이 코드에
 * 없다(2026-08-14 grep 확인) — 즉 지금은 게이팅되지 않는 죽은 설정이다. 나중에 실제
 * 영상분석·보드저장에 과금을 붙일 때 값만 그대로 살려 쓸 수 있게 남겨뒀다.
 */
export const FREE_MONTHLY_LIMITS: Record<string, number> = {
  ai_cardnews: 0,
  growth_diagnosis: 0,
  // "개인 수집"(구형 runCollection)과 "실시간 풀 수집"(collectPoolNow)이 이 계량기를 공유한다.
  reference_collect: 1,
  ad_collect: 1,
  reference_transcript: 1,
  ai_ideas: 0,
  ai_brand_tone: 0,
  ai_agent_chat: 3,
  ai_video_analysis: 3, // 미사용(연결 안 됨) — 위 설명 참고
  board_saves: 20, // 미사용(연결 안 됨) — 위 설명 참고
};

/**
 * 유료 플랜 월 크레딧 지급량 — 3차안(2026-08-14)에서 확정한 플랜별 기능 한도를
 * 그대로 크레딧으로 환산한 값이다(한도 × CREDIT_COSTS 합산). 즉 지금 당장은
 * "기능별 캡이 통합 크레딧으로 바뀌었을 뿐 최악 원가 상한은 그대로"다.
 *
 * 원가(1크레딧=10원 기준, ai_video_analysis 제외 — 미게이팅이라 실제 원가가 아님):
 *  - Creator 460크레딧=4,600원 / 9,900원 → 최악 마진 53.5%
 *  - Pro 1,260크레딧=12,600원 / 29,000원 → 최악 마진 56.6%
 *  - Agency 4,260크레딧=42,600원 / 99,000원 → 최악 마진 57.0%
 *  - Enterprise 10,550크레딧=105,500원 / 249,000원 → 최악 마진 57.6%
 *
 * 1만 명 시나리오(가입 1만·월활성 60%·유료전환 4%, 매출 757만원) 최악 마진 ~23.4%,
 * 현실적(무료25%·유료40%) 마진 ~67.2% — ai_video_analysis를 원가 계산에서 뺀 만큼
 * 3차안(최악 3.5%/현실적 60.5%)보다 개선됐다.
 */
export const PLAN_CREDIT_ALLOWANCE: Record<PaidPlan, number> = {
  creator: 460,
  pro: 1260,
  agency: 4260,
  enterprise: 10550,
};

export type ChargeResult =
  | { ok: true; via: "quota" | "credits"; userId: string; remainingCredits: number | null }
  | { ok: false; error: string };

async function deductMyCredits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  amount: number,
  reason: string
): Promise<{ ok: true; paid: boolean } | { ok: false; error: string }> {
  const { data: paid, error } = await supabase.rpc("deduct_my_credits", { p_amount: amount, p_reason: reason });
  if (error) {
    console.error(`[credits] deduct_my_credits 실패(${reason}):`, error.message);
    return { ok: false, error: "크레딧 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true, paid: Boolean(paid) };
}

/**
 * 생성 1회 과금.
 * - 무료 플랜: 기능별 월 한도(use_quota) 우선, 소진 시 관리자 지급 크레딧으로 이어감.
 * - 유료 플랜: 기능별 한도 없이 통합 크레딧(deduct_my_credits)만 소비.
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

  const { data: profile, error: profileErr } = await supabase
    .from("users_profile")
    .select("plan, credits")
    .eq("id", user.id)
    .maybeSingle();
  // 조회 오류를 free 폴백으로 삼키면 유료 사용자가 조용히 무료 게이트를 타게 된다 — 명시적 실패
  if (profileErr) {
    console.error("[credits] 플랜 조회 실패:", profileErr.message);
    return { ok: false, error: "사용자 정보 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  const plan = profile?.plan ?? "free";

  if (plan !== "free") {
    // 유료 플랜 — 기능별 한도 없이 통합 크레딧만 본다(월 지급량은 결제 성공 시 grant_plan_credits로 리셋)
    const result = await deductMyCredits(supabase, opts.creditCost, opts.reason);
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.paid) {
      const balance = profile?.credits ?? 0;
      return {
        ok: false,
        error: `이번 달 크레딧을 다 썼어요(필요 ${opts.creditCost} · 보유 ${balance}). 다음 결제일에 다시 채워지거나, 플랜을 업그레이드하면 더 많이 쓸 수 있어요.`,
      };
    }
    const remaining = Math.max(0, (profile?.credits ?? opts.creditCost) - opts.creditCost);
    return { ok: true, via: "credits", userId: user.id, remainingCredits: remaining };
  }

  // 무료 플랜 — 1단계: 기능별 월 한도
  const limit = FREE_MONTHLY_LIMITS[opts.metric] ?? 0;
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

  // 2단계 — 무료 한도 소진: 관리자 지급 크레딧이 있으면 이어 쓴다
  const result = await deductMyCredits(supabase, opts.creditCost, opts.reason);
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.paid) {
    const balance = profile?.credits ?? 0;
    return {
      ok: false,
      error:
        limit === 0
          ? "이 기능은 유료 플랜 전용이에요. 플랜을 업그레이드하거나 크레딧을 충전하면 쓸 수 있어요."
          : `이번 달 무료 한도(${limit}회)를 다 썼고, 크레딧이 부족해요(필요 ${opts.creditCost} · 보유 ${balance}). 크레딧을 충전받거나 플랜을 업그레이드하면 계속 쓸 수 있어요.`,
    };
  }
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

/**
 * 유료 플랜 월 크레딧 지급 — 첫 결제·업그레이드·정기갱신 성공 직후에만 호출한다
 * (app/api/billing/issue, app/(app)/settings/billing/actions.changePlan,
 * app/api/cron/refresh-tokens processSubscriptions). "지급량까지 채우기"(top-up, 0039):
 * 이월 누적은 없고, 관리자 지급·환불로 지급량을 넘는 잔액은 보존된다.
 *
 * 결제는 이미 성공한 뒤라 지급 실패는 "돈은 받고 크레딧은 못 준" 상태다 — 일시
 * 오류에 대비해 3회 재시도하고, 최종 실패는 운영자가 수동 지급(add_credits)할 수
 * 있게 식별자를 전부 로그로 남긴다.
 */
export async function grantPlanCredits(userId: string, plan: PaidPlan): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[credits] 플랜 크레딧 지급 실패: 관리자 클라이언트 미설정 —", userId, plan);
    return;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await admin.rpc("grant_plan_credits", {
      p_user_id: userId,
      p_amount: PLAN_CREDIT_ALLOWANCE[plan],
      p_reason: `plan_credits:${plan}`,
    });
    if (!error) return;
    console.error(
      `[credits] 플랜 크레딧 지급 실패(시도 ${attempt}/3) — user=${userId} plan=${plan} amount=${PLAN_CREDIT_ALLOWANCE[plan]}:`,
      error.message
    );
    if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
}
