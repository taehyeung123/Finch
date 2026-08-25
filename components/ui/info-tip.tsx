"use client";

import { useId, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "?" 아이콘 팝오버 — 자체 산출 지표의 계산 근거 설명용 (PRD 4.4 스코어링 등).
 * 자체 추정치를 표시하는 지표 옆에 반드시 함께 배치한다.
 */
export function InfoTip({ children, className }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label="지표 설명 보기"
        className="text-fg-faint hover:text-fg-sub trans-state"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          /* w-64(256px)를 고정으로 두면 375px 화면의 가장자리 카드에서 뷰포트를 넘어 가로 스크롤이 생긴다 —
             화면 폭에서 좌우 여백을 뺀 값을 상한으로 둔다(감사 실측) */
          className="shadow-pop absolute left-1/2 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-card border border-line bg-overlay p-3 text-left text-xs font-normal leading-relaxed text-fg-sub"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
