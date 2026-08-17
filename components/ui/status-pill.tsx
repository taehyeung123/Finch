import { cn } from "@/lib/cn";

/*
  상태 필 — 2026-08-15 신설 ("예약됨 / 발행완료 / 실패 / 초안 저거 디자인 바꿀 순 없어?").

  앞서는 공용 Badge 를 tone 만 바꿔 썼다. 문제는 Badge 가 **분류 배지**라는 것이다:
  전부 같은 무게의 색 알약이라 5개가 한 목록에 섞이면 어느 게 "지금 문제인지"가
  안 읽힌다. 실패와 예약됨이 색만 다른 같은 크기 알약이었다.

  상태는 분류가 아니라 **진행 단계**다. 그래서 다르게 그린다:
   · 점(dot) 하나 + 라벨 — 색면을 걷어내 목록이 알약 밭이 되지 않는다
   · 지금 진행 중인 것만 점이 맥동한다(발행 중)
   · **주의가 필요한 상태(실패)만** 색면을 쓴다 — 한 화면에서 색면은 하나뿐이라
     눈이 거기로 간다
   · 완료는 가장 조용하다. 끝난 일은 목록에서 존재감을 가질 이유가 없다

  다크에서도 같은 규칙이 성립한다 — 전부 시맨틱 토큰이라 값만 바뀐다.
*/
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "canceled";

const META: Record<PostStatus, { label: string; dot: string; text: string; face?: string; pulse?: boolean }> = {
  draft: { label: "초안", dot: "bg-fg-faint", text: "text-fg-sub" },
  scheduled: { label: "예약됨", dot: "bg-primary", text: "text-fg" },
  publishing: { label: "발행 중", dot: "bg-warning", text: "text-warning-strong", pulse: true },
  published: { label: "발행 완료", dot: "bg-positive", text: "text-fg-sub" },
  /* 유일하게 색면을 쓴다 — 목록에서 즉시 눈에 걸려야 하는 단 하나의 상태다 */
  failed: { label: "발행 실패", dot: "bg-negative", text: "text-negative-strong", face: "bg-negative-weak" },
  canceled: { label: "취소됨", dot: "bg-fg-faint", text: "text-fg-faint" },
};

export function StatusPill({ status, className }: { status: PostStatus; className?: string }) {
  const m = META[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-chip py-0.5 text-[12px] font-semibold whitespace-nowrap",
        m.face ? `${m.face} px-2.5` : "px-1",
        m.text,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", m.dot, m.pulse && "anim-pulse")} aria-hidden />
      {m.label}
    </span>
  );
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: META.draft.label,
  scheduled: META.scheduled.label,
  publishing: META.publishing.label,
  published: META.published.label,
  failed: META.failed.label,
  canceled: META.canceled.label,
};
