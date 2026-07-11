import { NextResponse } from "next/server";

/**
 * 전 페이지 공통 보안 헤더 (PRD PART 13.4·13.5).
 * Next.js 16부터 middleware.ts가 proxy.ts로 이름이 바뀌었다.
 * 페이지마다 개별 적용하지 않고 이 한 곳에서 일괄 적용한다.
 */
export function proxy() {
  const response = NextResponse.next();

  const isDev = process.env.NODE_ENV === "development";

  // CSP — Pretendard 웹폰트(jsdelivr CDN)만 외부 허용. 개발 모드는 HMR 때문에 unsafe-eval 필요
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // HSTS — HTTPS 전면 강제 (PART 13.4). localhost HTTP에서는 브라우저가 무시한다
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");

  return response;
}

export const config = {
  // 정적 자산 제외 — 인증 가드 추가 시에도 CSS/JS/이미지가 막히지 않도록 (proxy 문서 권장 패턴)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|llms.txt|.*\\.(?:svg|png|jpg|webp|ico)$).*)"],
};
