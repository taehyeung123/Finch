import { VisitorNotFound } from "../_components/visitor-not-found";

/* [slug] 자리에도 경계를 둔다 — 상위 app/p/not-found.tsx 만으로는 이 세그먼트의
   notFound() 가 잡히지 않아, 없는 주소를 연 방문자에게 Next 기본 영어 404
   ("This page could not be found.")가 나갔다(2026-08-25 실측). */
export default function NotFound() {
  return <VisitorNotFound />;
}
