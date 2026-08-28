"use client";

import { Mail } from "lucide-react";

/* 상단 구독 버튼 — 리틀리 「공유/구독 버튼」 카피. 첫 구독신청 블록으로 부드럽게 스크롤해 이메일 칸에 포커스 */
/** shift — 공유 칩이 켜져 있으면 그 왼쪽 옆으로 비켜선다(왼쪽 위는 이제 핀치 로고 자리) */
export function SubscribeButton({ label, inline = false, shift = false }: { label: string; inline?: boolean; shift?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.querySelector<HTMLElement>("[data-lp-subscribe]");
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 450);
      }}
      className={`${inline ? "relative h-11" : `absolute! ${shift ? "right-[62px] sm:right-[76px]" : "right-3.5 sm:right-7"} top-3.5 sm:top-7 z-20 h-10`} lp-btn inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-accent)] px-4 text-[14px] font-semibold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]`}
    >
      <Mail className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
