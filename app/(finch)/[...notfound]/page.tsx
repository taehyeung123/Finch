import { notFound } from "next/navigation";

/* 어느 라우트에도 안 걸린 주소의 전역 404. 루트 레이아웃이 (finch)/p 둘로 갈라진
   뒤에는 전역 not-found 를 받아줄 단일 루트가 없다 — 실험 플래그(globalNotFound)
   대신, 잡히지 않은 경로 전부를 이 캐치올이 받아 (finch)/not-found.tsx 로 보낸다.
   리터럴 세그먼트(/p, /team, /api …)가 항상 이 캐치올보다 먼저 매칭된다.
   ⚠️ 비용: 분리 전의 정적 _not-found 와 달리 미매칭 URL(봇 스캔 포함)마다 (finch) 루트
   레이아웃이 서버 렌더된다 — 지금은 DB 미접근이라 가볍다. 루트 레이아웃에 무거운 걸
   추가할 때 이 경로가 함께 뛴다는 걸 기억할 것(감사4). 대안: experimental globalNotFound. */
export default function CatchAllNotFound(): never {
  notFound();
}
