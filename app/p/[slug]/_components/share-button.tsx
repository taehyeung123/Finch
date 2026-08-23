"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/*
  상단 공유 버튼 — 리틀리 「공유/구독 버튼: 노출」 카피(3단계). 페이지 오른쪽 위에 작은 원 버튼.
  Web Share 가 되면 시스템 공유 시트, 아니면 주소 복사. 색은 테마 변수만(방문자 화면).
*/
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ url, title });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      /* 사용자가 시트를 닫은 경우 등 — 조용히 */
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      aria-label={done ? "주소를 복사했어요" : "이 페이지 공유"}
      className="absolute right-5 top-4 z-20 flex size-10 items-center justify-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] text-[var(--lp-fg)] shadow-[var(--lp-shadow)] transition-opacity hover:opacity-80"
    >
      {done ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
    </button>
  );
}
