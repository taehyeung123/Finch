"use client";

import { cn } from "@/lib/cn";

/** 칩형 필터 (rounded-chip 32px) — 카테고리·채널 선택 등에 공통 사용 */
export function ChipFilter<T extends string>({
  options,
  value,
  onChange,
  className,
  wrap = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /**
   * 항목이 많아 **한눈에 다 보여야 하는** 목록(카테고리 고르기 등)은 줄바꿈으로 둔다.
   * 기본값은 한 줄 가로 스크롤 — 탭처럼 몇 개뿐인 줄이 모바일에서 두 줄로 깨지면
   * «탭 줄»로 안 읽힌다(2026-08-29). 둘은 성격이 다른 UI 라 호출부가 고른다.
   */
  wrap?: boolean;
}) {
  return (
    <div className={cn(wrap ? "flex flex-wrap gap-1.5" : "chip-row gap-1.5", className)} role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex min-h-9 cursor-pointer items-center rounded-chip px-3.5 text-[14px] font-semibold trans-state",
              active
                ? "bg-primary text-on-primary"
                : "bg-overlay text-fg-sub border border-line hover:border-line-strong hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
