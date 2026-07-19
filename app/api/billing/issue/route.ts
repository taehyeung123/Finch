import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { chargeBilling, issueBillingKey } from "@/lib/toss/billing";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";

/**
 * 구독 시작 2단계 — 빌링 인증(authKey) → billingKey 발급 → 첫 결제 → 구독 활성화.
 * billingKey는 발급 후 재조회 불가 → 즉시 AES-256-GCM 암호화 저장 (평문 금지).
 * pending→active 전이를 원자적으로 선점한 요청만 플랜을 적용한다 (이중 활성화 방지 — 뷰스코프 패턴).
 */
export const runtime = "nodejs";

function cycleOrderId(subId: string, at: Date): string {
  // 주기당 결정적 orderId — Toss Idempotency-Key와 함께 재시도 이중청구를 막는다
  const ymd = at.toISOString().slice(0, 10).replaceAll("-", "");
  return `sub-${subId.replaceAll("-", "").slice(0, 12)}-${ymd}-r0`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { authKey?: string; customerKey?: string } | null;
  if (!body?.authKey || !body?.customerKey) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isTokenEncryptionConfigured()) {
    console.error("[billing:issue] TOKEN_ENCRYPTION_KEY 미설정 — 빌링키 저장 불가");
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 503 });
  }

  // customerKey가 이 사용자의 pending 구독인지 검증 (타인 키 탈취 방지)
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, plan, status")
    .eq("toss_customer_key", body.customerKey)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return NextResponse.json({ error: "구독 정보를 찾을 수 없습니다." }, { status: 404 });
  }
  if (sub.status === "active") {
    return NextResponse.json({ status: "already_active" });
  }
  if (sub.status !== "pending" || !isPaidPlan(sub.plan)) {
    return NextResponse.json({ error: "활성화할 수 없는 구독 상태입니다." }, { status: 409 });
  }

  const amount = PLAN_PRICES[sub.plan];
  const planName = PLAN_NAMES[sub.plan];

  // 1) 빌링키 발급 → 즉시 암호화
  const issued = await issueBillingKey({ authKey: body.authKey, customerKey: body.customerKey });
  if (!issued.ok) {
    return NextResponse.json({ error: `카드 등록에 실패했어요: ${issued.message}` }, { status: 402 });
  }
  const cipher = encryptToken(issued.data.billingKey);
  if (!cipher) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 503 });
  }
  const card = issued.data.card;
  const cardSummary = card ? `${card.company ?? card.cardCompany ?? "카드"} ${card.number ?? ""}`.trim() : null;

  // 2) 첫 결제
  const orderId = cycleOrderId(sub.id, new Date());
  const charged = await chargeBilling(issued.data.billingKey, {
    customerKey: body.customerKey,
    amount,
    orderId,
    orderName: `핀치 ${planName} 플랜 (정기결제)`,
  });
  if (!charged.ok) {
    return NextResponse.json({ error: `첫 결제에 실패했어요: ${charged.message}` }, { status: 402 });
  }

  // 3) pending → active 원자 선점 — 선점한 요청만 플랜 적용 (중복 방지)
  const nextBillingAt = new Date();
  nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);
  const { data: claimed } = await admin
    .from("subscriptions")
    .update({
      billing_key_cipher: cipher,
      card_summary: cardSummary,
      status: "active",
      billing_retry_count: 0,
      next_billing_at: nextBillingAt.toISOString(),
    })
    .eq("id", sub.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ status: "already_active" });
  }

  // 4) 주문 기록 + 플랜 적용 (기록 실패는 치명 아님 — 로그만)
  const { error: orderErr } = await admin.from("payment_orders").insert({
    user_id: user.id,
    order_id: orderId,
    plan: sub.plan,
    amount,
    order_name: `핀치 ${planName} 플랜 (정기결제)`,
    status: "paid",
    payment_key: charged.data.paymentKey,
    method: charged.data.method ?? "billing",
    approved_at: charged.data.approvedAt ?? new Date().toISOString(),
    raw: charged.data as unknown as Record<string, unknown>,
  });
  if (orderErr) console.error("[billing:issue] 주문 기록 실패:", orderErr.message);

  const { error: planErr } = await admin.from("users_profile").update({ plan: sub.plan }).eq("id", user.id);
  if (planErr) console.error("[billing:issue] 플랜 적용 실패:", planErr.message);

  return NextResponse.json({
    status: "active",
    plan: sub.plan,
    planName,
    amount,
    nextBillingAt: nextBillingAt.toISOString(),
  });
}
