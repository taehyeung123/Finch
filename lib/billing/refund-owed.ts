import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";
import { proratedRemaining } from "./prorate";

/*
  «회사가 일할 환불을 해 주기로 약속한 순간»을 운영자에게 알린다 — 2026-09-12 약관 정식본 점검.

  약관은 두 경우에 회사가 남은 이용기간 요금을 일할 계산해 **먼저** 돌려준다고 약속한다:
   · 제3조⑤·부칙 제2조 — 바뀐 약관에 동의하지 않고 탈퇴(onboarding/consent 의 withdrawFromConsent)
   · 제24조① — 상위 요금제로 변경(settings/billing 의 changePlan)
  그런데 자동 환불(결제대행사 부분 취소)은 아직 없다 — 토스 배관은 페이앱으로 바뀔 예정이라 고치지 않는다(2026-09-07 결정).
  그래서 사람이 결제대행사 관리 화면에서 부분 취소하도록, 필요한 값(주문번호·금액)을 console.error 로 올린다(Sentry 알림).
  이메일은 로그에 넣지 않는다 — 주문번호로 결제대행사에서 찾는다. 결제 기록(payment_orders)은 탈퇴해도 남는다(0044).

  ⚠️ 이 함수는 절대 던지지 않는다 — 알림이 실패했다고 탈퇴·요금제 변경을 막으면 안 된다(알림 실패는 로그로 남는다).
  자동 환불이 붙으면(docs/LEGAL_REVIEW_2026-09.md 8절 4번) 이 알림을 그 호출로 바꾼다.
*/

export type RefundOwedReason = "consent_withdraw" | "upgrade";

const REASON_LABEL: Record<RefundOwedReason, string> = {
  consent_withdraw: "약관 변경 거부 탈퇴(약관 제3조⑤)",
  upgrade: "상위 요금제 변경(약관 제24조①)",
};

export interface RefundOwed {
  plan: string;
  orderId: string | null;
  refund: number;
  remainingDays: number;
  cycleDays: number;
}

/**
 * 남은 이용기간 환불액을 계산해 알린다. 알릴 것이 없으면(유료 이용 중이 아님·남은 날 0) null.
 *
 * @param known 호출하는 쪽이 이미 읽은 구독(요금제 변경) — 없으면 여기서 찾는다(탈퇴)
 */
export async function reportProratedRefundOwed(
  admin: SupabaseClient,
  userId: string,
  reason: RefundOwedReason,
  known?: { subscriptionId: string; plan: string; nextBillingAt: string | null },
): Promise<RefundOwed | null> {
  try {
    let sub = known ?? null;
    if (!sub) {
      /* 해지(canceled)해도 다음 결제일까지는 이미 결제한 기간이다(약관 제25조②) — 함께 본다 */
      const { data, error } = await admin
        .from("subscriptions")
        .select("id, plan, next_billing_at")
        .eq("user_id", userId)
        .in("status", ["active", "past_due", "canceled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error(`[refund-owed] ${REASON_LABEL[reason]} — 구독 조회 실패, 환불 대상인지 수동 확인 필요 (user=${userId}):`, error.message);
        return null;
      }
      if (!data) return null;
      const row = data as { id: string; plan: string; next_billing_at: string | null };
      sub = { subscriptionId: row.id, plan: row.plan, nextBillingAt: row.next_billing_at };
    }

    if (!isPaidPlan(sub.plan) || !sub.nextBillingAt) return null;
    const periodEnd = new Date(sub.nextBillingAt);
    if (Number.isNaN(periodEnd.getTime()) || periodEnd.getTime() <= Date.now()) return null;

    /* 그 요금제의 마지막 결제 — 부분 취소할 주문. 금액도 여기서(할인·잠정가가 바뀌어도 실제로 받은 돈 기준) */
    const { data: order, error: orderErr } = await admin
      .from("payment_orders")
      .select("order_id, amount")
      .eq("user_id", userId)
      .eq("plan", sub.plan)
      .eq("status", "paid")
      .order("approved_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (orderErr) console.error(`[refund-owed] 결제 기록 조회 실패 (user=${userId}):`, orderErr.message);
    const paid = order as { order_id: string; amount: number } | null;

    const amount = paid?.amount ?? PLAN_PRICES[sub.plan];
    const r = proratedRemaining(amount, periodEnd);
    if (r.refund <= 0) return null;

    const owed: RefundOwed = { plan: sub.plan, orderId: paid?.order_id ?? null, ...r };
    console.error(
      `[refund-owed] ${REASON_LABEL[reason]} — 남은 ${r.remainingDays}/${r.cycleDays}일분 ${r.refund.toLocaleString("ko-KR")}원 일할 환불 필요. ` +
        `결제대행사에서 주문 ${owed.orderId ?? "(주문번호 없음 — 구독 " + sub.subscriptionId + ")"} 을 부분 취소하세요 (user=${userId}, 절차: docs/LEGAL_REVIEW_2026-09.md 13절 7번)`,
    );
    return owed;
  } catch (e) {
    console.error(`[refund-owed] ${REASON_LABEL[reason]} — 환불 계산 실패, 수동 확인 필요 (user=${userId}):`, e);
    return null;
  }
}
