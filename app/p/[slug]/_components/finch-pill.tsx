"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { FinchMark } from "@/components/logo";

/**
 * 하단 홍보 알약(2026-08-26 사장님 지시) — 링크인바이오 관례의 「나도 만들기」 플로팅.
 * 항상 흰 알약(테마 무관)이라 어떤 배경에서도 읽힌다. X 로 닫으면 이 화면에서만 닫힌다.
 * 강조 블록 고정 CTA 가 있는 페이지에서는 부모가 아예 안 그린다 — 돈 버는 버튼을 덮지 않는다.
 */
export function FinchPill({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    /* 등장 지연만 — 닫음은 저장하지 않는다(이 화면에서만 닫힘). sessionStorage 에 남기니
       한 번 닫은 뒤 «모바일에 안 뜬다»로 읽혔다(2026-08-26). 새 방문마다 다시 뜬다. */
    const t = setTimeout(() => setShow(true), 400);
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
          onClick={() => setShow(false)}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
