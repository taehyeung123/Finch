import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  dense = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** 카드 안 목록의 빈 상태 — 여백·아이콘을 줄인다(2026-09-03 설정 재설계) */
  dense?: boolean;
  /** 실패 변형(LoadFailed)이 점선을 실선으로 바꿀 때 — 점선은 «없음»처럼 읽힌다 */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line text-center",
        dense ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      {Icon ? <Icon className={cn("text-fg-faint", dense ? "size-6" : "size-8")} aria-hidden /> : null}
      <p className="text-[15px] font-semibold text-fg-sub">{title}</p>
      {description ? <p className="max-w-sm text-[14px] text-fg-sub">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
