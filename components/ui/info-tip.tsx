"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "?" 아이콘 팝오버 — 자체 산출 지표의 계산 근거 설명용 (PRD 4.4 스코어링 등).
 * 자체 추정치를 표시하는 지표 옆에 반드시 함께 배치한다.
 */
export function InfoTip({
  children,
  className,
  label = "지표 설명 보기",
}: {
  children: React.ReactNode;
  className?: string;
  /** 스크린리더 이름 — 지표가 아닌 자리(«프로필 사진 설명 보기» 등)에서 바꾼다 */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const tip = useRef<HTMLSpanElement>(null);
  const id = useId();

  /*
    설명 상자를 화면 안으로 밀어 넣는다.

    버튼 기준 **중앙정렬**이라, 화면 오른쪽 끝 카드의 ? 를 누르면 상자가 그대로 뷰포트를 넘어갔다.
    폭 상한(max-w)만으로는 못 막는다 — 넘치는 원인이 폭이 아니라 **위치**다
    (실측 390px: right=455, 페이지에 가로 스크롤 65px 발생, 문장 오른쪽이 잘려 안 읽힘).

    보정값을 state 로 들면 «측정 → setState → 재렌더» 한 바퀴가 더 돌고, 그 사이 한 프레임 동안
    잘린 상자가 보인다. 레이아웃 단계에서 style 을 직접 만지면 paint 전에 끝난다.
  */
  useLayoutEffect(() => {
    const el = tip.current;
    if (!open || !el) return;
    el.style.transform = "translateX(-50%)"; // 기준 위치로 되돌리고 잰다(보정 누적 방지)
    const r = el.getBoundingClientRect();
    const M = 8; // 화면 가장자리 여백
    let shift = 0;
    if (r.right > window.innerWidth - M) shift = window.innerWidth - M - r.right;
    if (r.left + shift < M) shift = M - r.left;
    el.style.transform = `translateX(calc(-50% + ${shift}px))`;
  }, [open]);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        /* 보이는 크기는 14px 그대로 두고 **클릭 판정만** 넓힌다 — 14×14 는 WCAG 2.2 최소(24×24) 미달이라
           모바일에서 조준 자체가 어려웠다(실측). 저장소의 버튼이 쓰는 after 확장과 같은 수법이다. */
        className="trans-state relative text-fg-faint after:absolute after:-inset-[5px] after:content-[''] hover:text-fg-sub"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open ? (
        <span
          ref={tip}
          id={id}
          role="tooltip"
          /* w-64(256px)를 고정으로 두면 375px 화면의 가장자리 카드에서 뷰포트를 넘어 가로 스크롤이 생긴다 —
             화면 폭에서 좌우 여백을 뺀 값을 상한으로 둔다(감사 실측). 좌우 위치는 위 레이아웃 효과가 맡는다. */
          style={{ transform: "translateX(-50%)" }}
          className="shadow-pop absolute left-1/2 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-overlay p-3 text-left text-xs font-normal leading-relaxed text-fg-sub"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
