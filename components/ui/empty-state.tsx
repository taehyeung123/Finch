import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 py-14 text-center">
      {Icon ? <Icon className="size-8 text-fg-faint" aria-hidden /> : null}
      <p className="text-[15px] font-semibold text-fg-sub">{title}</p>
      {description ? <p className="max-w-sm text-[13px] text-fg-faint">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
