import { cn } from "@/lib/cn";

/** 로딩 스켈레톤 블록 — 크기·라운드는 className으로 지정 (토큰 색만 사용) */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-card bg-overlay", className)} />;
}

/** StatCard 자리 4칸 그리드 */
export function SkeletonStatGrid({ items = 4 }: { items?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="rounded-card border border-line p-5">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="mt-3 h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

/** 카드 본문 자리 — 헤더 라인 + 본문 블록 */
export function SkeletonCard({ bodyClassName = "h-40" }: { bodyClassName?: string }) {
  return (
    <div aria-hidden className="rounded-card border border-line p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className={cn("mt-4 w-full", bodyClassName)} />
    </div>
  );
}
