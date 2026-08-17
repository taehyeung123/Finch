import { CreditCard, FileClock } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatKRW } from "@/lib/format";
import Link from "next/link";
import { PLAN_CARDS, type PlanCardData } from "@/components/pricing/plan-cards";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";
import {
  getCurrentPlan,
  getPaymentOrders,
  getSubscription,
  type PaymentOrderView,
  type PlanKey,
} from "@/lib/data/internal";
import { SettingsNav } from "../_components/settings-nav";
import { BillingBanner } from "./_components/billing-banner";
import { CreditPanel } from "./_components/credit-panel";
import { getCreditSummary } from "@/lib/data/credits";
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

/** 현재 플랜은 목록에 아예 안 나온다(위/아래로만 가른다) — 그래서 "사용 중" 분기가 없다 */
function PlanAction({
  planKey,
  hasActiveSub,
  currentPlanKey,
}: {
  planKey: (typeof PLAN_DEFS)[number]["key"];
  hasActiveSub: boolean;
  currentPlanKey: PlanKey;
}) {
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

/**
 * 플랜 한 줄 — 관리 화면 전용 표현. 마케팅 카드(components/pricing/plan-cards)와
 * **데이터는 같고 렌더링만 다르다**. 여기 필요한 건 설득이 아니라 비교 판단이라
 * 영업 문구·프로모 배지를 걷고 이름·가격·크레딧·차이점 두 개만 남긴다.
 */
function PlanRow({ plan, action }: { plan: PlanCardData; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[17px] font-bold">{plan.name}</span>
          <span className="text-[14px] text-fg-sub">{plan.ko}</span>
          <span className="tnum text-[15px] font-semibold">
            {plan.price === 0 ? "무료" : `${plan.price.toLocaleString("ko-KR")}원 / 월`}
          </span>
          {plan.credits !== null ? (
            <span className="tnum text-[14px] text-fg-sub">
              · 월 {plan.credits.toLocaleString("ko-KR")} 크레딧
            </span>
          ) : (
            <span className="text-[14px] text-fg-sub">· 크레딧 없이 월 횟수</span>
          )}
        </p>
        {/* 차이를 만드는 항목 둘만 — 전체 목록은 /pricing 이 진다 */}
        <p className="mt-1 text-[14px] leading-[1.5] text-fg-sub">{plan.perks.slice(0, 2).join(" · ")}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
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

  const [currentPlan, orders, subscription, credits] = await Promise.all([
    getCurrentPlan(),
    getPaymentOrders(),
    getSubscription(),
    getCreditSummary(),
  ]);
  const currentName = PLAN_DEFS.find((p) => p.key === currentPlan)?.name ?? "Free";
  const lastPaid = orders.find((o) => o.status === "paid");
  const hasActiveSub = subscription != null && subscription.status !== "canceled";
  const pendingPlan = subscription?.pendingPlan;
  const pendingPlanName = isPaidPlan(pendingPlan ?? "") ? PLAN_NAMES[pendingPlan as keyof typeof PLAN_NAMES] : null;
  // 확인 모달 문구용 — 금액은 항상 서버 상수 PLAN_PRICES에서 조립한다
  const subPlanAmount = subscription && isPaidPlan(subscription.plan) ? PLAN_PRICES[subscription.plan] : null;
  const subEndDate = subscription?.nextBillingAt ? subscription.nextBillingAt.slice(0, 10) : null;

  /* 현재 플랜 기준으로 위/아래를 가른다. 관리 화면에서 기본으로 보여야 할 건
     "올릴 수 있는 것"이고, 내리는 건 찾을 수 있되 눈에 먼저 띌 필요가 없다. */
  const currentIndex = PLAN_ORDER.indexOf(currentPlan);
  const upgrades = PLAN_CARDS.filter((p) => PLAN_ORDER.indexOf(p.key) > currentIndex);
  const downgrades = PLAN_CARDS.filter((p) => PLAN_ORDER.indexOf(p.key) < currentIndex);

  return (
    <div className="space-y-6">
      <PageHeader
        title="설정"
        description="현재 플랜과 결제 정보를 확인하고 요금제를 관리하세요."
      />
      <SettingsNav />

      <BillingBanner error={planError} notice={notice} />

      {/* 현재 플랜 — 카드 한 장을 통째로 쓰던 자리를 한 줄 상태 바로 압축했다(2026-08-15).
          "결제 내역이 없습니다" 한 문장을 위해 화면 첫 스크롤을 다 잡아먹고 있었고,
          정작 알아야 할 플랜·다음 결제일·해지 버튼은 아래 플랜 카드에 밀려 있었다. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-body px-5 py-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">현재 플랜</span>
            <span className="text-[17px] font-bold leading-none">{currentName}</span>
            {subscription?.status === "active" ? <Badge tone="positive">자동갱신 중</Badge> : null}
            {subscription?.status === "past_due" ? <Badge tone="warning">결제 재시도 중</Badge> : null}
            {subscription?.status === "canceled" ? <Badge tone="neutral">해지 예약됨</Badge> : null}
          </div>

          {subscription ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-fg-sub">
              {subscription.nextBillingAt ? (
                <span>
                  {subscription.status === "canceled" ? "이용 종료일" : "다음 결제일"}{" "}
                  <span className="tnum font-semibold text-fg">{subscription.nextBillingAt.slice(0, 10)}</span>
                </span>
              ) : null}
              {subscription.cardSummary ? <span>카드 {subscription.cardSummary}</span> : null}
              {subscription.status === "past_due" ? (
                <span className="font-medium text-warning">
                  최근 정기결제가 실패했어요 — 카드 상태를 확인해 주세요(자동 재시도 중)
                </span>
              ) : null}
              {subscription.status === "canceled" ? (
                <span>자동갱신이 꺼져 있어요 — 종료일까지는 그대로 이용할 수 있습니다</span>
              ) : null}
              {pendingPlanName ? (
                <span className="font-medium text-primary">다음 결제일부터 {pendingPlanName} 플랜으로 변경 예정</span>
              ) : null}
            </div>
          ) : lastPaid ? (
            <p className="text-[14px] text-fg-sub">
              최근 결제{" "}
              <span className="tnum font-semibold text-fg">{formatDate(lastPaid.approvedAt ?? lastPaid.createdAt)}</span>
              <span className="tnum ml-2 text-fg-sub">{formatKRW(lastPaid.amount)}</span>
            </p>
          ) : (
            <p className="text-[14px] text-fg-sub">
              {currentPlan === "free" ? "무료 플랜을 이용 중입니다." : "결제 내역이 없습니다."}
            </p>
          )}
        </div>

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
      </div>

      {/* 크레딧 — 백엔드(0016·0037·0039)는 처음부터 있었는데 화면이 없어서
          "깎이는 건 보이는데 얼마 남았는지는 모르는" 상태였다.
          플랜 목록보다 위다: 이 화면에 들어온 사람의 첫 질문은 "얼마 남았지"지
          "뭘 살까"가 아니다. */}
      <CreditPanel summary={credits} />

      {/* 플랜 변경 — **마케팅 카드를 쓰지 않는다**(2026-08-15 사장님 지적).
          숫자(PLAN_CARDS)는 /pricing 과 계속 공유한다. 그 공유를 깨는 순간
          랜딩이 "카드뉴스 무제한"을 광고하던 사고가 재발한다.
          하지만 **화면은 다른 일을 한다**: /pricing 은 처음 온 사람을 설득하고,
          여긴 이미 결제 중인 사람이 올릴지 내릴지 고른다. 그래서 5장 카드를 걷어내고
          "지금보다 위" 목록만 남겼다 — Creator 쓰는 사람에게 "신용카드 없이 바로
          써봅니다"(Free 영업 문구)와 "오픈 베타 3개월 무료"(신규 유치용)를 보여주고
          있었다. */}
      <div>
        <h2 className="text-[20px] font-bold">플랜 변경</h2>
        <p className="mt-1 text-[15px] text-fg-sub">
          {upgrades.length > 0
            ? `지금 ${currentName}보다 위 단계입니다`
            : "최상위 플랜을 이용 중입니다"}
        </p>

        {upgrades.length > 0 ? (
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-body">
            {upgrades.map((plan) => (
              <PlanRow
                key={plan.key}
                plan={plan}
                action={
                  <PlanAction planKey={plan.key} hasActiveSub={hasActiveSub} currentPlanKey={currentPlan} />
                }
              />
            ))}
          </div>
        ) : null}

        {downgrades.length > 0 ? (
          <details className="group mt-3">
            <summary className="cursor-pointer list-none rounded-card px-1 py-2 text-[14px] font-medium text-fg-sub hover:text-fg">
              낮은 플랜으로 내리기 ({downgrades.length}개) ▾
            </summary>
            <div className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-body">
              {downgrades.map((plan) => (
                <PlanRow
                  key={plan.key}
                  plan={plan}
                  action={
                    <PlanAction planKey={plan.key} hasActiveSub={hasActiveSub} currentPlanKey={currentPlan} />
                  }
                />
              ))}
            </div>
          </details>
        ) : null}

        <p className="mt-3 text-[14px]">
          <Link href="/pricing" className="font-medium text-primary-ink hover:underline">
            전체 요금제·기능 비교 보기 →
          </Link>
        </p>
      </div>

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
                      <p className="tnum mt-0.5 text-[14px] text-fg-sub">
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
          <p className="flex items-center gap-2 text-[15px] text-fg-sub">
            <CreditCard className="size-4 text-fg-faint" aria-hidden />
            {subscription?.cardSummary
              ? `등록된 카드 ${subscription.cardSummary}`
              : "구독 시작 시 카드를 한 번 등록하면 매월 자동으로 결제됩니다"}
          </p>
          <p className="text-[14px] text-fg-sub">
            매월 결제 예정일 3일 전에 알림으로 미리 알려드리며, 언제든 이 화면에서 해지할 수 있어요.
            {" "}(현재 테스트 모드 — 실제 청구 없음)
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
