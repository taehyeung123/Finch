"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * 구독 해지 — 자동갱신을 끈다. 이미 결제한 기간(next_billing_at까지)은 계속 이용 가능하고,
 * 기간 종료 시 크론이 무료 플랜으로 전환한다. 쓰기는 admin 전용(RLS에 update 정책 없음).
 */
export async function cancelSubscription(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin
    .from("subscriptions")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"]);
  if (error) console.error("[billing] 구독 해지 실패:", error.message);
  revalidatePath("/settings/billing");
}

/** 해지 취소(재개) — 기간 종료 전이면 자동갱신을 다시 켠다 */
export async function resumeSubscription(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin
    .from("subscriptions")
    .update({ status: "active", canceled_at: null })
    .eq("user_id", user.id)
    .eq("status", "canceled")
    .gt("next_billing_at", new Date().toISOString());
  if (error) console.error("[billing] 구독 재개 실패:", error.message);
  revalidatePath("/settings/billing");
}
