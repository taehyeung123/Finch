/**
 * 방금 켠 «처리 중» 표시가 **실제로 칠해진 뒤**에 이어가게 한 프레임 양보한다.
 *
 * 사진 디코드·캔버스 인코딩은 한 번 시작하면 메인 스레드를 수백 ms 통째로 잡는다. 상태를 켜자마자
 * 그 일을 시작하면 브라우저가 칠할 틈이 없어 표시가 «끝난 뒤에야» 번쩍인다 — 누른 직후에 아무 반응이
 * 없던 원인이다(2026-09-10 점검: 게시물 작성·프로필 링크 이미지 칸).
 * rAF 는 다음 페인트 직전에 돌고, 그 안의 setTimeout(0) 은 페인트 **다음** 태스크다.
 *
 * 문서가 가려져 있으면 rAF 가 돌지 않는다 — 그때는 칠할 화면도 없으니 태스크 하나만 양보한다
 * (안드로이드 사진 선택창에서 돌아온 직후 visibility 가 늦게 바뀌는 경우 멈춰 서지 않게).
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || document.visibilityState === "hidden") {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
