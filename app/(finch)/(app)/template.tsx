/**
 * (app) 그룹 화면 전환 모션 — 새 화면이 **0.16초 페이드 한 번**으로 나타난다.
 *
 * 2026-09-11 사장님 지시 «메이저 사이트처럼, 모든 버튼과 모든 전환이 같게»로 바꿨다. 그 전(2026-09-03)엔
 * 블록마다 0.4초씩 차례로 떠올라 마지막 블록까지 0.76초가 걸렸고, 본문이 이미 와 있는데도 그만큼
 * «아직 안 온 것처럼» 보였다. 이제 창·시트·서랍·탭 교체와 같은 --dur-2 를 쓴다(globals.css .page-enter).
 *
 * layout 이 아니라 **template** 인 이유: 템플릿은 라우트 이동마다 새 인스턴스로
 * 마운트돼 CSS 애니메이션이 매번 다시 돈다. 레이아웃에 걸면 첫 진입에만 돈다.
 *
 * `contents` 인 이유: 이 div 는 선택자 훅일 뿐 레이아웃에 끼어들면 안 된다.
 * <main> 은 flex-1 이라 높이가 확정돼 있고, 로딩 화면(PageLoading)이 그 높이를 h-full 로
 * 받아 본문 한가운데에 링을 놓는다 — 사이에 보통 div 가 끼면 링이 위쪽에 갇힌다.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter contents">{children}</div>;
}
