import { LoadingMark, Skeleton } from "@/components/ui/skeleton";

/*
  레퍼런스 로딩 골격 — 최종 화면과 같은 지오메트리로 CLS를 0으로 만든다.
  콘솔 줄(56px) + 상태 줄(36px) + 카드 그리드. 카드는 aspect-[4/5] 썸네일 +
  메타행 + 제목 + 요약 2줄 + 지표행으로 실제 카드와 높이를 맞춘다.
*/
export default function LibraryLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      {/* 콘솔 줄 */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-14 flex-1" />
        <Skeleton className="size-14 shrink-0" />
        <Skeleton className="h-14 w-32 shrink-0" />
      </div>

      {/* 상태 줄 — 우측에 로딩 마크를 둬서 오래 걸려도 "멈춘 게 아니라 도는 중"이 보이게 */}
      <div className="mt-2 flex h-9 items-center justify-between gap-3">
        <Skeleton className="h-7 w-64" />
        <LoadingMark />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line">
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-[18px] w-24" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
