import { cn } from "@/lib/cn";

/**
 * 핀치 심볼 마크 — 작은 새(되새) 실루엣, 시그널 코랄 단색 (PART 7.3-1).
 * 파비콘·앱 아이콘에서도 같은 실루엣을 축약해 재사용한다.
 */
export function FinchMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden fill="currentColor">
      {/* 몸통 */}
      <path d="M6 18.5c0-5.8 4.7-10.5 10.5-10.5 3.4 0 6.5 1.7 8.4 4.2l4.1-1.2-2.4 4.4c.2.8.4 1.7.4 2.6 0 5.8-4.7 10.5-10.5 10.5-2.3 0-4.5-.8-6.2-2L4 28l2.7-5.2c-.5-1.3-.7-2.8-.7-4.3z" />
      {/* 눈 — 배경색으로 뚫기 */}
      <circle cx="20.5" cy="14.5" r="1.6" fill="var(--color-surface)" />
    </svg>
  );
}

export function FinchLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <FinchMark className={cn("text-primary", markClassName)} />
      <span className="text-lg font-bold tracking-tight">핀치</span>
    </span>
  );
}
