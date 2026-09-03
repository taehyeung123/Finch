import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPayment } from "@/lib/toss/server";
import { PLAN_NAMES, isPaidPlan } from "@/lib/toss/config";
import { formatKRW } from "@/lib/format";
import { SettingsShell } from "../../_components/settings-shell";

export const metadata: Metadata = {
  title: "결제 결과",
  robots: { index: false, follow: false },
};

/*
  결제 성공 콜백 — successUrl?paymentKey&orderId&amount.
  승인은 서버에서만 수행하고 금액은 DB(payment_orders)의 예정 금액으로 검증한다
  (리다이렉트 amount를 신뢰하지 않음 — docs/REAL_API_SPEC.md 4절).
  2026-09-03: 1회성 결제(checkout) 경로는 정기결제(subscribe)로 대체돼 링크가 없지만 콜백 URL 로는 살아 있어
  결과 페이지 틀만 다른 결과 화면(SettingsShell·p-4)과 맞췄다.
*/

type Outcome = { ok: true; amount: number; planName: string } | { ok: false; message: string };

/** DB의 plan 키("creator")를 표시명("Creator")으로 — 다른 화면의 PLAN_NAMES 표기와 통일 */
function displayPlanName(plan: unknown): string {
  const key = String(plan ?? "");
  return isPaidPlan(key) ? PLAN_NAMES[key] : key;
}

async function processConfirmation(sp: Record<string, string | string[] | undefined>): Promise<Outcome> {
  const paymentKey = typeof sp.paymentKey === "string" ? sp.paymentKey : null;
  const orderId = typeof sp.orderId === "string" ? sp.orderId : null;
  const amountParam = typeof sp.amount === "string" ? Number(sp.amount) : NaN;
  if (!paymentKey || !orderId) return { ok: false, message: "결제 정보가 올바르지 않습니다." };

  const supabase = await createClient();
  const user = await getAuthUser();
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
    return { ok: true, amount: order.amount, planName: displayPlanName(order.plan) };
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

  return { ok: true, amount: order.amount, planName: displayPlanName(order.plan) };
}

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const outcome = await processConfirmation(sp);

  return (
    <SettingsShell title="결제 결과">
      <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-4 text-center">
        {outcome.ok ? (
          <>
            <CheckCircle2 className="size-12 text-positive" aria-hidden />
            <div>
              <p className="text-[17px] font-bold">결제가 완료되었어요</p>
              <p className="mt-1 text-[15px] text-fg-sub">
                {outcome.planName} 플랜 · <span className="tnum">{formatKRW(outcome.amount)}</span>
              </p>
            </div>
          </>
        ) : (
          <>
            <XCircle className="size-12 text-negative" aria-hidden />
            <div>
              <p className="text-[17px] font-bold">결제를 완료하지 못했어요</p>
              <p className="mt-1 text-[15px] text-fg-sub">{outcome.message}</p>
            </div>
          </>
        )}
        <ButtonLink href="/settings/billing" variant="primary" size="md">
          플랜 관리로 돌아가기
        </ButtonLink>
      </Card>
    </SettingsShell>
  );
}
