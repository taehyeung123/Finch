import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";
import { isBillingConfigured } from "@/lib/toss/billing";

/**
 * 구독 시작 1단계 — customerKey 발급 + pending 구독 초안 생성.
 * customerKey는 추측 불가능한 랜덤 UUID (이메일/순번 금지 — 뷰스코프 검증 패턴).
 * 자동갱신 동의는 명시적으로 true여야 한다 (사전 체크 금지, 전자상거래법).
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "데모 모드에서는 구독할 수 없습니다." }, { status: 400 });
  }
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "결제 설정이 아직 완료되지 않았습니다." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { plan?: string; autoRenewalAgreed?: boolean } | null;
  if (!body || body.autoRenewalAgreed !== true) {
    return NextResponse.json({ error: "자동갱신(정기결제) 동의가 필요합니다." }, { status: 400 });
  }
  if (!body.plan || !isPaidPlan(body.plan)) {
    return NextResponse.json({ error: "존재하지 않는 요금제입니다." }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 503 });
  }

  /* 중복 구독 방지 (플랜 변경은 해지 후 재구독 — v1 정책).
     ⚠️ canceled 도 막는다. 해지는 «자동갱신만 끄기»라 이용 종료일까지는 **여전히 이용 중**이다.
     예전엔 active·past_due 만 봐서, 종료일이 남은 상태로 다시 구독하면 그 자리에서 전액이 또 청구됐고
     (겹치는 기간에 이중 청구), 옛 구독의 종료일이 오면 만료 루프가 새 유료 구독을 무료로 강등했다.
     이 경우엔 «해지 취소»로 안내한다 — 새로 결제할 이유가 없다(2026-09-07 감사). */
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, status, next_billing_at")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due", "canceled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stillInPeriod =
    existing?.status === "canceled" &&
    typeof existing.next_billing_at === "string" &&
    new Date(existing.next_billing_at).getTime() > Date.now();
  if (existing && existing.status !== "canceled") {
    return NextResponse.json(
      { error: "이미 이용 중인 구독이 있어요. 요금제 화면에서 해지 후 다시 시도해 주세요." },
      { status: 409 },
    );
  }
  if (stillInPeriod) {
    return NextResponse.json(
      { error: "아직 이용 기간이 남아 있어요. 요금제 화면에서 «해지 취소»를 누르면 그대로 이어서 쓸 수 있어요." },
      { status: 409 },
    );
  }

  const customerKey = randomUUID();
  const { error } = await admin.from("subscriptions").insert({
    user_id: user.id,
    plan: body.plan,
    toss_customer_key: customerKey,
    status: "pending",
  });
  if (error) {
    console.error("[billing:start] 구독 초안 생성 실패:", error.message);
    return NextResponse.json({ error: "구독 시작에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    customerKey,
    plan: body.plan,
    planName: PLAN_NAMES[body.plan],
    amount: PLAN_PRICES[body.plan],
  });
}
