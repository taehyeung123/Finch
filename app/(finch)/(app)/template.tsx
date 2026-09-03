/**
 * (app) 그룹 화면 전환 모션 — 페이지 블록들이 위에서부터 차례로 떠오르며 나타난다
 * (2026-09-03 사장님 지시, 링크팜 계정 화면 실측 재현 — 스태거 45ms · 블록당 400ms).
 *
 * layout 이 아니라 **template** 인 이유: 템플릿은 라우트 이동마다 새 인스턴스로
 * 마운트돼 CSS 애니메이션이 매번 다시 돈다. 레이아웃에 걸면 첫 진입에만 돌고,
 * 사이드바로 화면을 옮길 때는 아무 일도 없다.
 * 실제 모션은 전부 globals.css 의 .page-enter 규칙이다(여기엔 클래스 한 줄뿐) —
 * sticky/fixed 자손을 품은 블록은 상승 없이 페이드만 하는 예외까지 거기에 있다.
 *
 * `contents` 인 이유: 이 div 는 선택자 훅일 뿐 레이아웃에 끼어들면 안 된다.
 * <main> 은 flex-1 이라 높이가 확정돼 있고, 로딩 화면(PageLoading)이 그 높이를 h-full 로
 * 받아 본문 한가운데에 링을 놓는다. 사이에 보통 div 가 끼면 h-full 의 기준이 «자동 높이»가
 * 되어 링이 위쪽 26rem 안에 갇힌다 — display:contents 는 DOM 에는 남고(선택자는 맞는다)
 * 레이아웃에서는 사라져 예전과 같은 트리로 계산된다.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter contents">{children}</div>;
}
