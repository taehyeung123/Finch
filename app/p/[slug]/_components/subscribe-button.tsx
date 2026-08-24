"use client";

import { Mail } from "lucide-react";

/* 상단 구독 버튼 — 리틀리 「공유/구독 버튼」 카피. 첫 구독신청 블록으로 부드럽게 스크롤해 이메일 칸에 포커스 */
export function SubscribeButton({ label, inline = false }: { label: string; inline?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.querySelector<HTMLElement>("[data-lp-subscribe]");
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 450);
      }}
      className={`${inline ? "relative" : "absolute left-5 top-4 z-20"} lp-btn inline-flex h-11 items-center gap-1.5 rounded-full bg-[var(--lp-accent)] px-4 text-[14px] font-semibold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]`}
    >
      <Mail className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}
