import { cn } from "@/lib/cn";

/* 그림자 미사용 — 반투명 테두리로 깊이 표현 (PART 7.2) */
export function Card({
  className,
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "bg-body border border-line rounded-card",
        hover && "transition-colors hover:border-line-strong",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 p-5 pb-0", className)}>
      <div className="min-w-0">
        <h3 className="text-[19px] font-bold leading-snug">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] text-fg-sub">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
