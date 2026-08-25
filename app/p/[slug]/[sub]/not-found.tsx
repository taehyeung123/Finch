import { VisitorNotFound } from "../../_components/visitor-not-found";

/* 서브 페이지도 같은 이유로 자기 경계를 갖는다([slug]/not-found.tsx 주석 참조) */
export default function NotFound() {
  return <VisitorNotFound />;
}
