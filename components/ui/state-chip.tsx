import { cn } from "@/lib/cn";

/*
  상태 칩 — 연결·구독·팀·동의 같은 «지금 상태»를 점 하나 + 짧은 라벨로 말한다(2026-09-03 설정 재설계).

  StatusPill(components/ui/status-pill.tsx)의 문법을 일반화한 것이다 — 그쪽은 발행 상태(PostStatus) 전용으로
  그대로 둔다. Badge 는 **분류**(플랜명·채널·역할)에만 쓰고, 상태는 이 칩으로 그린다:
   · 색면은 warn·bad 둘뿐 — 목록이 알약 밭이 되지 않는다. 눈은 «지금 손볼 것»에만 간다.
   · ok 는 조용하다(초록 점 + 보조색 글자). 끝난 일은 존재감을 가질 이유가 없다.
   · todo(코랄 점)는 «아직 안 한 일»이다 — 신규 사용자의 0개. 이미 쓰고 있는 상태에 쓰지 않는다.
   · unknown(속 빈 점)은 «확인 못 함» — 실패를 «없음»으로 그리지 않기 위한 톤. off(꺼짐·미등록)와 다르다.
*/
export type StateTone = "ok" | "todo" | "off" | "pending" | "warn" | "bad" | "unknown";

const TONES: Record<StateTone, { dot: string; text: string; face?: string; defaultLabel?: string }> = {
  ok: { dot: "bg-positive", text: "text-fg-sub" },
  todo: { dot: "bg-primary", text: "text-fg" },
  off: { dot: "bg-fg-faint", text: "text-fg-sub" },
  pending: { dot: "bg-fg-faint", text: "text-fg-sub", defaultLabel: "준비 중" },
  warn: { dot: "bg-warning", text: "text-warning-strong", face: "bg-warning-weak" },
  bad: { dot: "bg-negative", text: "text-negative-strong", face: "bg-negative-weak" },
  /* 속 빈 점 — 꽉 찬 점들 사이에서 «비어 있음(모름)»으로 읽힌다. 테두리를 1.5px 로 잡아 흐리지 않게 */
  unknown: { dot: "border-[1.5px] border-fg-sub bg-transparent", text: "text-fg-sub", defaultLabel: "확인 못 함" },
};

export function StateChip({
  tone,
  children,
  className,
}: {
  tone: StateTone;
  /** 없으면 톤의 기본 라벨(unknown «확인 못 함» · pending «준비 중») */
  children?: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-chip py-0.5 text-[12px] font-semibold whitespace-nowrap",
        t.face ? `${t.face} px-2.5` : "px-1",
        t.text,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} aria-hidden />
      {children ?? t.defaultLabel}
    </span>
  );
}
