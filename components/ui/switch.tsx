"use client";

import { cn } from "@/lib/cn";

/*
  공용 토글 스위치 (2026-08-14 설정 감사 반영 — 중복 구현 2곳 통합).
  기존 문제: 알림 설정과 자동 DM의 스위치가 스타일이 서로 달랐고, 둘 다
  - 터치 타깃 20×36px(44px 미달), cursor-pointer·focus-visible 링 부재
  - 켜짐 knob이 bg-fg(다크에서 흰색)×코랄 트랙 = '코랄 위 흰색 금지' 규칙 위반
  이었다. 여기서 한 번에 해결한다:
  - after 의사요소로 히트 영역 44px 확보 (시각 크기는 20×36 유지)
  - knob은 항상 bg-overlay가 아니라 **on-primary 계열의 다크 knob** — 켜짐 트랙(코랄) 위에서
    라이트/다크 모두 대비 확보 (꺼짐 트랙은 line-strong 위 overlay knob)
  - 모션은 앱 공통 전환 토큰(0.2s ease-out)으로 통일, aria-label 필수
*/
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** 스크린리더용 이름 — 아이콘/텍스트가 밖에 있으면 반드시 넘길 것 */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-chip transition-colors duration-200 ease-out",
        "after:absolute after:-inset-3 after:content-['']", // 44px 히트 영역
        "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-primary" : "bg-line-strong",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full transition-[left,background-color] duration-200 ease-out",
          // 켜짐: 코랄 트랙 위 다크 knob(on-primary 규칙) / 꺼짐: 회색 트랙 위 밝은 knob
          checked ? "left-[18px] bg-on-primary" : "left-0.5 bg-overlay",
        )}
        aria-hidden
      />
    </button>
  );
}
