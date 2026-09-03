import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CreditCard, FileClock } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { formatDate, formatKRW } from "@/lib/format";
import { getPaymentOrders, getSubscription, type PaymentOrderView } from "@/lib/data/internal";
import { PLAN_NAMES, isPaidPlan } from "@/lib/toss/config";
import { getBillingClientKey } from "@/lib/toss/billing";
import { isDemoMode } from "@/lib/supabase/config";
import { SettingsShell } from "../../_components/settings-shell";
import { BillingBanner } from "../_components/billing-banner";
import { ChangeCardClient } from "./_components/change-card-client";

export const metadata: Metadata = {
  title: "결제수단 관리",
  robots: { index: false, follow: false },
};

/*
  결제수단 관리 — 2026-09-03 플랜 관리에서 갈라 나왔다(허브 항목 하나 = 페이지 하나).
  - 등록된 카드(subscriptions.card_summary — 카드사 + 마스킹 번호, 카드번호 원문은 어디에도 없다)
  - 결제 내역(payment_orders, ready 제외 최신 20건)

  ⚠️ 조회 실패를 «없음»으로 그리지 않는다 — 돈이 오간 화면에서 「내역이 없습니다」는 가장 나쁜 거짓말이다.
*/

const ORDER_STATUS: Record<PaymentOrderView["status"], { label: string; tone: "positive" | "negative" | "neutral" }> = {
  paid: { label: "결제 완료", tone: "positive" },
  failed: { label: "실패", tone: "negative" },
  canceled: { label: "취소됨", tone: "neutral" },
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
  const hasActiveSub = subscription != null && subscription.status !== "canceled";
  const planName = subscription && isPaidPlan(subscription.plan) ? PLAN_NAMES[subscription.plan] : null;
  /* 카드 변경은 **살아 있는 구독**에만 — 종료일이 지난 해지 구독은 바꿔 봐야 청구될 일이 없다.
     빌링 키가 없거나 예시 화면이면 버튼을 그리지 않는다(누르면 안 되는 버튼을 그리지 않는다). */
  const clientKey = getBillingClientKey();
  /* 토스 테스트 키(test_ck_)로 도는 동안만 «실제 청구 없음»을 말한다 — 라이브 키로 바뀌는 순간 문장이 사라진다.
     «테스트 모드» 같은 운영 용어를 고객 문구에 박아 두면 라이브 전환 때 지우는 걸 잊는다(소넷 점검). */
  const testBilling = clientKey?.startsWith("test_") ?? false;
  const endsInFuture = isInFuture(subscription?.nextBillingAt ?? null);
  const canChangeCard =
    !isDemoMode() && clientKey !== null && subscription !== null && (hasActiveSub || endsInFuture);

  return (
    <SettingsShell title="결제수단 관리" description="정기결제에 쓰는 카드와 결제 내역을 확인하세요.">
      <BillingBanner error={error} notice={notice} path="/settings/billing/payment" />

      {subFailed ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-warning/40 bg-warning-weak px-4 py-3 text-[14px] text-fg">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          <span>구독 정보를 불러오지 못했어요 — 등록 카드가 실제와 다르게 보일 수 있으니 잠시 후 새로고침해 주세요.</span>
        </div>
      ) : null}

      {/* 결제 수단 — 정기결제(빌링) 카드 */}
      <Card>
        <CardHeader
          title="결제 카드"
          description={
            subFailed
              ? "확인하지 못했어요"
              : hasActiveSub
                ? `${planName ?? "유료"} 플랜 정기결제에 쓰는 카드예요`
                : subscription?.status === "canceled"
                  ? "해지 예약된 구독의 카드예요 — 종료일 이후에는 청구되지 않아요"
                  : "구독을 시작할 때 카드를 한 번 등록하면 매월 자동으로 결제돼요"
          }
          action={
            subFailed ? null : hasActiveSub ? (
              <Badge tone="positive">자동결제 등록됨</Badge>
            ) : (
              <Badge tone="neutral">미등록</Badge>
            )
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[15px]">
              <CreditCard className="size-4 shrink-0 text-fg-sub" aria-hidden />
              {subFailed ? (
                <span className="text-fg-sub">확인 못 함</span>
              ) : subscription?.cardSummary ? (
                <span className="tnum">{subscription.cardSummary}</span>
              ) : (
                <span className="text-fg-sub">등록된 카드가 없어요</span>
              )}
            </p>
            {canChangeCard && clientKey ? (
              <ChangeCardClient clientKey={clientKey} hasCard={Boolean(subscription?.cardSummary)} />
            ) : null}
          </div>
          {subscription?.status === "past_due" ? (
            <p className="text-[14px] font-medium text-warning-strong">
              최근 정기결제가 실패했어요. 카드 한도·유효기간을 확인하거나 다른 카드로 바꿔 주세요 — 자동으로 다시
              시도합니다.
            </p>
          ) : null}
          <p className="text-[14px] text-fg-sub">
            카드번호는 결제 대행사(토스페이먼츠)에만 저장되고 핀치는 카드사와 끝 번호만 보관해요. 매월 결제 예정일
            3일 전에 알림으로 미리 알려드리며, 해지는 언제든{" "}
            <Link href="/settings/billing" className="font-medium text-primary-ink underline underline-offset-2">
              플랜 관리
            </Link>
            에서 할 수 있어요.
            {testBilling ? " 지금은 테스트 결제로 동작해 실제로 청구되지 않아요." : ""}
          </p>
        </CardBody>
      </Card>

      {/* 결제 내역 — payment_orders 실조회 (ready 상태 제외). 이력이 없어도 카드는 항상 보인다 */}
      <Card>
        <CardHeader
          title="결제 내역"
          description={
            ordersFailed
              ? "불러오지 못했어요"
              : orders.length > 0
                ? `최근 ${orders.length}건`
                : "결제가 완료되면 여기에 표시됩니다"
          }
        />
        <CardBody>
          {ordersFailed ? (
            /* 진짜 없는 것과 못 읽은 것을 같은 카드로 그리면 안 된다 — 이 화면은 돈 얘기다 */
            <LoadFailed title="결제 내역을 불러오지 못했어요" />
          ) : orders.length === 0 ? (
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
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-card border border-line bg-plate text-fg-sub">
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
                    {/* 영수증 — 토스 승인 응답에 담겨 온 URL. 없는 건(옛 주문·실패 건)은 그리지 않는다 */}
                    {o.receiptUrl ? (
                      <a
                        href={o.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[14px] font-medium text-primary-ink underline underline-offset-2"
                      >
                        영수증
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </SettingsShell>
  );
}
