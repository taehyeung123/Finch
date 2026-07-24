import { CreditCard, FileClock } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { UsageGauge } from "@/components/ui/charts";
import { cn } from "@/lib/cn";
import { formatDate, formatKRW } from "@/lib/format";
import { planFeatures } from "@/lib/data";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";
import {
  getCurrentPlan,
  getPaymentOrders,
  getSubscription,
  getUsageStats,
  type PaymentOrderView,
  type PlanKey,
} from "@/lib/data/internal";
import { SettingsNav } from "../_components/settings-nav";
import { cancelPlanChange, cancelSubscription, changePlan, resumeSubscription } from "./actions";

/*
  요금제·사용량 (PRD PART 4.13 + PART 9 요금제 설계)
  - 현재 플랜(users_profile.plan 실조회)·사용량 게이지·플랜 비교표·결제 내역(payment_orders)
  - 결제는 Toss 단건 결제로 동작. 정기결제(자동 갱신)는 자동결제 별도 계약 후 제공 예정
*/

const PLAN_DEFS = [
  { key: "free", name: "Free" },
  { key: "creator", name: "Creator" },
  { key: "pro", name: "Pro" },
  { key: "agency", name: "Agency" },
  { key: "enterprise", name: "Enterprise" },
] as const;

const ORDER_STATUS: Record<PaymentOrderView["status"], { label: string; tone: "positive" | "negative" | "neutral" }> = {
  paid: { label: "결제 완료", tone: "positive" },
  failed: { label: "실패", tone: "negative" },
  canceled: { label: "취소됨", tone: "neutral" },
};

