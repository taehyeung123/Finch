import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPayment } from "@/lib/toss/server";
import { formatKRW } from "@/lib/format";

/*
  결제 성공 콜백 — successUrl?paymentKey&orderId&amount.
  승인은 서버에서만 수행하고 금액은 DB(payment_orders)의 예정 금액으로 검증한다
  (리다이렉트 amount를 신뢰하지 않음 — docs/REAL_API_SPEC.md 4절).
*/

type Outcome = { ok: true; amount: number; planName: string } | { ok: false; message: string };

async function processConfirmation(sp: Record<string, string | string[] | undefined>): Promise<Outcome> {
  const paymentKey = typeof sp.paymentKey === "string" ? sp.paymentKey : null;
  const orderId = typeof sp.orderId === "string" ? sp.orderId : null;
  const amountParam = typeof sp.amount === "string" ? Number(sp.amount) : NaN;
  if (!paymentKey || !orderId) return { ok: false, message: "결제 정보가 올바르지 않습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  // 본인 주문 조회(RLS) — 예정 금액/플랜의 신뢰 원천
  const { data: order } = await supabase
    .from("payment_orders")
    .select("id, plan, amount, status")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, message: "주문을 찾을 수 없습니다." };

  if (order.status === "paid") {
    // 이미 승인된 주문 — 멱등 처리
    return { ok: true, amount: order.amount, planName: order.plan };
  }
  // 리다이렉트로 넘어온 금액이 주문 금액과 다르면 변조 — 중단
  if (Number.isFinite(amountParam) && amountParam !== order.amount) {
    return { ok: false, message: "결제 금액이 일치하지 않습니다." };
  }

  const admin = createAdminClient();
  const result = await confirmPayment({
    paymentKey,
    orderId,
    amount: order.amount, // 서버 신뢰값으로 승인
    idempotencyKey: orderId,
  });

  if (!result.ok) {
    if (admin) {
      await admin.from("payment_orders").update({ status: "failed", raw: { code: result.code, message: result.message } }).eq("id", order.id);
    }
    return { ok: false, message: `결제 승인에 실패했어요. (${result.message})` };
  }

  // 승인 성공 — 주문/플랜 갱신은 RLS 우회가 필요하므로 admin 사용
  if (admin) {
    await admin
      .from("payment_orders")
      .update({
        status: "paid",
        payment_key: result.payment.paymentKey,
        method: result.payment.method ?? null,
        approved_at: result.payment.approvedAt ?? new Date().toISOString(),
        raw: result.payment.raw,
      })
      .eq("id", order.id);
    await admin.from("users_profile").update({ plan: order.plan }).eq("id", user.id);
  } else {
    console.warn("[billing] SUPABASE_SERVICE_ROLE_KEY 미설정 — 승인은 됐으나 주문 상태 기록 실패");
  }

  return { ok: true, amount: order.amount, planName: order.plan };
}

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const outcome = await processConfirmation(sp);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="결제 결과" description="요금제 결제 처리 결과입니다." />
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        {outcome.ok ? (
          <>
            <CheckCircle2 className="size-12 text-positive" aria-hidden />
            <div>
              <p className="text-lg font-bold">결제가 완료되었어요</p>
              <p className="mt-1 text-[14px] text-fg-sub">
                {outcome.planName.toUpperCase()} 플랜 · {formatKRW(outcome.amount)}
              </p>
            </div>
          </>
        ) : (
          <>
            <XCircle className="size-12 text-negative" aria-hidden />
            <div>
              <p className="text-lg font-bold">결제를 완료하지 못했어요</p>
              <p className="mt-1 text-[14px] text-fg-sub">{outcome.message}</p>
            </div>
          </>
        )}
        <Link href="/settings/billing" className={buttonClasses("primary", "md")}>
          요금제로 돌아가기
        </Link>
      </Card>
    </div>
  );
}
