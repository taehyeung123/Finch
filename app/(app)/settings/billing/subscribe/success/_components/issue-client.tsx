"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { formatKRW } from "@/lib/format";

/**
 * 빌링 인증 성공 후 활성화 — authKey를 서버로 보내 빌링키 발급 + 첫 결제를 실행한다.
 * StrictMode 이중 실행 가드(ref) + 서버측 pending→active 원자 선점으로 이중 청구를 막는다.
 */
type IssueState =
  | { phase: "working" }
  | { phase: "done"; planName: string; amount: number; nextBillingAt: string }
  | { phase: "error"; message: string };

export function IssueClient({ authKey, customerKey }: { authKey: string; customerKey: string }) {
  const [state, setState] = useState<IssueState>({ phase: "working" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/billing/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authKey, customerKey }),
        });
        const data = (await res.json()) as {
          status?: string;
          planName?: string;
          amount?: number;
          nextBillingAt?: string;
          error?: string;
        };
        if (res.ok && (data.status === "active" || data.status === "already_active")) {
          setState({
            phase: "done",
            planName: data.planName ?? "구독",
            amount: data.amount ?? 0,
            nextBillingAt: data.nextBillingAt ?? "",
          });
        } else {
          setState({ phase: "error", message: data.error ?? "구독 활성화에 실패했어요." });
        }
      } catch {
        setState({ phase: "error", message: "네트워크 오류가 발생했어요. 요금제 화면에서 상태를 확인해 주세요." });
      }
    })();
  }, [authKey, customerKey]);

  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center">
      {state.phase === "working" ? (
        <>
          <span className="size-10 animate-pulse rounded-chip bg-primary-weak" aria-hidden />
          <div>
            <p className="text-lg font-bold">구독을 활성화하고 있어요…</p>
            <p className="mt-1 text-[14px] text-fg-sub">카드 확인과 첫 결제를 진행 중입니다. 잠시만 기다려 주세요.</p>
          </div>
        </>
      ) : state.phase === "done" ? (
        <>
          <CheckCircle2 className="size-12 text-positive" aria-hidden />
          <div>
            <p className="text-lg font-bold">구독이 시작되었어요</p>
            <p className="mt-1 text-[14px] text-fg-sub">
              {state.planName} 플랜{state.amount > 0 ? ` · ${formatKRW(state.amount)}/월` : ""}
              {state.nextBillingAt ? ` · 다음 결제일 ${state.nextBillingAt.slice(0, 10)}` : ""}
            </p>
          </div>
        </>
      ) : (
        <>
          <XCircle className="size-12 text-negative" aria-hidden />
          <div>
            <p className="text-lg font-bold">구독을 시작하지 못했어요</p>
            <p className="mt-1 text-[14px] text-fg-sub">{state.message}</p>
          </div>
        </>
      )}
      <Link href="/settings/billing" className={buttonClasses("primary", "md")}>
        요금제로 돌아가기
      </Link>
    </Card>
  );
}
