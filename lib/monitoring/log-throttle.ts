/*
  같은 종류의 console.error 를 인스턴스당 일정 간격으로만 남긴다.

  Sentry 가 서버 console.error 를 전부 이벤트로 올리므로(sentry.server.config.ts), 방문마다 도는 핫패스에서
  DB 장애 한 번이 «요청 수만큼의 이벤트»가 되면 무료 한도(월 5천)가 그 장애 하나로 끝난다(소넷 점검 #3).
  키별로 마지막 기록 시각을 기억한다 — 서버리스 인스턴스마다 따로지만, 목적이 «절대 수 억제»라 그걸로 충분하다.
*/
const lastAt = new Map<string, number>();

/**
 * 공격자가 통제하는 문자열을 로그에 넣기 전에 **한 줄로 눌러 자른다.**
 *
 * 왜(2026-09-07 감사): 인증 «전» 경로(OAuth 콜백 4개)가 쿼리스트링 값을 그대로 console.error 로 흘렸다.
 * 두 가지가 문제였다. ① 개행·탭을 그대로 실으면 로그를 위조할 수 있다(가짜 줄을 만들어 낸다).
 * ② 매번 내용이 다르면 Sentry 의 dedupe 가 «직전과 같은 것»만 버리므로 통과한다 —
 * 무료 한도(월 5천)를 외부인이 마음대로 태워 **감지 능력 자체를 끌 수 있었다.**
 * 길이를 자르고 개행을 없애면 위조가 막히고 메시지 다양성도 죽어 dedupe 가 실제로 일한다.
 */
export function flatten(v: string | null | undefined, max = 120): string {
  return (v ?? "").replace(/[\r\n\t]+/g, " ").slice(0, max);
}

export function consoleErrorThrottled(key: string, everyMs: number, ...args: unknown[]): void {
  const now = Date.now();
  if (now - (lastAt.get(key) ?? 0) < everyMs) return;
  if (lastAt.size > 200) lastAt.clear();
  lastAt.set(key, now);
  console.error(...args, `(같은 종류는 ${Math.max(1, Math.round(everyMs / 60_000))}분에 한 번만 기록)`);
}
