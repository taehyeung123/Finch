import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isBillingConfigured } from "@/lib/toss/billing";

/**
 * 결제 카드 변경 1단계 — 내 정기결제의 customerKey 를 돌려준다.
 *
 * 구독 시작(/api/billing/start)과 달리 **새 구독 초안을 만들지 않는다.** 이미 있는 구독의
 * customerKey 로 빌링 인증창을 다시 열면 토스가 같은 고객에게 새 빌링키를 발급하고,
 * 2단계(/api/billing/card/issue)가 그 키로 기존 행의 카드만 바꾼다. 청구는 없다.
 *
 * 조회는 사용자 세션(RLS: 본인 select)으로 충분하다 — 여기서 admin 권한을 쓸 이유가 없다.
 */
export const runtime = "nodejs";

export async function POST() {
  if (isDemoMode()) {
    return NextResponse.json({ error: "지금은 예시 화면이라 카드를 바꿀 수 없어요." }, { status: 400 });
  }
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "결제 설정이 아직 완료되지 않았습니다." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("id, toss_customer_key, status, next_billing_at")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due", "canceled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[billing:card:start] 구독 조회 실패:", error.message);
    return NextResponse.json({ error: "구독 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  if (!sub) {
    return NextResponse.json(
      { error: "등록된 정기결제가 없어요. 플랜을 구독하면 그때 카드를 등록합니다." },
      { status: 404 },
    );
  }
  /* 해지 예약된 구독은 종료일 전까지만 — 이미 끝난 구독의 카드를 바꿔 봐야 청구될 일이 없다 */
  if (sub.status === "canceled" && (!sub.next_billing_at || new Date(sub.next_billing_at).getTime() <= Date.now())) {
    return NextResponse.json({ error: "이용이 끝난 구독이에요. 새로 구독할 때 카드를 등록해 주세요." }, { status: 409 });
  }

  return NextResponse.json({ customerKey: sub.toss_customer_key });
}
