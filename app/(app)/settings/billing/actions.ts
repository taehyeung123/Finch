"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { chargeBilling } from "@/lib/toss/billing";
import { notifyUser } from "@/lib/notify";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";

const BILLING_PATH = "/settings/billing";

function planRedirect(query: Record<string, string>): never {
  const params = new URLSearchParams(query);
  redirect(`${BILLING_PATH}?${params.toString()}`);
}

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

/**
 * 유료 플랜 간 전환 — 업그레이드/다운그레이드.
 *
 * 금액은 절대 클라이언트에서 받지 않고 항상 서버가 PLAN_PRICES에서만 조회한다(폼에는 plan 키만 넘어온다).
 * - 업그레이드(목표 금액 > 현재 금액): 새 플랜 전체 금액을 즉시 청구(chargeBilling). 청구 성공 시에만
 *   plan을 바꾸고 next_billing_at을 오늘로부터 1개월 뒤로 갱신한다 — 청구 실패는 플랜을 바꾸지 않는다.
 *   orderId는 매 시도마다 유일하게 만들고 Idempotency-Key로 넘겨 이중 청구를 막는다.
 * - 다운그레이드(목표 금액 < 현재 금액): 즉시 청구하지 않고 pending_plan만 예약해 두고,
 *   다음 정기결제 크론(processSubscriptions)이 그 시점에 pending_plan 금액으로 청구하며 적용한다.
 */
export async function changePlan(formData: FormData): Promise<void> {
  const targetRaw = String(formData.get("plan") ?? "");
  if (!isPaidPlan(targetRaw)) {
    planRedirect({ planError: "지원하지 않는 요금제입니다." });
  }
  const target = targetRaw;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    planRedirect({ planError: "로그인이 필요합니다." });
  }

  const admin = createAdminClient();
  if (!admin) {
    planRedirect({ planError: "결제 설정이 완료되지 않았어요." });
  }

  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("id, plan, status, toss_customer_key, billing_key_cipher, next_billing_at, pending_plan")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr || !sub) {
    planRedirect({ planError: "진행 중인 구독이 없어요. 요금제에서 새로 구독해 주세요." });
  }

  const currentPlanRaw = String(sub.plan ?? "");
  if (!isPaidPlan(currentPlanRaw)) {
    planRedirect({ planError: "현재 플랜 정보를 확인할 수 없어요." });
  }
  const currentPlan = currentPlanRaw;

  if (target === currentPlan) {
    // 이미 같은 플랜 — 아무것도 하지 않는다.
    planRedirect({});
  }

  const targetAmount = PLAN_PRICES[target];
  const currentAmount = PLAN_PRICES[currentPlan];
  const targetName = PLAN_NAMES[target];

  if (targetAmount > currentAmount) {
    // ── 업그레이드: 즉시 새 플랜 전체 금액 청구 ──
    const billingKey = decryptToken(sub.billing_key_cipher);
    if (!billingKey) {
      planRedirect({ planError: "결제 수단을 확인할 수 없어요. 카드를 다시 등록해 주세요." });
    }

    const orderId = `chg-${String(sub.id).replaceAll("-", "").slice(0, 12)}-${Date.now()}`;
    const orderName = `핀치 ${targetName} 플랜 (업그레이드)`;
    const charged = await chargeBilling(billingKey, {
      customerKey: sub.toss_customer_key,
      amount: targetAmount,
      orderId,
      orderName,
    });

    if (!charged.ok) {
      console.error("[billing] 플랜 업그레이드 청구 실패:", sub.id, charged.code, charged.message);
      planRedirect({ planError: `결제에 실패했어요: ${charged.message}` });
    }

    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    const nowIso = new Date().toISOString();

    const { error: upErr } = await admin
      .from("subscriptions")
      .update({
        plan: target,
        pending_plan: null,
        status: "active",
        billing_retry_count: 0,
        next_billing_at: next.toISOString(),
      })
      .eq("id", sub.id);
    if (upErr) console.error("[billing] 플랜 업그레이드 반영 실패:", sub.id, upErr.message);

    const { error: orderErr } = await admin.from("payment_orders").insert({
      user_id: user.id,
      order_id: orderId,
      plan: target,
      amount: targetAmount,
      order_name: orderName,
      status: "paid",
      payment_key: charged.data.paymentKey,
      method: charged.data.method ?? "billing",
      approved_at: charged.data.approvedAt ?? nowIso,
      raw: charged.data as unknown as Record<string, unknown>,
    });
    if (orderErr) console.error("[billing] 업그레이드 주문 기록 실패:", sub.id, orderErr.message);

    await admin.from("users_profile").update({ plan: target }).eq("id", user.id);

    await notifyUser(admin, {
      userId: user.id,
      type: "billing",
      title: `${targetName} 플랜으로 업그레이드되었어요`,
      body: `${targetName} 플랜으로 즉시 전환되었고 ${targetAmount.toLocaleString("ko-KR")}원이 결제되었어요. 다음 결제일은 ${next.toISOString().slice(0, 10)}입니다.`,
    });

    revalidatePath(BILLING_PATH);
    planRedirect({ planChanged: "1" });
  } else {
    // ── 다운그레이드: 즉시 청구하지 않고 다음 결제일에 적용되도록 예약 ──
    const { error: upErr } = await admin.from("subscriptions").update({ pending_plan: target }).eq("id", sub.id);
    if (upErr) {
      console.error("[billing] 다운그레이드 예약 실패:", sub.id, upErr.message);
      planRedirect({ planError: "플랜 변경 예약에 실패했어요." });
    }

    await notifyUser(admin, {
      userId: user.id,
      type: "billing",
      title: `${targetName} 플랜으로 변경이 예약되었어요`,
      body: `다음 결제일${sub.next_billing_at ? `(${String(sub.next_billing_at).slice(0, 10)})` : ""}부터 ${targetName} 플랜 요금이 청구되며 자동으로 전환됩니다. 예약은 언제든 취소할 수 있어요.`,
    });

    revalidatePath(BILLING_PATH);
    planRedirect({ planScheduled: "1" });
  }
}

/** 다운그레이드 예약 취소 — pending_plan을 지워 현재 플랜을 그대로 유지한다. */
export async function cancelPlanChange(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  if (!admin) return;

  const { error } = await admin
    .from("subscriptions")
    .update({ pending_plan: null })
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"]);
  if (error) console.error("[billing] 플랜 변경 예약 취소 실패:", error.message);
  revalidatePath(BILLING_PATH);
}
