import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDemoMode } from "@/lib/supabase/config";

/**
 * 전 페이지 공통 보안 헤더 (PRD PART 13.4·13.5) + Supabase 세션 리프레시.
 * Next.js 16부터 middleware.ts가 proxy.ts로 이름이 바뀌었다.
 * 페이지마다 개별 적용하지 않고 이 한 곳에서 일괄 적용한다.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // 데모 모드가 아닐 때만 세션 리프레시 (@supabase/ssr 미들웨어 패턴).
  // getUser()가 만료 토큰을 갱신하고, setAll이 갱신된 쿠키를 요청/응답 양쪽에 반영한다.
  // Supabase가 다운돼도 미들웨어가 500을 내지 않도록 try/catch로 감싸 fail-open 한다.
  if (!isDemoMode()) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet) => {
              cookiesToSet.forEach(({ name, value }) =>
                request.cookies.set(name, value),
              );
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options),
              );
            },
          },
        },
      );
      // 인증 판단이 아니라 토큰 갱신 목적 — 판단은 각 레이아웃/라우트에서 getUser()로 수행
      await supabase.auth.getUser();
    } catch (error) {
      console.warn("[proxy] Supabase 세션 리프레시 실패, 통과합니다:", error);
    }
  }

  applySecurityHeaders(response);
  return response;
}

function applySecurityHeaders(response: NextResponse) {
  const isDev = process.env.NODE_ENV === "development";

  // Supabase 설정 시 클라이언트 SDK의 auth 요청(fetch)을 위해 해당 오리진만 connect-src에 추가
  const supabaseOrigin = getSupabaseOrigin();

  // Toss 결제위젯 — SDK 스크립트·위젯 iframe·API 호출이 tosspayments.com 서브도메인에서 이뤄진다
  const toss = "https://*.tosspayments.com";

  // 인스타그램 프로필 사진·게시물 썸네일 CDN (연동 계정 실데이터 표시용)
  const igCdn = "https://*.cdninstagram.com https://*.fbcdn.net";

  // CSP — Pretendard 웹폰트(jsdelivr CDN)만 외부 허용. 개발 모드는 HMR 때문에 unsafe-eval 필요
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${toss}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net",
    `img-src 'self' data: blob: ${toss} ${igCdn}`,
    `connect-src 'self' ${toss}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `frame-src ${toss}`,
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
}

function getSupabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export const config = {
  // 정적 자산 제외 — 인증 가드 추가 시에도 CSS/JS/이미지가 막히지 않도록 (proxy 문서 권장 패턴)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|llms.txt|.*\\.(?:svg|png|jpg|webp|ico)$).*)"],
};
