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

  // 활성/유예 구독이 있으면 중복 구독 방지 (플랜 변경은 해지 후 재구독 — v1 정책)
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "이미 이용 중인 구독이 있어요. 요금제 화면에서 해지 후 다시 시도해 주세요." },
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
