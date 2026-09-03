"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

/**
 * 빌링 인증 성공 후 — authKey 를 서버로 보내 새 빌링키 발급 + 카드 교체.
 * 성공하면 결제수단 화면으로 돌아가 배너(cardChanged=1)로 알린다.
 * StrictMode 이중 실행 가드(ref) — authKey 는 1회용이라 두 번 보내면 두 번째가 실패로 보인다.
 */
type IssueState = { phase: "working" } | { phase: "error"; message: string };

export function CardIssueClient({ authKey, customerKey }: { authKey: string; customerKey: string }) {
  const router = useRouter();
  const [state, setState] = useState<IssueState>({ phase: "working" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/billing/card/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authKey, customerKey }),
        });
        const data = (await res.json()) as { status?: string; error?: string };
        if (res.ok && data.status === "changed") {
          router.replace("/settings/billing/payment?cardChanged=1");
          return;
        }
        setState({ phase: "error", message: data.error ?? "카드를 바꾸지 못했어요." });
      } catch {
        setState({ phase: "error", message: "네트워크 오류가 발생했어요. 결제수단 화면에서 카드 상태를 확인해 주세요." });
      }
    })();
  }, [authKey, customerKey, router]);

  return (
    <Card role="status" aria-live="polite" className="flex flex-col items-center gap-4 p-4 text-center">
      {state.phase === "working" ? (
        <>
          <span className="size-10 animate-pulse rounded-chip bg-primary-weak" aria-hidden />
          <div>
            <p className="text-[17px] font-bold">새 카드를 등록하고 있어요…</p>
            <p className="mt-1 text-[15px] text-fg-sub">청구는 없어요. 잠시만 기다려 주세요.</p>
          </div>
          <p className="text-[14px] text-fg-sub">끝날 때까지 이 창을 닫지 마세요.</p>
        </>
      ) : (
        <>
          <XCircle className="size-12 text-negative" aria-hidden />
          <div>
            <p className="text-[17px] font-bold">카드를 바꾸지 못했어요</p>
            <p className="mt-1 text-[15px] text-fg-sub">{state.message}</p>
          </div>
          <Link href="/settings/billing/payment" className={buttonClasses("primary", "md")}>
            결제수단으로 돌아가기
          </Link>
        </>
      )}
    </Card>
  );
}
