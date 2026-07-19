"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { Button } from "@/components/ui/button";
import { formatKRW } from "@/lib/format";

/**
 * 정기결제 카드 등록 — Toss 빌링 인증창(v2 payment.requestBillingAuth).
 * 자동갱신 동의는 사전 체크 금지 — 사용자가 직접 체크해야 시작 가능 (전자상거래법).
 * successUrl로 authKey·customerKey가 돌아오면 서버가 빌링키 발급 + 첫 결제를 실행한다.
 */
export function SubscribeClient({
  plan,
  planName,
  amount,
  clientKey,
}: {
  plan: string;
  planName: string;
  amount: number;
  clientKey: string;
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, autoRenewalAgreed: true }),
      });
      const data = (await res.json()) as { customerKey?: string; error?: string };
      if (!res.ok || !data.customerKey) {
        setError(data.error ?? "구독 시작에 실패했어요.");
        return;
      }
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: data.customerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${window.location.origin}/settings/billing/subscribe/success`,
        failUrl: `${window.location.origin}/settings/billing/subscribe/fail`,
      });
      // 성공 시 successUrl로 리다이렉트 — 이 아래는 사용자가 창을 닫은 경우만 도달
    } catch {
      setError("결제창을 여는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[14px] text-negative" role="alert">
          {error}
        </div>
      ) : null}

      <label className="flex items-start gap-2.5 rounded-card border border-line bg-overlay p-4 text-[13px] leading-relaxed text-fg-sub">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="font-semibold text-fg">[필수]</span> 매월 결제 예정일에 {planName} 플랜 요금{" "}
          {formatKRW(amount)}이 등록한 카드로 자동 결제되는 것에 동의합니다. 결제 예정일 3일 전에 알림으로
          미리 알려드리며, 언제든 설정 &gt; 요금제에서 해지할 수 있습니다.
        </span>
      </label>

      <Button variant="primary" size="lg" className="w-full" onClick={start} disabled={!agreed || busy}>
        {busy ? "결제창 여는 중…" : "카드 등록하고 구독 시작"}
      </Button>
      <p className="text-center text-[12px] text-fg-faint">
        테스트 모드입니다. 실제 청구가 발생하지 않는 Toss 테스트 결제로 동작해요.
      </p>
    </div>
  );
}
