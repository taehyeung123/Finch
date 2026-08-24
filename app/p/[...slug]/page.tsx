import { notFound } from "next/navigation";

/* [slug] 404 분기의 문구와 통일 — 제목 없는 404 는 탭·미리보기에 날 URL 이 뜬다(감사4) */
export const metadata = { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };

/* /p/{slug}/{잉여 세그먼트…} — 잘린 공유 링크·봇 스캔이 실제로 만드는 모양이다.
   [slug](한 세그먼트)에 안 걸리는 /p/* 전부를 여기서 받아 방문자 404 로 보낸다.
   이게 없으면 (finch)/[...notfound] 로 떨어져 핀치 앱 404(GA·다크 스크립트 포함)가
   방문자 브랜드 주소에 나간다(소넷 점검, 프로덕션 재현 확인).
   /p/{slug}/go·vcard 같은 실제 하위 라우트는 리터럴 세그먼트라 항상 이보다 먼저 매칭된다.
   폴더 이름이 [slug] 와 같은 것은 의도다 — 같은 위치의 동적 세그먼트는 이름이 달라지면 빌드 에러다. */
export default function PublicCatchAll(): never {
  notFound();
}
