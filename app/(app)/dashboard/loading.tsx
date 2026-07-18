import { Skeleton, SkeletonCard, SkeletonStatGrid } from "@/components/ui/skeleton";

/* 대시보드 로딩 — 라이브 인사이트 호출(수 초) 동안 골격을 먼저 그린다 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-2.5 h-4 w-64" />
      </div>
      <SkeletonStatGrid />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SkeletonCard bodyClassName="h-64" />
        </div>
        <div className="space-y-6">
          <SkeletonCard bodyClassName="h-16" />
          <SkeletonCard bodyClassName="h-24" />
        </div>
      </div>
    </div>
  );
}
