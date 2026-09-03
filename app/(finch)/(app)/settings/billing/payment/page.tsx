import type { Metadata } from "next";
import { CreditCard, ExternalLink, FileClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { LoadFailed } from "@/components/ui/load-failed";
import { NoticeBar } from "@/components/ui/notice-bar";
import { ResultBanner } from "@/components/ui/result-banner";
import { RetryLink } from "@/components/ui/retry-link";
import { StateChip } from "@/components/ui/state-chip";
import { formatDate, formatKRW } from "@/lib/format";
import { getPaymentOrders, getSubscription, type PaymentOrderView } from "@/lib/data/internal";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan } from "@/lib/toss/config";
import { getBillingClientKey } from "@/lib/toss/billing";
import { isDemoMode } from "@/lib/supabase/config";
import { SettingsShell } from "../../_components/settings-shell";
import { SettingsGroup, SettingsRow } from "../../_components/settings-row";
import { SummaryCard, type SummaryStatProps } from "../../_components/summary-card";
import { ChangeCardClient } from "./_components/change-card-client";

export const metadata: Metadata = {
  title: "결제수단 관리",
  robots: { index: false, follow: false },
};

/*
  결제수단 관리 — 2026-09-03 플랜 관리에서 갈라 나옴 → 같은 날 재설계(요약 카드 + 결제 내역 행).
  - 등록된 카드(subscriptions.card_summary — 카드사 + 마스킹 번호, 카드번호 원문은 어디에도 없다)
  - 결제 내역(payment_orders, ready 제외 최신 20건)
  ⚠️ 조회 실패를 «없음»으로 그리지 않는다 — 돈이 오간 화면에서 「내역이 없습니다」는 가장 나쁜 거짓말이다.
  로더·isInFuture·canChangeCard·ChangeCardClient 흐름·영수증 규칙은 재설계 전과 같다.
*/

const ORDER_CHIP: Record<PaymentOrderView["status"], { tone: "ok" | "bad" | "off"; label: string }> = {
  paid: { tone: "ok", label: "결제 완료" },
  failed: { tone: "bad", label: "실패" },
  canceled: { tone: "off", label: "취소됨" },
};

