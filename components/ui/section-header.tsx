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
        <h2 className="text-2xl font-bold leading-tight">{title}</h2>
        {description ? <p className="mt-1 text-[15px] text-fg-sub">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
