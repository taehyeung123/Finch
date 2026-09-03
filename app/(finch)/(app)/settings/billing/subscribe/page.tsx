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
    <div className="max-w-xl space-y-6">
      <PageHeader title={`${planName} 플랜 구독`} description="카드를 한 번 등록하면 매월 자동으로 결제됩니다." />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold">핀치 {planName}</span>
              <Badge tone="primary">월 자동결제</Badge>
            </div>
            <p className="mt-1 text-[14px] text-fg-sub">가격은 정식 출시 전 잠정값이에요.</p>
          </div>
          <span className="shrink-0 text-[20px] font-bold tnum">{formatKRW(amount)}<span className="text-[14px] font-normal text-fg-sub">/월</span></span>
        </div>
      </Card>

      {isDemoMode() || !clientKey ? (
        <Card className="p-5">
          <p className="text-[15px] text-fg-sub">
            {isDemoMode()
              ? "지금은 예시 화면이라 구독할 수 없어요."
              : "지금은 정기결제를 시작할 수 없어요. 준비가 끝나는 대로 안내드릴게요."}
          </p>
          <Link
            href="/settings/billing"
            className="mt-3 inline-block text-[15px] font-semibold text-primary underline underline-offset-2"
          >
            요금제로 돌아가기
          </Link>
        </Card>
      ) : (
        <Card className="p-5">
          {/* 테스트 키(test_ck_)로 도는 동안만 «실제 청구 없음»을 말한다 — 라이브 키로 바뀌면 문장이 사라진다 */}
          <SubscribeClient
            plan={plan}
            planName={planName}
            amount={amount}
            clientKey={clientKey}
            testMode={clientKey.startsWith("test_")}
          />
        </Card>
      )}
    </div>
  );
}
