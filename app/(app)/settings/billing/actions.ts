"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";

/**
 * 결제 주문 생성 — 결제위젯 requestPayment 직전에 호출.
 * 예정 금액을 DB(payment_orders)에 미리 저장해 두고, 승인 시 서버가 이 값으로 검증한다
 * (리다이렉트/웹훅의 금액을 신뢰하지 않는다 — docs/REAL_API_SPEC.md 4절).
 */
export type CreateCheckoutResult =
  | { ok: true; orderId: string; orderName: string; amount: number }
  | { ok: false; error: string };

export async function createCheckout(plan: string): Promise<CreateCheckoutResult> {
  if (!isPaidPlan(plan)) return { ok: false, error: "지원하지 않는 요금제입니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const amount = PLAN_PRICES[plan];
  const orderName = `핀치 ${PLAN_NAMES[plan]} 플랜`;
  // orderId: 영숫자-_ 6~64자. finch_<plan>_<uuid(32)> = 최대 ~42자
  const orderId = `finch_${plan}_${randomUUID().replace(/-/g, "")}`;

  const { error } = await supabase.from("payment_orders").insert({
    user_id: user.id,
    order_id: orderId,
    plan,
    amount,
    order_name: orderName,
    status: "ready",
  });
  if (error) {
    console.error("[billing] 주문 생성 실패:", error.message);
    return { ok: false, error: "주문 생성 중 오류가 발생했어요. 다시 시도해 주세요." };
  }

  return { ok: true, orderId, orderName, amount };
}
