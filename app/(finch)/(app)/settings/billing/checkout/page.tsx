import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { PLAN_NAMES, PLAN_PRICES, getTossClientKey, isPaidPlan } from "@/lib/toss/config";
import { formatKRW } from "@/lib/format";
import { TossCheckout } from "./_components/toss-checkout";

/*
  결제 페이지 — 요금제 업그레이드 시 Toss 결제위젯으로 결제.
  실 스펙: docs/REAL_API_SPEC.md 4절. 금액은 서버(PLAN_PRICES)가 결정하고 승인 시 검증한다.
*/

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const plan = typeof sp.plan === "string" ? sp.plan : "";
  if (!isPaidPlan(plan)) notFound();

  const clientKey = getTossClientKey();
  const amount = PLAN_PRICES[plan];
  const planName = PLAN_NAMES[plan];

  let customerKey: string | null = null;
  if (!isDemoMode()) {
    const user = await getAuthUser();
    customerKey = user?.id ?? null;
  }

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title={`${planName} 플랜 결제`} description="결제 수단을 선택하고 결제를 완료하세요." />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold">핀치 {planName}</span>
              <Badge tone="primary">월 구독</Badge>
            </div>
            <p className="mt-1 text-[14px] text-fg-sub">
              가격은 정식 출시 전 잠정값입니다. (테스트 결제)
            </p>
          </div>
          <span className="shrink-0 text-[20px] font-bold tnum">{formatKRW(amount)}</span>
        </div>
      </Card>

      {isDemoMode() || !clientKey ? (
        <Card className="p-5">
          <p className="text-[15px] text-fg-sub">
            {isDemoMode()
              ? "데모 모드에서는 결제할 수 없어요."
              : "결제 연동이 아직 설정되지 않았습니다. (NEXT_PUBLIC_TOSS_CLIENT_KEY 미설정)"}
          </p>
          {!isDemoMode() ? (
            <p className="mt-1 text-[14px] text-fg-sub">
              테스트 클라이언트 키를 환경변수에 추가하면 결제 위젯이 활성화됩니다.
            </p>
          ) : null}
          <Link
            href="/settings/billing"
            className="mt-3 inline-block text-[15px] font-semibold text-primary underline underline-offset-2"
          >
            요금제로 돌아가기
          </Link>
        </Card>
      ) : (
        <Card className="p-5">
          <TossCheckout plan={plan} clientKey={clientKey} customerKey={customerKey} amount={amount} />
        </Card>
      )}
    </div>
  );
}