/** 종료일이 아직 안 지났는가 — 렌더 본문에서 Date.now 를 직접 부르지 않는다(react-hooks/purity) */
function isInFuture(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

export default async function PaymentMethodPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const error = typeof sp.cardError === "string" ? sp.cardError : null;
  const notice = sp.cardChanged === "1" ? "결제 카드를 변경했어요. 다음 결제부터 새 카드로 청구됩니다." : null;

  const [subRes, ordersRes] = await Promise.all([getSubscription(), getPaymentOrders()]);
  const subFailed = subRes === null;
  const ordersFailed = ordersRes === null;
  const subscription = subRes?.sub ?? null;
  const orders = ordersRes ?? [];
  const demo = isDemoMode();
  const hasActiveSub = subscription != null && subscription.status !== "canceled";
  const planName = subscription && isPaidPlan(subscription.plan) ? PLAN_NAMES[subscription.plan] : null;
  /* 카드 변경은 **살아 있는 구독**에만 — 종료일이 지난 해지 구독은 바꿔 봐야 청구될 일이 없다 */
  const clientKey = getBillingClientKey();
  /* 토스 테스트 키(test_ck_)로 도는 동안만 «실제 청구 없음»을 말한다 — 라이브 키로 바뀌는 순간 문장이 사라진다 */
  const testBilling = clientKey?.startsWith("test_") ?? false;
  const endsInFuture = isInFuture(subscription?.nextBillingAt ?? null);
  const canChangeCard = !demo && clientKey !== null && subscription !== null && (hasActiveSub || endsInFuture);
  /* 다음 결제 금액 — 예약된 플랜이 있으면 그 요금(크론과 같은 규칙) */
  const billedPlan = subscription && isPaidPlan(subscription.pendingPlan ?? "") ? (subscription.pendingPlan as keyof typeof PLAN_PRICES) : subscription && isPaidPlan(subscription.plan) ? subscription.plan : null;
  const nextAmount = billedPlan ? PLAN_PRICES[billedPlan] : null;
  const pendingPlanName = subscription && isPaidPlan(subscription.pendingPlan ?? "") ? PLAN_NAMES[subscription.pendingPlan as keyof typeof PLAN_NAMES] : null;

  const chip = subFailed ? (
    <StateChip tone="unknown" />
  ) : subscription?.status === "past_due" ? (
    <StateChip tone="warn">결제 실패 — 재시도 중</StateChip>
  ) : subscription?.status === "active" ? (
    <StateChip tone="ok">자동결제 등록됨</StateChip>
  ) : subscription?.status === "canceled" && endsInFuture ? (
    <StateChip tone="off">해지 예약됨</StateChip>
  ) : (
    <StateChip tone="off">미등록</StateChip>
  );

  const sub: { text: string; tone: "sub" | "warning" } = demo
    ? { text: "지금은 예시 화면이에요 — 카드와 결제 내역은 표시되지 않아요", tone: "sub" }
    : subFailed
      ? { text: "구독 정보를 확인하지 못했어요 — 새로고침해 주세요", tone: "warning" }
      : subscription?.status === "past_due"
        ? { text: "최근 정기결제에 실패했어요. 카드를 바꾸거나 한도·유효기간을 확인해 주세요 — 3회 연속 실패하면 구독이 종료돼요.", tone: "warning" }
        : subscription?.status === "active"
          ? { text: `${planName ?? "유료"} 플랜 정기결제에 쓰는 카드예요`, tone: "sub" }
          : subscription?.status === "canceled"
            ? { text: "종료일 이후에는 청구되지 않아요", tone: "sub" }
            : { text: "구독을 시작할 때 카드를 한 번 등록하면 매월 자동으로 결제돼요", tone: "sub" };

  const stats: SummaryStatProps[] | undefined =
    !demo && !subFailed && subscription && (hasActiveSub || (subscription.status === "canceled" && endsInFuture))
      ? [
          {
            label: subscription.status === "canceled" ? "이용 종료일" : "다음 결제일",
            value: subscription.nextBillingAt ? formatDate(subscription.nextBillingAt) : "—",
            tnum: true,
          },
          {
            label: "다음 결제 금액",
            value: subscription.status === "canceled" ? "청구 없음" : nextAmount !== null ? formatKRW(nextAmount) : "—",
            note: pendingPlanName && subscription.status !== "canceled" ? `${pendingPlanName} 플랜 요금` : undefined,
            tnum: true,
          },
        ]
      : undefined;

  const orderLabel = ordersFailed ? "결제 내역" : orders.length >= 20 ? "결제 내역 · 최근 20건까지 표시돼요" : `결제 내역${orders.length ? ` · ${orders.length}건` : ""}`;

  return (
    <SettingsShell title="결제수단 관리" description="정기결제에 쓰는 카드와 결제 내역이에요.">
      <ResultBanner error={error} notice={notice} path="/settings/billing/payment" />

      {subFailed ? (
        <NoticeBar tone="warning" size="sm" action={<RetryLink />}>
          구독 정보를 불러오지 못했어요 — 등록 카드가 실제와 다르게 보일 수 있어요.
        </NoticeBar>
      ) : null}

      <SummaryCard
        leading={
          <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
            <CreditCard className="size-5" />
          </span>
        }
        title={subFailed ? "확인 못 함" : subscription?.cardSummary ? <span className="tnum">{subscription.cardSummary}</span> : <span className="text-fg-sub">등록된 카드가 없어요</span>}
        chips={chip}
        sub={
          <>
            {sub.text}
            {!demo ? (
              <span className="mt-1 block text-[12px] text-fg-sub">
                카드번호는 결제 대행사에만 저장되고 핀치는 카드사와 끝 번호만 보관해요 · 결제 3일 전에 알림을 드려요
                <InfoTip label="결제 안내" className="ml-1 align-middle">
                  해지는 플랜 관리에서 언제든 할 수 있어요.{testBilling ? " 지금은 테스트 결제로 동작해 실제로 청구되지 않아요." : ""}
                </InfoTip>
              </span>
            ) : null}
          </>
        }
        subTone={sub.tone}
        aside={demo ? <Badge tone="neutral">예시 화면</Badge> : canChangeCard && clientKey ? <ChangeCardClient clientKey={clientKey} hasCard={Boolean(subscription?.cardSummary)} /> : undefined}
        stats={stats}
        cols={2}
      />

      <SettingsGroup
        id="orders"
        label={orderLabel}
        footer={
          ordersFailed ? (
            <div className="p-4">
              <LoadFailed dense title="결제 내역을 불러오지 못했어요" description="내역이 없는 게 아니라 잠시 못 읽은 거예요. 다시 시도해 주세요." />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-4">
              <EmptyState
                dense
                icon={FileClock}
                title="아직 결제 내역이 없어요"
                description="플랜을 구독하면 여기에 쌓여요."
                action={
                  <ButtonLink href="/settings/billing" variant="secondary" size="sm">
                    플랜 보기
                  </ButtonLink>
                }
              />
            </div>
          ) : undefined
        }
      >
        {orders.map((o) => {
          const c = ORDER_CHIP[o.status];
          return (
            <SettingsRow
              key={o.id}
              label={o.orderName}
              chip={<StateChip tone={c.tone}>{c.label}</StateChip>}
              hint={<span className="tnum">{formatDate(o.approvedAt ?? o.createdAt)}</span>}
              trailing={
                <>
                  <span className="tnum text-[15px] font-semibold">{formatKRW(o.amount)}</span>
                  {/* 영수증 — 토스 승인 응답에 담겨 온 URL. 없는 건(옛 주문·실패 건)은 그리지 않는다 */}
                  {o.receiptUrl ? (
                    <a
                      href={o.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${o.orderName} 영수증 새 창`}
                      className="trans-state relative inline-flex items-center gap-1 rounded-card px-2 py-1.5 text-[14px] font-medium text-fg-sub after:absolute after:-inset-1.5 after:content-[''] hover:bg-tint-hover hover:text-fg"
                    >
                      영수증
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </>
              }
            />
          );
        })}
      </SettingsGroup>
    </SettingsShell>
  );
}
