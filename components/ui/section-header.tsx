import { cn } from "@/lib/cn";

/** 앱 페이지 상단 공통 헤더 — H2 24px/700 (PART 7.6) */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {/* 20px — 2026-08-19 밀도 개편(링크팜 실측 비율 대응)으로 28→20.
            28은 앱 화면에서 히어로 숫자 전용으로 내려갔다 — 링크팜·스니핏류 대비
            우리 화면이 "투박하게 크게" 읽힌 첫 원인이 28px 페이지 제목이었다.
            카드 제목(17px)과 3px 차이지만, 과거 "4px 는 같은 굵기·같은 색일 때
            안 읽힌다"는 교훈대로 이번엔 **굵기를 가른다**(bold 대 semibold) —
            크기+굵기 이중 신호라 층이 선다. */}
        <h2 className="text-[20px] font-bold leading-tight">{title}</h2>
        {/* 읽기 폭 제한은 **문단 단위**로 건다. 페이지 전체를 max-w-6xl 로 묶던 것을
            2026-08-17 에 걷어냈다(1920 에서 콘텐츠 영역의 31% 가 빈 여백이었다) —
            그 대신 실제로 길어지면 곤란한 것, 즉 문장에만 제한을 둔다.
            카드·그리드·표는 넓을수록 좋다. */}
        {description ? <p className="mt-1 max-w-[80ch] text-[14px] text-fg-sub">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
