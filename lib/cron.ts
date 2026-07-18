/**
 * Vercel Cron 인증 — Vercel은 CRON_SECRET 환경변수가 설정돼 있으면
 * 크론 호출에 Authorization: Bearer <CRON_SECRET> 헤더를 붙인다.
 * 시크릿 미설정이면 크론 라우트는 동작을 거부한다(공개 URL로 아무나 트리거하는 것 방지).
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
