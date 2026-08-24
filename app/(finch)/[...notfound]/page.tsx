import { notFound } from "next/navigation";

/* 어느 라우트에도 안 걸린 주소의 전역 404. 루트 레이아웃이 (finch)/p 둘로 갈라진
   뒤에는 전역 not-found 를 받아줄 단일 루트가 없다 — 실험 플래그(globalNotFound)
   대신, 잡히지 않은 경로 전부를 이 캐치올이 받아 (finch)/not-found.tsx 로 보낸다.
   리터럴 세그먼트(/p, /team, /api …)가 항상 이 캐치올보다 먼저 매칭된다. */
export default function CatchAllNotFound(): never {
  notFound();
}
