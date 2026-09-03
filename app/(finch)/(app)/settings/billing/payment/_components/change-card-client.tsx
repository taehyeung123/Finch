"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { Button } from "@/components/ui/button";

/*
  결제 카드 변경 — 토스 빌링 인증창을 **기존 customerKey** 로 다시 연다.
  성공하면 successUrl 로 authKey·customerKey 가 돌아오고, 그 화면이 /api/billing/card/issue 를 불러
  기존 구독의 카드만 바꾼다(청구 없음). 구독 시작 화면(subscribe-client.tsx)과 같은 SDK 호출이다.
*/
export function ChangeCardClient({ clientKey, hasCard }: { clientKey: string; hasCard: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/card/start", { method: "POST" });
      const data = (await res.json()) as { customerKey?: string; error?: string };
      if (!res.ok || !data.customerKey) {
        setError(data.error ?? "카드 변경을 시작하지 못했어요.");
        return;
      }
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: data.customerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${window.location.origin}/settings/billing/payment/success`,
        failUrl: `${window.location.origin}/settings/billing/payment/fail`,
      });
      // 성공 시 successUrl 로 리다이렉트 — 이 아래는 사용자가 창을 닫은 경우만 도달
    } catch {
      setError("결제창을 여는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={start} disabled={busy}>
        {busy ? "결제창 여는 중…" : hasCard ? "카드 변경" : "카드 등록"}
      </Button>
      {error ? (
        <p role="alert" className="text-[14px] text-negative-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