function PlanAction({
  planKey,
  current,
  hasActiveSub,
  currentPlanKey,
}: {
  planKey: (typeof PLAN_DEFS)[number]["key"];
  current: boolean;
  hasActiveSub: boolean;
  currentPlanKey: PlanKey;
}) {
  if (current) {
    return (
      <Button size="sm" variant="secondary" disabled>
        사용 중
      </Button>
    );
  }
  if (planKey === "free") {
    return (
      <Button size="sm" variant="ghost" disabled title="유료 구독을 해지하면 기간 종료 후 자동으로 무료 플랜이 됩니다">
        다운그레이드
      </Button>
    );
  }
  if (hasActiveSub) {
    // 현재 유료 구독 중 다른 유료 플랜으로 전환 — 금액은 서버(changePlan)가 PLAN_PRICES에서만 가져온다.
    const currentAmount = isPaidPlan(currentPlanKey) ? PLAN_PRICES[currentPlanKey] : 0;
    const isUpgrade = PLAN_PRICES[planKey] > currentAmount;
    return (
      <form action={changePlan}>
        <input type="hidden" name="plan" value={planKey} />
        <Button
          size="sm"
          variant={isUpgrade ? "primary" : "secondary"}
          type="submit"
          title={
            isUpgrade
              ? "지금 새 플랜 요금이 즉시 청구되고 바로 전환됩니다"
              : "지금은 청구되지 않고, 다음 결제일부터 새 플랜 요금으로 전환됩니다"
          }
        >
          {isUpgrade ? "업그레이드" : "다운그레이드 예약"}
        </Button>
      </form>
    );
  }
  return (
    <a href={`/settings/billing/subscribe?plan=${planKey}`} className={buttonClasses("primary", "sm")}>
      구독하기
    </a>
  );
}

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const planError = typeof sp.planError === "string" ? sp.planError : null;
  const planChanged = sp.planChanged === "1";
  const planScheduled = sp.planScheduled === "1";

  const [usageStats, currentPlan, orders, subscription] = await Promise.all([
    getUsageStats(),
    getCurrentPlan(),
    getPaymentOrders(),
    getSubscription(),
  ]);
  const plans = PLAN_DEFS.map((p) => ({ ...p, current: p.key === currentPlan }));
  const currentName = PLAN_DEFS.find((p) => p.key === currentPlan)?.name ?? "Free";
  const lastPaid = orders.find((o) => o.status === "paid");
  const hasActiveSub = subscription != null && subscription.status !== "canceled";
  const pendingPlan = subscription?.pendingPlan;
  const pendingPlanName = isPaidPlan(pendingPlan ?? "") ? PLAN_NAMES[pendingPlan as keyof typeof PLAN_NAMES] : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="현재 플랜과 사용량을 확인하고 요금제를 관리하세요."
      />
      <SettingsNav />

      {planError ? (
        <div className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[14px] text-negative" role="alert">
          {planError}
        </div>
      ) : null}
      {planChanged ? (
        <div className="rounded-card border border-positive/40 bg-positive-weak p-4 text-[14px] text-positive" role="status">
          플랜이 변경되었어요.
        </div>
      ) : null}
      {planScheduled ? (
        <div className="rounded-card border border-positive/40 bg-positive-weak p-4 text-[14px] text-positive" role="status">
          다음 결제일부터 적용되도록 플랜 변경을 예약했어요.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 현재 플랜 + 구독 상태 — users_profile.plan·subscriptions 실조회 */}
        <Card>
          <CardHeader title="현재 플랜" description="구독 중인 요금제" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{currentName}</span>
              <Badge tone="primary">사용 중</Badge>
              {subscription?.status === "active" ? <Badge tone="positive">자동갱신 중</Badge> : null}
              {subscription?.status === "past_due" ? <Badge tone="warning">결제 재시도 중</Badge> : null}
              {subscription?.status === "canceled" ? <Badge tone="neutral">해지 예약됨</Badge> : null}
            </div>

            {subscription ? (
              <div className="space-y-1.5 text-[14px] text-fg-sub">
                {subscription.nextBillingAt ? (
                  <p>
                    {subscription.status === "canceled" ? "이용 종료일" : "다음 결제일"}{" "}
                    <span className="tnum font-semibold text-fg">{subscription.nextBillingAt.slice(0, 10)}</span>
                  </p>
                ) : null}
                {subscription.cardSummary ? (
                  <p className="text-[13px] text-fg-faint">결제 카드 {subscription.cardSummary}</p>
                ) : null}
                {subscription.status === "past_due" ? (
                  <p className="text-[13px] font-medium text-warning">
                    최근 정기결제가 실패했어요. 카드 상태를 확인해 주세요 — 자동으로 재시도합니다.
                  </p>
                ) : null}
                {subscription.status === "canceled" ? (
                  <p className="text-[13px] text-fg-faint">
                    자동갱신이 꺼져 있어요. 종료일까지는 그대로 이용할 수 있습니다.
                  </p>
                ) : null}
                {pendingPlanName ? (
                  <p className="text-[13px] font-medium text-primary">
                    다음 결제일부터 {pendingPlanName} 플랜으로 변경 예정
                  </p>
                ) : null}
              </div>
            ) : lastPaid ? (
              <p className="text-[14px] text-fg-sub">
                최근 결제{" "}
                <span className="tnum font-semibold text-fg">
                  {formatDate(lastPaid.approvedAt ?? lastPaid.createdAt)}
                </span>
                <span className="tnum ml-2 text-fg-faint">{formatKRW(lastPaid.amount)}</span>
              </p>
            ) : (
              <p className="text-[14px] text-fg-faint">
                {currentPlan === "free" ? "무료 플랜을 이용 중입니다." : "결제 내역이 없습니다."}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {subscription && subscription.status !== "canceled" ? (
                <form action={cancelSubscription}>
                  <Button size="sm" variant="danger" type="submit">
                    구독 해지
                  </Button>
                </form>
              ) : null}
              {subscription?.status === "canceled" ? (
                <form action={resumeSubscription}>
                  <Button size="sm" variant="secondary" type="submit">
                    해지 취소 (자동갱신 다시 켜기)
                  </Button>
                </form>
              ) : null}
              {pendingPlanName ? (
                <form action={cancelPlanChange}>
                  <Button size="sm" variant="secondary" type="submit">
                    예약 취소
                  </Button>
                </form>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* 이번 달 사용량 (PART 4.13) */}
        <Card>
          <CardHeader title="이번 달 사용량" description="플랜 한도 대비 사용 현황" />
          <CardBody className="space-y-4">
            {usageStats.map((stat) => (
              <UsageGauge
                key={stat.label}
                label={stat.label}
                used={stat.used}
                limit={stat.limit}
                unit={stat.unit}
              />
            ))}
          </CardBody>
        </Card>
      </div>

      {/* 플랜 비교표 (PART 9) */}
      <Card>
        <CardHeader title="플랜 비교" description="워크플로에 맞는 플랜을 선택하세요" />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="pb-3 pr-3 font-medium">기능</th>
                {plans.map((plan) => (
                  <th
                    key={plan.key}
                    className={cn(
                      "px-3 pb-3 pt-1 font-semibold text-fg",
                      plan.current && "rounded-t-card bg-primary-weak",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {plan.name}
                      {plan.current ? <Badge tone="primary">사용 중</Badge> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planFeatures.map((feature) => (
                <tr key={feature.label} className="border-b border-line">
                  <td className="py-3 pr-3 text-fg-sub">{feature.label}</td>
                  {plans.map((plan) => (
                    <td key={plan.key} className={cn("px-3 py-3", plan.current && "bg-primary-weak")}>
                      {feature[plan.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4" />
                {plans.map((plan) => (
                  <td
                    key={plan.key}
                    className={cn("px-3 pb-3 pt-4", plan.current && "rounded-b-card bg-primary-weak")}
                  >
                    <PlanAction
                      planKey={plan.key}
                      current={plan.current}
                      hasActiveSub={hasActiveSub}
                      currentPlanKey={currentPlan}
                    />
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </CardBody>
      </Card>

      {/* 결제 내역 — payment_orders 실조회 (ready 상태 제외) */}
      {orders.length > 0 ? (
        <Card>
          <CardHeader title="결제 내역" description={`최근 ${orders.length}건`} />
          <CardBody>
            <div className="divide-y divide-line">
              {orders.map((o) => {
                const status = ORDER_STATUS[o.status];
                return (
                  <div key={o.id} className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-card border border-line bg-overlay text-fg-sub">
                      <FileClock className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{o.orderName}</p>
                      <p className="tnum mt-0.5 text-[13px] text-fg-sub">
                        {formatDate(o.approvedAt ?? o.createdAt)}
                      </p>
                    </div>
                    <span className="tnum text-[15px] font-semibold">{formatKRW(o.amount)}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* 결제 수단 — 정기결제(빌링) 카드 */}
      <Card>
        <CardHeader
          title="결제 수단"
          action={hasActiveSub ? <Badge tone="positive">자동결제 등록됨</Badge> : <Badge tone="neutral">미등록</Badge>}
        />
        <CardBody className="space-y-1.5">
          <p className="flex items-center gap-2 text-[14px] text-fg-sub">
            <CreditCard className="size-4 text-fg-faint" aria-hidden />
            {subscription?.cardSummary
              ? `등록된 카드 ${subscription.cardSummary}`
              : "구독 시작 시 카드를 한 번 등록하면 매월 자동으로 결제됩니다"}
          </p>
          <p className="text-[13px] text-fg-faint">
            매월 결제 예정일 3일 전에 알림으로 미리 알려드리며, 언제든 이 화면에서 해지할 수 있어요.
            {" "}(현재 테스트 모드 — 실제 청구 없음)
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
