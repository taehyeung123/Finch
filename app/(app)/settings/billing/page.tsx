import { CreditCard, FileClock } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { UsageGauge } from "@/components/ui/charts";
import { cn } from "@/lib/cn";
import { formatDate, formatKRW } from "@/lib/format";
import { planFeatures } from "@/lib/data";
import { getCurrentPlan, getPaymentOrders, getUsageStats, type PaymentOrderView } from "@/lib/data/internal";
import { SettingsNav } from "../_components/settings-nav";

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

function PlanAction({ planKey, current }: { planKey: (typeof PLAN_DEFS)[number]["key"]; current: boolean }) {
  if (current) {
    return (
      <Button size="sm" variant="secondary" disabled>
        사용 중
      </Button>
    );
  }
  if (planKey === "free") {
    return (
      <Button size="sm" variant="ghost">
        다운그레이드
      </Button>
    );
  }
  return (
    <a href={`/settings/billing/checkout?plan=${planKey}`} className={buttonClasses("primary", "sm")}>
      업그레이드
    </a>
  );
}

export default async function BillingSettingsPage() {
  const [usageStats, currentPlan, orders] = await Promise.all([
    getUsageStats(),
    getCurrentPlan(),
    getPaymentOrders(),
  ]);
  const plans = PLAN_DEFS.map((p) => ({ ...p, current: p.key === currentPlan }));
  const currentName = PLAN_DEFS.find((p) => p.key === currentPlan)?.name ?? "Free";
  const lastPaid = orders.find((o) => o.status === "paid");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="현재 플랜과 사용량을 확인하고 요금제를 관리하세요."
      />
      <SettingsNav />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 현재 플랜 — users_profile.plan 실조회 (결제 승인 시 갱신됨) */}
        <Card>
          <CardHeader title="현재 플랜" description="구독 중인 요금제" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{currentName}</span>
              <Badge tone="primary">사용 중</Badge>
            </div>
            {lastPaid ? (
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
                    <PlanAction planKey={plan.key} current={plan.current} />
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

      {/* 결제 수단 — 정기결제(자동 갱신)는 자동결제 별도 계약 후 제공 */}
      <Card>
        <CardHeader
          title="결제 수단"
          action={<Badge tone="neutral">단건 결제</Badge>}
        />
        <CardBody className="space-y-1.5">
          <p className="flex items-center gap-2 text-[14px] text-fg-sub">
            <CreditCard className="size-4 text-fg-faint" aria-hidden />
            결제는 업그레이드 시 Toss 결제창에서 진행됩니다
          </p>
          <p className="text-[13px] text-fg-faint">
            자동 갱신(정기결제)은 결제사 계약 완료 후 제공될 예정입니다. 현재는 단건 결제로 플랜이 적용됩니다.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
