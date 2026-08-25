/*
  방문자용 404 — 없는 주소·삭제된 페이지·아직 공개 안 한 페이지.

  핀치 앱 404(app/(finch)/not-found.tsx)와 일부러 다르다. 여기는 페이지 주인의 손님이
  서 있는 자리라, 「대시보드로」 같은 핀치 내부 링크는 무의미하고 GA·다크 스크립트도 없다.

  ⚠️ 이 파일은 **여러 세그먼트의 not-found.tsx 가 같이 쓴다.** 루트 레이아웃이 둘로 갈린 뒤
  (app/(finch) 와 app/p), notFound() 의 경계가 상위로 안 올라가는 자리가 생겨
  세그먼트마다 not-found.tsx 를 두고 여기로 모았다 — 문구가 갈라지지 않게.
*/
export function VisitorNotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 px-5 text-center">
      <h1 className="text-[20px] font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-[15px] leading-[1.7] text-fg-sub">
        주소가 정확한지 확인해 주세요. 삭제됐거나 아직 공개되지 않은 페이지일 수 있어요.
      </p>
    </main>
  );
}
