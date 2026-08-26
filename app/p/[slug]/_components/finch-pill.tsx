"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { FinchMark } from "@/components/logo";

/**
 * 하단 홍보 알약(2026-08-26 사장님 지시) — 링크인바이오 관례의 「나도 만들기」 플로팅.
 * 항상 흰 알약(테마 무관)이라 어떤 배경에서도 읽힌다. X 로 닫으면 세션 동안 다시 안 뜬다.
 * 강조 블록 고정 CTA 가 있는 페이지에서는 부모가 아예 안 그린다 — 돈 버는 버튼을 덮지 않는다.
 */
export function FinchPill({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    /* 닫은 적 있는지 storage 를 읽고 나서야 보여준다 — 렌더 중/이펙트 본문 동기 setState 금지
       규칙과 SSR 불일치(서버엔 storage 가 없다)를 setTimeout 한 틀로 함께 피한다. */
    const t = setTimeout(() => {
      let off = false;
      try {
        off = sessionStorage.getItem("finch-pill-off") === "1";
      } catch {
        /* storage 차단 환경 — 그냥 보여준다 */
      }
      if (!off) setShow(true);
    }, 400);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-5">
      <div className="lp-pill-in pointer-events-auto flex items-center gap-1 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-neutral-900 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)]">
        <Link
          href="/?utm_source=profile_link&utm_medium=pill"
          target="_blank"
          className="flex items-center gap-2 text-[13px] font-bold"
        >
          <FinchMark className="size-4 text-primary" aria-hidden />
          {label}
        </Link>
        <button
          type="button"
          aria-label="닫기"
          className="flex size-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          onClick={() => {
            setShow(false);
            try {
              sessionStorage.setItem("finch-pill-off", "1");
            } catch {
              /* storage 차단 — 이번 화면만 닫힌다 */
            }
          }}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
