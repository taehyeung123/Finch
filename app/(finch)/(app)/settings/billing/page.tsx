import type { Metadata } from "next";
import Link from "next/link";
import { CircleOff, CreditCard, Rows3, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { InfoTip } from "@/components/ui/info-tip";
import { NoticeBar } from "@/components/ui/notice-bar";
import { ResultBanner } from "@/components/ui/result-banner";
import { RetryLink } from "@/components/ui/retry-link";
import { StateChip } from "@/components/ui/state-chip";
import { formatDate, formatKRW } from "@/lib/format";
import { PLAN_CARDS } from "@/components/pricing/plan-cards";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";
import { getCurrentPlan, getPaymentOrders, getSubscription, type PlanKey } from "@/lib/data/internal";
import { getCreditSummary } from "@/lib/data/credits";
import { isDemoMode } from "@/lib/supabase/config";
import { SettingsShell } from "../_components/settings-shell";
import { SettingsGroup, SettingsRow } from "../_components/settings-row";
import { SummaryCard, type SummaryStatProps } from "../_components/summary-card";
import { PlanChoiceCard } from "./_components/plan-choice-card";
import { CreditUsageCard } from "./_components/credit-panel";
import { cancelPlanChange, cancelSubscription, changePlan, resumeSubscription } from "./actions";

export const metadata: Metadata = {
  title: "플랜 관리",
  robots: { index: false, follow: false },
};

/*
  플랜 관리 (PRD PART 4.13 + PART 9) — 2026-09-03 재설계(«링크팜처럼 카드 그리드로»).
  ① 결과 배너 → ② 조회 실패 주의 → ③ 요약 카드(현재 플랜·상태·월 요금/다음 결제일/남은 크레딧/이번 달 사용)
  → ④ 플랜 비교 카드 5장(현재 플랜 포함) → ⑤ 크레딧 사용 내역 → ⑥ 관련 항목 → ⑦ 구독 해지(맨 아래, 조용하게).
  조회 4개·실패 판정(fail-closed «free» + 표시는 «확인 못 함»)·PlanAction 분기·ConfirmSubmit 문구·서버 액션은 재설계 전과 같다.
  결제 내역·결제 수단은 「결제수단 관리」(./payment)가 맡는다(링크팜 문법 — 다른 질문은 다른 페이지).
*/

const PLAN_ORDER: PlanKey[] = ["free", "creator", "pro", "agency", "enterprise"];

/** 플랜별 CTA — 로직은 재설계 전 PlanAction 그대로, 표현만 카드 맨 아래 꽉 찬 버튼 */
function PlanAction({
  planKey,
  hasActiveSub,
  currentPlanKey,
  locked,
}: {
  planKey: PlanKey;
  hasActiveSub: boolean;
  currentPlanKey: PlanKey;
  /** 플랜 확인 실패·예시 화면 — 버튼을 잠근다(누르면 막히는 버튼을 살려 두지 않는다) */
  locked: boolean;
}) {
  const slab = (text: string) => (
    <div className="flex h-10 items-center justify-center rounded-card bg-plate text-[14px] font-medium text-fg-sub">{text}</div>
  );
  if (planKey === currentPlanKey) return slab("지금 이용 중");
  if (planKey === "free") return slab("유료 해지 후 자동 전환");
  if (locked) {
    return (
      <Button type="button" className="w-full" size="md" variant="secondary" disabled>
        {hasActiveSub ? (PLAN_PRICES[planKey] > (isPaidPlan(currentPlanKey) ? PLAN_PRICES[currentPlanKey] : 0) ? "업그레이드" : "다운그레이드 예약") : "구독하기"}
      </Button>
    );
  }
  if (hasActiveSub) {
    const currentAmount = isPaidPlan(currentPlanKey) ? PLAN_PRICES[currentPlanKey] : 0;
    const targetAmount = PLAN_PRICES[planKey];
    const targetName = PLAN_NAMES[planKey];
    if (targetAmount > currentAmount) {
      /* 주 CTA 는 현재 플랜 바로 위 단계 하나만 primary — 복수 primary 로 위계가 무너지지 않게 */
      const isNextTier = PLAN_ORDER.indexOf(planKey) === PLAN_ORDER.indexOf(currentPlanKey) + 1;
      return (
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
          triggerClassName="w-full"
        />
      );
    }
    return (
      <form action={changePlan}>
        <input type="hidden" name="plan" value={planKey} />
        <SubmitButton size="md" variant="ghost" className="w-full" pendingLabel="예약 처리 중…">
          다운그레이드 예약
        </SubmitButton>
      </form>
    );
  }
  return (
    <ButtonLink href={`/settings/billing/subscribe?plan=${planKey}`} variant={planKey === "pro" ? "primary" : "secondary"} size="md" className="w-full">
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

  const [planRes, ordersRes, subRes, credits] = await Promise.all([getCurrentPlan(), getPaymentOrders(), getSubscription(), getCreditSummary()]);

  /* ── 조회 실패를 «없음»으로 읽지 않는다 — 돈이 걸린 화면이라 더욱. 권한 계산은 fail-closed(free), **표시**만 «확인 못 함» ── */
  const planFailed = planRes === null;
  const ordersFailed = ordersRes === null;
  const subFailed = subRes === null;
  const failed = [planFailed ? "플랜" : null, subFailed ? "구독" : null, ordersFailed ? "최근 결제" : null].filter((v): v is string => v !== null);
  const currentPlan: PlanKey = planRes ?? "free";
  const orders = ordersRes ?? [];
  const subscription = subRes?.sub ?? null;
  const demo = isDemoMode();

  const currentCard = PLAN_CARDS.find((p) => p.key === currentPlan);
  const currentName = currentCard?.name ?? "Free";
  const lastPaid = orders.find((o) => o.status === "paid");
  const hasActiveSub = subscription != null && subscription.status !== "canceled";
  const pendingPlan = subscription?.pendingPlan;
  const pendingPlanName = isPaidPlan(pendingPlan ?? "") ? PLAN_NAMES[pendingPlan as keyof typeof PLAN_NAMES] : null;
  /* 확인 모달 문구용 — 금액은 항상 서버 상수 PLAN_PRICES 에서 조립한다 */
  const subPlanAmount = subscription && isPaidPlan(subscription.plan) ? PLAN_PRICES[subscription.plan] : null;
  const subEndDate = subscription?.nextBillingAt ? formatDate(subscription.nextBillingAt) : null;
  const locked = planFailed || demo;

  /* ── 요약 카드 ── */
  const chip = planFailed || subFailed ? (
    <StateChip tone="unknown" />
  ) : subscription?.status === "active" ? (
    <StateChip tone="ok">자동갱신 중</StateChip>
  ) : subscription?.status === "past_due" ? (
    <StateChip tone="warn">결제 재시도 중</StateChip>
  ) : subscription?.status === "canceled" ? (
    <StateChip tone="off">해지 예약됨</StateChip>
  ) : isPaidPlan(currentPlan) ? (
    <StateChip tone="off">정기결제 없음</StateChip>
  ) : null;

  const subLine: { text: React.ReactNode; tone: "sub" | "warning" | "accent" } = demo
    ? { text: "지금은 예시 화면이에요 — 실제 플랜과 결제 상태는 표시되지 않아요", tone: "sub" }
    : subFailed
      ? { text: "구독 상태를 확인하지 못했어요 — 새로고침해 주세요", tone: "warning" }
      : subscription?.status === "past_due"
        ? { text: "최근 정기결제에 실패해 자동으로 다시 시도 중이에요. 3회 연속 실패하면 구독이 종료돼요.", tone: "warning" }
        : subscription?.status === "canceled"
          ? { text: "자동갱신이 꺼져 있어요. 종료일까지는 그대로 쓸 수 있어요.", tone: "sub" }
          : pendingPlanName
            ? { text: `다음 결제일부터 ${pendingPlanName} 플랜으로 바뀌어요.`, tone: "accent" }
            : lastPaid
              ? { text: `최근 결제 ${formatDate(lastPaid.approvedAt ?? lastPaid.createdAt)} · ${formatKRW(lastPaid.amount)}`, tone: "sub" }
              : currentPlan === "free"
                ? { text: "무료 플랜이에요. 유료 플랜으로 올리면 매달 크레딧이 지급돼요.", tone: "sub" }
                : { text: "정기결제 없이 이용 중이에요.", tone: "sub" };

  const aside = demo ? (
    <Badge tone="neutral">예시 화면</Badge>
  ) : subscription?.status === "past_due" ? (
    <ButtonLink href="/settings/billing/payment" variant="secondary" size="sm">
      결제수단 확인
    </ButtonLink>
  ) : subscription?.status === "canceled" ? (
    <ConfirmSubmit
      action={resumeSubscription}
      title="해지를 취소할까요?"
      description={`자동갱신을 다시 켭니다. ${subEndDate ? `다음 결제일(${subEndDate})부터` : "다음 결제일부터"} ${
        subPlanAmount != null ? `매월 ${formatKRW(subPlanAmount)}이` : "플랜 요금이"
      } 등록된 카드로 다시 자동 결제됩니다.`}
      confirmLabel="자동갱신 다시 켜기"
      confirmVariant="primary"
      pendingLabel="처리 중…"
      trigger="자동갱신 다시 켜기"
      triggerVariant="secondary"
      triggerSize="sm"
    />
  ) : pendingPlanName && hasActiveSub ? (
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
      triggerVariant="ghost"
      triggerSize="sm"
    />
  ) : undefined;

  const { balance, allowance, spentThisMonth, balanceFailed, entriesFailed } = credits;
  const pct = !balanceFailed && allowance && allowance > 0 ? Math.min(100, Math.round((balance / allowance) * 100)) : undefined;
  const big = (v: React.ReactNode) => <span className="text-[20px] font-bold leading-none">{v}</span>;
  const stats: SummaryStatProps[] = [
    {
      label: "월 요금",
      value: planFailed ? "확인 못 함" : big(isPaidPlan(currentPlan) ? formatKRW(PLAN_PRICES[currentPlan]) : "무료"),
      tone: planFailed ? "warn" : "neutral",
      tnum: true,
    },
    {
      label: subscription?.status === "canceled" ? "이용 종료일" : "다음 결제일",
      value: subFailed ? "확인 못 함" : subscription?.nextBillingAt ? formatDate(subscription.nextBillingAt) : "—",
      note: !subFailed && !subscription?.nextBillingAt ? "자동결제 없음" : undefined,
      tone: subFailed ? "warn" : "neutral",
      tnum: true,
    },
    {
      label: "남은 크레딧",
      value: balanceFailed ? (
        "확인 못 함"
      ) : (
        <>
          {big(balance.toLocaleString("ko-KR"))}
          {allowance !== null ? <span className="ml-1 text-[14px] font-medium text-fg-sub">/ {allowance.toLocaleString("ko-KR")}</span> : null}
        </>
      ),
      tone: balanceFailed ? "warn" : "neutral",
      tnum: true,
      meter: pct,
      tip: (
        <InfoTip label="크레딧 안내">
          {allowance !== null
            ? `매달 결제일에 ${allowance.toLocaleString("ko-KR")} 크레딧까지 다시 채워져요. 남은 크레딧은 다음 달로 넘어가지 않아요.`
            : "무료 플랜은 크레딧 대신 기능별 월 횟수로 제공돼요. 여기 숫자는 따로 지급받은 크레딧이에요."}
        </InfoTip>
      ),
    },
    {
      label: "이번 달 사용",
      value: entriesFailed ? "확인 못 함" : big(spentThisMonth.toLocaleString("ko-KR")),
      tone: entriesFailed ? "warn" : "neutral",
      tnum: true,
    },
  ];

  return (
    <SettingsShell title="플랜 관리" description="현재 플랜·다음 결제일·남은 크레딧을 확인하고 플랜을 바꿀 수 있어요.">
      <ResultBanner error={planError} notice={notice} path="/settings/billing" />

      {failed.length > 0 ? (
        <NoticeBar tone="warning" size="sm" action={<RetryLink />}>
          {failed.join(" · ")} 정보를 불러오지 못했어요 — 아래 내용이 실제와 다를 수 있어요.
        </NoticeBar>
      ) : null}

      <SummaryCard
        leading={
          <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
            <CreditCard className="size-5" />
          </span>
        }
        eyebrow="현재 플랜"
        titleSize={20}
        title={
          planFailed ? (
            "확인 못 함"
          ) : (
            <>
              {currentName}
              {currentCard ? <span className="ml-1.5 text-[14px] font-normal text-fg-sub">{currentCard.ko}</span> : null}
            </>
          )
        }
        chips={chip}
        sub={
          <>
            {subLine.text}
            {subscription?.cardSummary && !demo ? (
              <>
                {" · "}
                <Link href="/settings/billing/payment" className="underline underline-offset-2 hover:text-fg">
                  카드 {subscription.cardSummary}
                </Link>
              </>
            ) : null}
          </>
        }
        subTone={subLine.tone}
        aside={aside}
        stats={stats}
        cols={4}
      />

      {/* ── 플랜 비교 — 마케팅 카드를 쓰지 않는다(2026-08-15 사장님 지적). 숫자(PLAN_CARDS)는 /pricing 과 계속 공유한다 ── */}
      <section aria-labelledby="plans-h">
        <div className="mb-3 px-1">
          <h2 id="plans-h" className="text-[17px] font-semibold">
            플랜 비교
          </h2>
          <p className="mt-0.5 text-[14px] text-fg-sub">
            {demo
              ? "예시 화면이라 플랜 변경 버튼이 잠겨 있어요."
              : planFailed
                ? "플랜을 확인하지 못해 변경 버튼을 잠시 잠갔어요 — 새로고침해 주세요."
                : "올리면 지금 바로 결제되고, 내리면 다음 결제일부터 적용돼요."}
          </p>
        </div>
        {/* 위 3장 / 아래 2장 — 5열 균등은 카드가 214px 로 눌린다(plan-cards.tsx 와 같은 판단) */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {PLAN_CARDS.map((plan, i) => (
            <div key={plan.key} className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}>
              <PlanChoiceCard
                plan={plan}
                current={plan.key === currentPlan && !planFailed}
                action={<PlanAction planKey={plan.key} hasActiveSub={hasActiveSub} currentPlanKey={currentPlan} locked={locked} />}
              />
            </div>
          ))}
        </div>
      </section>

      <CreditUsageCard summary={credits} />

      <SettingsGroup id="billing-links" label="관련 항목">
        <SettingsRow
          href="/settings/billing/payment"
          icon={Wallet}
          label="결제수단 관리"
          chip={
            subFailed ? <StateChip tone="unknown" /> : subscription?.cardSummary ? <StateChip tone="ok">등록됨</StateChip> : <StateChip tone="off">미등록</StateChip>
          }
          hint={
            subscription?.status === "past_due"
              ? "결제 실패 — 카드를 확인해 주세요"
              : (subscription?.cardSummary ?? "등록된 카드 없음")
          }
          hintTone={subscription?.status === "past_due" ? "warning" : "sub"}
        />
        <SettingsRow href="/pricing" icon={Rows3} label="전체 요금제 비교" hint="기능별 비교표와 크레딧 소모량" />
      </SettingsGroup>

      {hasActiveSub && !demo ? (
        <SettingsGroup id="sub" label="구독 관리">
          <SettingsRow
            icon={CircleOff}
            label="구독 해지"
            hint="자동갱신이 꺼져요. 종료일까지는 지금처럼 이용할 수 있어요"
            trailing={
              <ConfirmSubmit
                action={cancelSubscription}
                title="구독을 해지할까요?"
                description={`자동갱신이 꺼집니다. ${
                  subEndDate ? `이용 종료일(${subEndDate})까지는` : "이미 결제한 기간이 끝날 때까지는"
                } 지금처럼 이용할 수 있고, 이후 추가 결제 없이 무료 플랜으로 전환됩니다.`}
                confirmLabel="해지하기"
                confirmVariant="danger"
                pendingLabel="해지 처리 중…"
                trigger="해지"
                triggerVariant="ghost"
                triggerSize="sm"
                triggerClassName="text-negative-strong hover:text-negative-strong"
              />
            }
          />
        </SettingsGroup>
      ) : null}
    </SettingsShell>
  );
}
