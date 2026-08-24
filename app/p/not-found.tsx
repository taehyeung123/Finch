/* 존재하지 않는(또는 비공개) 프로필 주소 — 방문자에게 핀치 대시보드 링크는
   무의미하므로 앱 404 와 달리 문구만 담백하게 보여준다 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 px-5 text-center">
      <h1 className="text-[20px] font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-[15px] leading-[1.7] text-fg-sub">
        주소가 정확한지 확인해 주세요. 삭제됐거나 아직 공개되지 않은 페이지일 수 있어요.
      </p>
    </main>
  );
}
