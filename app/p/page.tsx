import { notFound } from "next/navigation";

/* /p 단독(슬러그 없음)은 존재하지 않는 주소다. 여기서 안 잡으면 (finch)/[...notfound]
   캐치올로 떨어져 — 방문자 404 가 아니라 GA·다크 스크립트가 실린 핀치 앱 404 가
   나간다(소넷 점검, 프로덕션 재현 확인). p 서브트리 안에서 잡아야
   app/p/layout.tsx + app/p/not-found.tsx 를 탄다. */
export default function BarePublicIndex(): never {
  notFound();
}
