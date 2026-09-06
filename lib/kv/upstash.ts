import "server-only";
import { Redis } from "@upstash/redis";

/*
  Upstash Redis(REST) — 서버 전용 얇은 진입점.

  쓰는 곳: 프로필 링크 방문 집계 버퍼(app/p/[slug]/actions.ts → lib/links/views.ts, /api/cron/flush-views).
  환경변수: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Vercel 마켓플레이스로 만들면 이름이
  KV_REST_API_URL / KV_REST_API_TOKEN 로 들어오므로 그것도 읽는다.

  규칙:
  - 둘 다 없으면 null. 호출측은 «KV 없음 = 지금 방식(DB 직접 기록)» 으로 동작해야 하고, 이 파일은 절대 throw 하지 않는다.
  - 모듈 싱글턴 — 서버리스 인스턴스가 살아 있는 동안 재사용한다(연결이 아니라 fetch 지만 객체 생성은 줄인다).
  - 재시도는 1회로 줄인다 — 기본 5회(지수 백오프)는 방문자 요청 안에서 돌기엔 길다. 실패하면 호출측이 DB 로 폴백한다.
  - 요청마다 2.5초 타임아웃 — «오류»가 아니라 «멈춤»은 try/catch 폴백을 못 탄다. 함수형 signal 이어야 요청마다 새 신호가
    만들어지고 abort 가 throw 로 나온다(신호 객체 하나를 넘기면 abort 뒤 가짜 200 으로 바뀐다 — SDK 소스, 설계 검토).
*/
let cached: Redis | null | undefined;

export function getKv(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  cached =
    url && token
      ? new Redis({ url, token, retry: { retries: 1, backoff: () => 150 }, signal: () => AbortSignal.timeout(2500) })
      : null;
  return cached;
}

export function isKvConfigured(): boolean {
  return getKv() !== null;
}
