import { FinchMark } from "@/components/logo";

/*
  페이지 전환 로딩 — 사이드바·상단바를 뺀 **본문 영역 전체**를 덮는다.

  왜 페이지별 골격(스켈레톤)을 버렸나
  ------------------------------------------------------------------
  전에는 (app)/loading.tsx 가 대시보드 모양 골격(통계 4칸 + 카드 2장)을 그렸다.
  대시보드로 갈 때는 맞지만 스튜디오·광고·설정으로 갈 때는 **없는 레이아웃을 미리
  보여주는 셈**이라, 실제 화면이 뜨는 순간 전혀 다른 모양으로 갈아엎힌다.
  골격이 맞는 페이지 3개는 부드럽고 나머지 12개는 덜컹거리는 상태였다.

  그래서 모양을 흉내내지 않는다. 어디로 가든 같은 자리에 같은 표시가 뜨고,
  실제 화면이 그 위로 올라온다. 목적지를 넘겨짚지 않으니 틀릴 일이 없다.

  높이: 부모 <main> 은 flex-1 이라 높이가 확정돼 있으므로 h-full 이 그대로 먹는다.
  min-h 를 함께 두는 것은 예시 데이터 배너처럼 위쪽 요소가 늘어나 계산이 어긋나도
  로딩 영역이 납작해지지 않게 하는 최소 보장이다(뷰포트 계산식을 쓰면 배너 유무에
  따라 스크롤바가 생겼다 없어졌다 한다).

  링은 수집 오버레이와 같은 .collect-orbit(108px)을 쓴다 — 앱 안에서 "기다리는 중"의
  생김새가 하나로 유지된다.
*/
export function PageLoading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full min-h-[26rem] w-full flex-col items-center justify-center gap-5"
    >
      <div className="collect-orbit" aria-hidden>
        <FinchMark className="size-9 text-primary" />
      </div>
      <p className="text-[13px] font-medium text-fg-faint">{label}</p>
    </div>
  );
}
