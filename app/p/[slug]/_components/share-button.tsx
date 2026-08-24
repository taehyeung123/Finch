"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/*
  상단 공유 버튼 — 리틀리 「공유/구독 버튼: 노출」 카피(3단계). 페이지 오른쪽 위에 작은 원 버튼.
  Web Share 가 되면 시스템 공유 시트, 아니면 주소 복사. 색은 테마 변수만(방문자 화면).
*/
export function ShareButton({
  url,
  title,
  label = "이 페이지 공유",
  done: doneLabel = "주소를 복사했어요",
  inline = false,
}: {
  url: string;
  title: string;
  label?: string;
  done?: string;
  /** 상단 메뉴 줄 안에 놓일 때 — absolute 가 아니라 흐름 안 */
  inline?: boolean;
}) {
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
      aria-label={done ? doneLabel : label}
      className={`${inline ? "relative size-11" : "absolute right-5 top-4 z-20 size-11"} lp-btn flex items-center justify-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] text-[var(--lp-fg)] shadow-[var(--lp-shadow)]`}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
      {/* 복사 완료를 소리로도 — aria-label 교체만으론 스크린리더가 공지하지 않는다(감사2 U15) */}
      <span role="status" className="sr-only">
        {done ? doneLabel : ""}
      </span>
    </button>
  );
}
