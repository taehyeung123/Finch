"use client";

import { useState } from "react";

/*
  접기 — 그룹(가로 카드·그리드)의 처음 N개만 보이고 「더보기」로 펼친다.
  리틀리 「링크 나열: 접기 적용」 카피(2단계). 공개 페이지·편집 미리보기가 같은 컴포넌트를 쓴다.
  색은 전부 테마 변수(--lp-*) — 방문자 화면이다.
*/
export function Collapsible({
  items,
  initial,
  className,
  moreLabel = "더보기 ({n}개)",
  lessLabel = "접기",
}: {
  items: React.ReactNode[];
  /** 처음에 보일 개수. 0 이거나 전체보다 크면 접지 않는다 */
  initial: number;
  /** 항목 컨테이너 클래스(grid·space-y 등) */
  className?: string;
  /** 페이지 언어(0058) — {n} 이 남은 개수로 치환된다. 편집 미리보기는 기본값(한국어) */
  moreLabel?: string;
  lessLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const folds = initial > 0 && items.length > initial;
  const shown = folds && !open ? items.slice(0, initial) : items;
  return (
    <div>
      <div className={className}>{shown}</div>
      {folds ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2 flex min-h-[40px] w-full items-center justify-center rounded-[var(--lp-radius-btn)] border border-[var(--lp-border)] bg-[var(--lp-card)] text-[13px] font-semibold text-[var(--lp-muted)] transition-opacity hover:opacity-80"
        >
          {open ? lessLabel : moreLabel.replace("{n}", String(items.length - initial))}
        </button>
      ) : null}
    </div>
  );
}
