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

      {/* 실제 결과 그리드와 같은 .grid-refs — 컬럼 수를 여기서 따로 하드코딩하면
          로딩→콘텐츠 전환에서 카드 폭이 튄다 */}
      <div className="grid-refs mt-5" aria-hidden>
        {/* 실제 카드와 같은 지오메트리 — 미디어 3:4 + 정보 바 44px.
            어긋나면 로딩→콘텐츠에서 스크롤이 튄다. */}
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line">
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
            <div className="flex h-11 items-center gap-1.5 px-2.5">
              <Skeleton className="size-3.5 shrink-0 rounded-chip" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-10 shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
