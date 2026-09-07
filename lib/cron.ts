/* 시크릿(CRON_SECRET)을 읽는 모듈이다 — 이 한 줄이 있으면 클라이언트 그래프에 닿는 순간 **빌드가 실패한다.**
   경계를 사람의 주의력이 아니라 빌드가 지키게 한다(2026-09-07 감사: 같은 저장소의 다른 6개 모듈에는 이미 있었다). */
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { consoleErrorThrottled } from "@/lib/monitoring/log-throttle";

/**
 * Vercel Cron 인증 — Vercel은 CRON_SECRET 환경변수가 설정돼 있으면
 * 크론 호출에 Authorization: Bearer <CRON_SECRET> 헤더를 붙인다.
 * 시크릿 미설정이면 크론 라우트는 동작을 거부한다(공개 URL로 아무나 트리거하는 것 방지).
 *
 * 두 가지를 2026-09-07 감사에서 고쳤다:
 *  ① 비교가 `===` 였다 — 문자열 비교는 첫 불일치에서 끊기므로 응답 시간에 «몇 글자까지 맞았는지»가
 *     실린다. 네트워크 잡음에 묻힐 만큼 작은 신호지만, 같은 저장소의 다른 검증
 *     (lib/links/password.ts unlockTokenMatches)은 이미 timingSafeEqual 을 쓴다 — 기준을 맞춘다.
 *  ② 401 이 로그를 한 줄도 안 남겼다 — 시크릿 브루트포스나 크론 URL 탐색을 **감지할 수단이 없었다.**
 *     공격자가 로그를 채우지 못하게 스로틀을 걸어 남긴다(내용은 남기지 않는다 — 시크릿 조각이 로그에 실린다).
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(want, "utf8");
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    /* 경로만 남긴다 — 어떤 크론이 두들겨지는지는 조사에 필요하고, 헤더 값은 절대 남기지 않는다 */
    let path = "?";
    try {
      path = new URL(request.url).pathname;
    } catch {
      /* URL 파싱 실패는 경로 미상으로 둔다 */
    }
    consoleErrorThrottled("cron.unauthorized", 10 * 60 * 1000, "[cron] 인증 실패 요청:", path);
  }
  return ok;
}
