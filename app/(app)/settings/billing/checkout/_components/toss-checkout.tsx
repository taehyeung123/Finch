"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments, ANONYMOUS, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { Button } from "@/components/ui/button";
import { formatKRW } from "@/lib/format";
import { createCheckout } from "../../actions";

/**
 * Toss 결제위젯 (v2) — 결제수단·약관 렌더 후 결제 요청.
 * 실 스펙: docs/REAL_API_SPEC.md 4절. SDK는 window/DOM을 만지므로 마운트 후(useEffect)에만 초기화하고,
 * StrictMode 이중 렌더로 위젯이 두 번 그려지지 않도록 ref로 1회만 초기화한다.
 */
export function TossCheckout({
  plan,
  clientKey,
  customerKey,
  amount,
}: {
  plan: string;
  clientKey: string;
  customerKey: string | null;
  amount: number;
}) {
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const initializedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        const widgets = tossPayments.widgets({ customerKey: customerKey ?? ANONYMOUS });
        await widgets.setAmount({ currency: "KRW", value: amount });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
          widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
        ]);
        if (cancelled) return;
        widgetsRef.current = widgets;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "결제 위젯을 불러오지 못했어요.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientKey, customerKey, amount]);

  async function handlePay() {
    const widgets = widgetsRef.current;
    if (!widgets || paying) return;
    setPaying(true);
    setError(null);
    try {
      // 결제 직전에 주문 생성 → 예정 금액을 서버에 기록(승인 시 검증 기준)
      const order = await createCheckout(plan);
      if (!order.ok) {
        setError(order.error);
        setPaying(false);
        return;
      }
      const origin = window.location.origin;
      await widgets.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${origin}/settings/billing/success`,
        failUrl: `${origin}/settings/billing/fail`,
      });
      // 성공 시 successUrl로 리다이렉트되므로 이 아래는 실행되지 않는다
    } catch (e) {
      // 사용자가 결제창을 닫는 등 — 에러 흡수하고 재시도 가능하게
      setError(e instanceof Error ? e.message : "결제가 취소되었어요.");
      setPaying(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[14px] text-negative" role="alert">
          {error}
        </div>
      ) : null}

      {/* Toss 위젯이 그려지는 컨테이너 */}
      <div id="payment-method" />
      <div id="agreement" />

      <Button variant="primary" size="lg" className="w-full" onClick={handlePay} disabled={!ready || paying}>
        {paying ? "결제 진행 중…" : `${formatKRW(amount)} 결제하기`}
      </Button>
      <p className="text-center text-[12px] text-fg-faint">
        테스트 모드입니다. 실제 카드 청구가 발생하지 않는 Toss 테스트 결제로 동작합니다.
      </p>
    </div>
  );
}
