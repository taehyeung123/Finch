import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/supabase/config";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";
import { getBillingClientKey } from "@/lib/toss/billing";
import { formatKRW } from "@/lib/format";
import { SubscribeClient } from "./_components/subscribe-client";

/*
  구독(정기결제) 시작 — 카드 1회 등록 후 매월 자동 결제.
  빌링은 API 개별 연동 키(test_ck_/test_sk_)를 쓴다 — 결제위젯 키와 별개 (docs/REAL_API_SPEC.md 4절).
*/
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const plan = typeof sp.plan === "string" ? sp.plan : "";
  if (!isPaidPlan(plan)) notFound();

  const clientKey = getBillingClientKey();
  const amount = PLAN_PRICES[plan];
  const planName = PLAN_NAMES[plan];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={`${planName} 플랜 구독`} description="카드를 한 번 등록하면 매월 자동으로 결제됩니다." />

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">핀치 {planName}</span>
              <Badge tone="primary">월 자동결제</Badge>
            </div>
            <p className="mt-1 text-[13px] text-fg-faint">가격은 정식 출시 전 잠정값입니다. (테스트 결제)</p>
          </div>
          <span className="text-xl font-bold tnum">{formatKRW(amount)}<span className="text-[13px] font-normal text-fg-faint">/월</span></span>
        </div>
      </Card>

      {isDemoMode() || !clientKey ? (
        <Card className="p-5">
          <p className="text-[14px] text-fg-sub">
            {isDemoMode()
              ? "데모 모드에서는 구독할 수 없어요."
              : "정기결제 설정이 아직 완료되지 않았습니다. (NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY 미설정)"}
          </p>
          <Link
            href="/settings/billing"
            className="mt-3 inline-block text-[14px] font-semibold text-primary underline underline-offset-2"
          >
            요금제로 돌아가기
          </Link>
        </Card>
      ) : (
        <Card className="p-5">
          <SubscribeClient plan={plan} planName={planName} amount={amount} clientKey={clientKey} />
        </Card>
      )}
    </div>
  );
}
