import { Skeleton, SkeletonCard, SkeletonStatGrid } from "@/components/ui/skeleton";

/* 팔로워 분석 로딩 — 인사이트 시계열 호출 동안 골격을 먼저 그린다 */
export default function AudienceLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-2.5 h-4 w-72" />
      </div>
      <SkeletonStatGrid />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard bodyClassName="h-36" />
        <SkeletonCard bodyClassName="h-36" />
      </div>
    </div>
  );
}
