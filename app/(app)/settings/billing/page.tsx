import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsageGauge } from "@/components/ui/charts";
import { cn } from "@/lib/cn";
import { planFeatures, usageStats } from "@/lib/data";
import { SettingsNav } from "../_components/settings-nav";

/*
  요금제·사용량 (PRD PART 4.13 + PART 9 요금제 설계)
  - 현재 플랜·다음 결제일, 이번 달 사용량 게이지, 플랜 비교표
  - 결제 연동(Toss 등)은 개발 마지막 단계에 활성화 — 지금은 목 상태 고지만
*/

const PLANS = [
  { key: "free", name: "Free", current: false },
  { key: "creator", name: "Creator", current: true },
  { key: "pro", name: "Pro", current: false },
  { key: "agency", name: "Agency", current: false },
] as const;

function PlanAction({ plan }: { plan: (typeof PLANS)[number] }) {
  if (plan.current) {
    return (
      <Button size="sm" variant="secondary" disabled>
        사용 중
      </Button>
    );
  }
  if (plan.key === "free") {
    return (
      <Button size="sm" variant="ghost">
        다운그레이드
      </Button>
    );
  }
  return (
    <Button size="sm" variant="primary">
      업그레이드
    </Button>
  );
}

export default function BillingSettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="현재 플랜과 사용량을 확인하고 요금제를 관리하세요."
      />
      <SettingsNav />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 현재 플랜 */}
        <Card>
          <CardHeader title="현재 플랜" description="구독 중인 요금제" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">Creator</span>
              <Badge tone="primary">사용 중</Badge>
            </div>
            <p className="text-[14px] text-fg-sub">
              다음 결제일 <span className="tnum font-semibold text-fg">2026.08.01</span>
            </p>
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
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="pb-3 pr-3 font-medium">기능</th>
                {PLANS.map((plan) => (
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
                  {PLANS.map((plan) => (
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
                {PLANS.map((plan) => (
                  <td
                    key={plan.key}
                    className={cn("px-3 pb-3 pt-4", plan.current && "rounded-b-card bg-primary-weak")}
                  >
                    <PlanAction plan={plan} />
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </CardBody>
      </Card>

      {/* 결제 수단 */}
      <Card>
        <CardHeader
          title="결제 수단"
          action={<Badge tone="neutral">예정</Badge>}
        />
        <CardBody className="space-y-1.5">
          <p className="flex items-center gap-2 text-[14px] text-fg-sub">
            <CreditCard className="size-4 text-fg-faint" aria-hidden />
            등록된 결제 수단이 없습니다
          </p>
          <p className="text-[13px] text-fg-faint">결제 연동은 개발 마지막 단계에 활성화됩니다.</p>
        </CardBody>
      </Card>
    </div>
  );
}
