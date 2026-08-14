import { CreditCard, FileClock, Gauge } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
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
import { BillingBanner } from "./_components/billing-banner";
import { cancelPlanChange, cancelSubscription, changePlan, resumeSubscription } from "./actions";

/*
  요금제·사용량 (PRD PART 4.13 + PART 9 요금제 설계)
  - 현재 플랜(users_profile.plan 실조회)·사용량 게이지·플랜 비교표·결제 내역(payment_orders)
  - 결제는 Toss 단건 결제로 동작. 정기결제(자동 갱신)는 자동결제 별도 계약 후 제공 예정
  - 2026-08-14 감사 반영: 금전·파괴적 액션은 ConfirmSubmit(금액·결과 명시) + 제출 중 pending 표시,
    비교표에 월 요금 행 추가, 안내문은 hover title이 아닌 항상 보이는 텍스트로.
*/

const PLAN_DEFS = [
  { key: "free", name: "Free" },
  { key: "creator", name: "Creator" },
  { key: "pro", name: "Pro" },
  { key: "agency", name: "Agency" },
  { key: "enterprise", name: "Enterprise" },
] as const;

const PLAN_ORDER = PLAN_DEFS.map((p) => p.key);

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
    // 상태 표시는 버튼이 아닌 뱃지로 — disabled opacity로 대비를 떨어뜨리지 않는다
    return <Badge tone="primary">현재 플랜</Badge>;
  }
  if (planKey === "free") {
    // 액션이 아닌 안내 — disabled 버튼의 hover 전용 title 대신 항상 보이는 텍스트
    return <p className="text-[12px] leading-snug text-fg-sub">유료 해지 시 기간 종료 후 자동 전환</p>;
  }
  if (hasActiveSub) {
    // 현재 유료 구독 중 다른 유료 플랜으로 전환 — 금액은 서버(changePlan)가 PLAN_PRICES에서만 가져온다.
    const currentAmount = isPaidPlan(currentPlanKey) ? PLAN_PRICES[currentPlanKey] : 0;
    const targetAmount = PLAN_PRICES[planKey];
    const targetName = PLAN_NAMES[planKey];
    const isUpgrade = targetAmount > currentAmount;
    if (isUpgrade) {
      // 주 CTA는 현재 플랜 바로 위 단계 하나만 primary — 복수 primary로 위계가 무너지지 않게
      const isNextTier = PLAN_ORDER.indexOf(planKey) === PLAN_ORDER.indexOf(currentPlanKey) + 1;
      return (
        <div className="space-y-1.5">
          <ConfirmSubmit
            action={changePlan}
            hiddenFields={{ plan: planKey }}
            title={`${targetName} 플랜으로 업그레이드할까요?`}
            description={`지금 ${formatKRW(targetAmount)}이 등록된 카드로 즉시 결제되고 ${targetName} 플랜으로 바로 전환됩니다. 다음 결제일은 오늘부터 1개월 뒤로 다시 계산됩니다.`}
            confirmLabel={`${formatKRW(targetAmount)} 결제하고 업그레이드`}
            confirmVariant="primary"
            pendingLabel="결제 진행 중…"
            trigger="업그레이드"
            triggerVariant={isNextTier ? "primary" : "secondary"}
            triggerSize="md"
          />
          <p className="text-[12px] leading-snug text-fg-sub">확인 후 즉시 결제되고 바로 전환됩니다</p>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <form action={changePlan}>
          <input type="hidden" name="plan" value={planKey} />
          <SubmitButton size="md" variant="secondary" pendingLabel="예약 처리 중…">
            다운그레이드 예약
          </SubmitButton>
        </form>
        <p className="text-[12px] leading-snug text-fg-sub">지금은 청구되지 않고 다음 결제일부터 적용됩니다</p>
      </div>
    );
  }
  return (
    <ButtonLink
      href={`/settings/billing/subscribe?plan=${planKey}`}
      variant={planKey === "pro" ? "primary" : "secondary"}
      size="md"
    >
      구독하기
    </ButtonLink>
  );
}

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const planError = typeof sp.planError === "string" ? sp.planError : null;
  const notice =
    sp.planChanged === "1"
      ? "플랜이 변경되었어요."
      : sp.planScheduled === "1"
        ? "다음 결제일부터 적용되도록 플랜 변경을 예약했어요."
        : sp.subCanceled === "1"
          ? "구독이 해지되었어요. 이용 종료일까지는 지금처럼 이용할 수 있습니다."
          : sp.subResumed === "1"
            ? "해지를 취소하고 자동갱신을 다시 켰어요."
            : sp.scheduleCanceled === "1"
              ? "플랜 변경 예약을 취소했어요."
              : null;

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
  // 확인 모달 문구용 — 금액은 항상 서버 상수 PLAN_PRICES에서 조립한다
  const subPlanAmount = subscription && isPaidPlan(subscription.plan) ? PLAN_PRICES[subscription.plan] : null;
  const subEndDate = subscription?.nextBillingAt ? subscription.nextBillingAt.slice(0, 10) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="현재 플랜과 사용량을 확인하고 요금제를 관리하세요."
      />
      <SettingsNav />

      <BillingBanner error={planError} notice={notice} />

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
                  <p className="text-[13px] text-fg-sub">결제 카드 {subscription.cardSummary}</p>
                ) : null}
                {subscription.status === "past_due" ? (
                  <p className="text-[13px] font-medium text-warning">
                    최근 정기결제가 실패했어요. 카드 상태를 확인해 주세요 — 자동으로 재시도합니다.
                  </p>
                ) : null}
                {subscription.status === "canceled" ? (
                  <p className="text-[13px] text-fg-sub">
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
                <span className="tnum ml-2 text-fg-sub">{formatKRW(lastPaid.amount)}</span>
              </p>
            ) : (
              <p className="text-[14px] text-fg-sub">
                {currentPlan === "free" ? "무료 플랜을 이용 중입니다." : "결제 내역이 없습니다."}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {subscription && subscription.status !== "canceled" ? (
                <ConfirmSubmit
                  action={cancelSubscription}
                  title="구독을 해지할까요?"
                  description={`자동갱신이 꺼집니다. ${
                    subEndDate ? `이용 종료일(${subEndDate})까지는` : "이미 결제한 기간이 끝날 때까지는"
                  } 지금처럼 이용할 수 있고, 이후 추가 결제 없이 무료 플랜으로 전환됩니다.`}
                  confirmLabel="해지하기"
                  confirmVariant="danger"
                  pendingLabel="해지 처리 중…"
                  trigger="구독 해지"
                  triggerVariant="danger"
                  triggerSize="md"
                />
              ) : null}
              {subscription?.status === "canceled" ? (
                <ConfirmSubmit
                  action={resumeSubscription}
                  title="해지를 취소할까요?"
                  description={`자동갱신을 다시 켭니다. ${
                    subEndDate ? `다음 결제일(${subEndDate})부터` : "다음 결제일부터"
                  } ${
                    subPlanAmount != null ? `매월 ${formatKRW(subPlanAmount)}이` : "플랜 요금이"
                  } 등록된 카드로 다시 자동 결제됩니다.`}
                  confirmLabel="자동갱신 다시 켜기"
                  confirmVariant="primary"
                  pendingLabel="처리 중…"
                  trigger="해지 취소 (자동갱신 다시 켜기)"
                  triggerVariant="secondary"
                  triggerSize="md"
                />
              ) : null}
              {pendingPlanName ? (
                <ConfirmSubmit
                  action={cancelPlanChange}
                  title="플랜 변경 예약을 취소할까요?"
                  description={`${pendingPlanName} 플랜으로의 변경 예약을 취소합니다. 지금의 ${currentName} 플랜이 그대로 유지되고, 다음 결제일에는 ${
                    subPlanAmount != null ? `${currentName} 요금 ${formatKRW(subPlanAmount)}` : "현재 플랜 요금"
                  }이 청구됩니다.`}
                  confirmLabel="예약 취소"
                  confirmVariant="primary"
                  pendingLabel="취소 처리 중…"
                  trigger="예약 취소"
                  triggerVariant="secondary"
                  triggerSize="md"
                />
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* 이번 달 사용량 (PART 4.13) */}
        <Card>
          <CardHeader title="이번 달 사용량" description="플랜 한도 대비 사용 현황" />
          <CardBody className="space-y-4">
            {usageStats.length === 0 ? (
              <EmptyState
                icon={Gauge}
                title="아직 사용량 데이터가 없어요"
                description="기능을 사용하면 이번 달 사용량이 여기에 표시됩니다."
              />
            ) : (
              usageStats.map((stat) => (
                <UsageGauge
                  key={stat.label}
                  label={stat.label}
                  used={stat.used}
                  limit={stat.limit}
                  unit={stat.unit}
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {/* 플랜 비교표 (PART 9) */}
      <Card>
        <CardHeader title="플랜 비교" description="워크플로에 맞는 플랜을 선택하세요" />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <caption className="sr-only">플랜별 기능 비교</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-sub">
                <th scope="col" className="pb-3 pr-3 font-medium">
                  기능
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.key}
                    scope="col"
                    className={cn(
                      "px-3 pb-3 pt-1 font-semibold text-fg",
                      plan.current && "rounded-t-card bg-primary-weak",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {plan.name}
                      {plan.current ? <Badge tone="primary">사용 중</Badge> : null}
                      {!hasActiveSub && !plan.current && plan.key === "pro" ? (
                        <Badge tone="primary">추천</Badge>
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 월 요금 — 청구 금액을 결제 전에 화면에서 바로 확인할 수 있게 */}
              <tr className="border-b border-line">
                <th scope="row" className="py-3 pr-3 text-left font-normal text-fg-sub">
                  월 요금
                </th>
                {plans.map((plan) => (
                  <td key={plan.key} className={cn("px-3 py-3", plan.current && "bg-primary-weak")}>
                    {plan.key === "free" ? (
                      "무료"
                    ) : (
                      <span className="tnum font-semibold">
                        {formatKRW(PLAN_PRICES[plan.key])}
                        <span className="font-normal text-fg-sub">/월</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
              {planFeatures.map((feature) => (
                <tr key={feature.label} className="border-b border-line">
                  <th scope="row" className="py-3 pr-3 text-left font-normal text-fg-sub">
                    {feature.label}
                  </th>
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
                    className={cn("px-3 pb-3 pt-4 align-top", plan.current && "rounded-b-card bg-primary-weak")}
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

      {/* 결제 내역 — payment_orders 실조회 (ready 상태 제외). 이력이 없어도 카드는 항상 보인다 */}
      <Card>
        <CardHeader
          title="결제 내역"
          description={orders.length > 0 ? `최근 ${orders.length}건` : "결제가 완료되면 여기에 표시됩니다"}
        />
        <CardBody>
          {orders.length === 0 ? (
            <EmptyState
              icon={FileClock}
              title="결제 내역이 없습니다"
              description="플랜을 구독하면 결제 내역이 여기에 쌓입니다."
            />
          ) : (
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
          )}
        </CardBody>
      </Card>

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
          <p className="text-[13px] text-fg-sub">
            매월 결제 예정일 3일 전에 알림으로 미리 알려드리며, 언제든 이 화면에서 해지할 수 있어요.
            {" "}(현재 테스트 모드 — 실제 청구 없음)
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
