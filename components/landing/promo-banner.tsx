"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

const STORAGE_KEY = "finch-promo-dismissed";

/* localStorage 기반 외부 스토어 — effect 내 setState 없이 hydration 안전하게 구독한다.
   서버 스냅숏은 항상 "숨김"이라 SSR/첫 클라이언트 렌더가 일치하고,
   dismiss()가 리스너를 깨워 같은 탭에서도 즉시 반영된다. */
let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) !== "1";
}

function dismiss() {
  localStorage.setItem(STORAGE_KEY, "1");
  listeners.forEach((l) => l());
}

/* 최상단 프로모션 배너 (마케팅 영역) — 닫으면 localStorage에 기억
   TODO: 실제 프로모션 확정 시 문구·조건 교체 */
export function PromoBanner() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, () => false);

  if (!visible) return null;

  return (
    <div className="relative bg-primary text-on-primary">
      <div className="mx-auto flex h-10 max-w-6xl items-center justify-center gap-2 px-10 text-[13px] font-medium">
        <p className="truncate">
          <span className="hidden sm:inline">오픈 베타 기념 — </span>
          지금 가입하면 Creator 플랜 3개월 무료
        </p>
        <Link
          href="/signup"
          className="inline-flex shrink-0 items-center gap-1 font-bold underline underline-offset-2"
        >
          무료로 시작하기
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="배너 닫기"
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-card p-1.5 transition-colors hover:bg-primary-hover"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
