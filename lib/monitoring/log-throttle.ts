/*
  같은 종류의 console.error 를 인스턴스당 일정 간격으로만 남긴다.

  Sentry 가 서버 console.error 를 전부 이벤트로 올리므로(sentry.server.config.ts), 방문마다 도는 핫패스에서
  DB 장애 한 번이 «요청 수만큼의 이벤트»가 되면 무료 한도(월 5천)가 그 장애 하나로 끝난다(소넷 점검 #3).
  키별로 마지막 기록 시각을 기억한다 — 서버리스 인스턴스마다 따로지만, 목적이 «절대 수 억제»라 그걸로 충분하다.
*/
const lastAt = new Map<string, number>();

export function consoleErrorThrottled(key: string, everyMs: number, ...args: unknown[]): void {
  const now = Date.now();
  if (now - (lastAt.get(key) ?? 0) < everyMs) return;
  if (lastAt.size > 200) lastAt.clear();
  lastAt.set(key, now);
  console.error(...args, `(같은 종류는 ${Math.max(1, Math.round(everyMs / 60_000))}분에 한 번만 기록)`);
}
