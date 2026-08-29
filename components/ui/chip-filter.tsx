"use client";

import { cn } from "@/lib/cn";

/** 칩형 필터 (rounded-chip 32px) — 카테고리·채널 선택 등에 공통 사용 */
export function ChipFilter<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    /* chip-row — 좁은 화면에서 줄바꿈 대신 옆으로 민다. flex-wrap 이면 탭이 두 줄로 깨져
       «탭 줄» 로 안 읽힌다(2026-08-29 모바일 실측: 설정·알림·발행에서 전부 2줄). */
    <div className={cn("chip-row gap-1.5", className)} role="tablist">
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
