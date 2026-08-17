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
        {/* 28px — 타입 7단계의 페이지 제목 단계다. text-2xl(24px)은 **스케일 밖**이었고,
            카드 제목 20px 와 4px 차이라 위계가 서지 않았다(같은 굵기·같은 색이면
            4px 는 눈에 안 띈다). 8px 벌리면 훑을 때 층이 읽힌다. */}
        <h2 className="text-[28px] font-bold leading-tight">{title}</h2>
        {/* 읽기 폭 제한은 **문단 단위**로 건다. 페이지 전체를 max-w-6xl 로 묶던 것을
            2026-08-17 에 걷어냈다(1920 에서 콘텐츠 영역의 31% 가 빈 여백이었다) —
            그 대신 실제로 길어지면 곤란한 것, 즉 문장에만 제한을 둔다.
            카드·그리드·표는 넓을수록 좋다. */}
        {description ? <p className="mt-1 max-w-[80ch] text-[15px] text-fg-sub">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
