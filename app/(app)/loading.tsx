import { Skeleton, SkeletonCard, SkeletonStatGrid } from "@/components/ui/skeleton";

/*
  (app) 그룹 공용 로딩 — 자체 loading.tsx가 없는 모든 페이지에 적용된다.
  클릭 즉시 사이드바·상단바는 유지된 채 본문 자리에 이 골격이 뜬다 —
  이게 없으면 App Router가 서버 렌더 완료까지 이전 화면을 붙잡고 있어
  클릭이 한 박자 늦게 느껴진다. 페이지별 맞춤 골격(dashboard·audience)이
  있으면 그쪽이 우선한다.
*/
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2.5 h-4 w-72" />
      </div>
      <SkeletonStatGrid />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard bodyClassName="h-48" />
        <SkeletonCard bodyClassName="h-48" />
      </div>
    </div>
  );
}
