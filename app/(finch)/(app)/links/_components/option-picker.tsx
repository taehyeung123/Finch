"use client";

import type { ReactNode } from "react";

/*
  리틀리식 비주얼 픽커(2026-08-27 사장님 지시 «클릭했을 때 뜨는 모달 전부 리틀리처럼») —
  편집기의 네이티브 <select> 대체. 선택지가 그림·라벨 카드로 펼쳐져 있어 눌러보기 전에
  결과를 안다. 선택 표시는 브랜드색이 아니라 **어두운 판 + 밝은 그림**(밝기 단차) —
  리틀리 실물과 같은 문법이고, 픽커가 여러 개 모여도 화면이 시끄럽지 않다.
*/

/** 그림 카드 픽커 — 선택지 2~5개, 모양을 그림으로 보여줄 수 있을 때 */
export function PickCards({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string; icon: ReactNode; disabled?: boolean; note?: string }[];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const off = disabled || o.disabled;
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            disabled={off}
            aria-pressed={on}
            title={o.note ?? o.label}
            onClick={() => {
              /* 같은 값 재클릭은 무시 — 네이티브 select 의 onChange 의미(설정 픽커가
                 불필요한 서버 저장·토스트를 만들었다, 쏘넷 점검) */
              if (value !== o.key) onChange(o.key);
            }}
            className={`trans-state flex min-w-[64px] flex-col items-center gap-1 rounded-card border p-1.5 pb-1 ${
              on ? "border-fg" : "border-line hover:bg-tint-hover"
            } ${off ? "cursor-not-allowed opacity-40 hover:bg-transparent" : ""}`}
          >
            <span aria-hidden className={`flex h-9 w-12 items-center justify-center rounded-[8px] ${on ? "bg-fg text-body" : "bg-plate text-fg-sub"}`}>
              {o.icon}
            </span>
            <span className={`text-[11px] ${on ? "font-semibold text-fg" : "font-medium text-fg-sub"}`}>{o.label}</span>
            {/* 비활성 사유는 눈에 보이게 — title 툴팁은 터치·스크린리더에 없다(쏘넷 점검) */}
            {o.note ? <span className="text-[11px] text-fg-sub">{o.note}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** 칩 픽커 — 숫자·언어처럼 그림이 없는 짧은 선택지 */
export function PickChips({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          aria-pressed={value === o.key}
          onClick={() => {
            if (value !== o.key) onChange(o.key);
          }}
          className={`trans-state rounded-chip border px-3 py-1.5 text-[12px] font-medium ${
            value === o.key ? "border-fg bg-fg text-body" : "border-line bg-body text-fg-sub hover:bg-tint-hover hover:text-fg"
          } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
