import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDemoMode } from "@/lib/supabase/config";
import { isReservedSlug } from "@/lib/links/reserved";

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

  /* ── 공개 프로필 링크 주소 (2026-08-25) ────────────────────────────────────
     리틀리처럼 `finch.ai.kr/{slug}` 로 나간다. 파일은 그대로 app/p/[slug] 아래 두고
     여기서 **리라이트**만 한다 — 라우트를 옮기면 레이아웃 분리(GA·다크 스크립트 없는 방문자 루트)와
     /go·/vcard·/dwell 하위 경로까지 전부 따라 옮겨야 한다.

     ⚠️ 이제 사용자 주소와 제품 주소가 같은 이름 공간이다. 첫 조각이 예약어면 제품 페이지,
     아니면 사용자 페이지다(lib/links/reserved.ts — 새 라우트를 만들면 그 목록에도 넣을 것). */
  const path = request.nextUrl.pathname;
  const first = path.split("/")[1] ?? "";
  /* 점이 든 조각은 파일 요청이다(예: /foo.png) — 매처가 흔한 확장자는 이미 걸러내지만 나머지도 넘기지 않는다 */
  const userPage = first !== "" && !first.includes(".") && !isReservedSlug(first);

  /* 옛 주소는 새 주소로 영구 이동 — 이미 뿌려진 /p/… 링크가 안 깨지고, 검색엔진도 새 주소를 정본으로 잡는다.
     GET 만 옮긴다: /dwell 은 keepalive POST 라 리다이렉트가 걸리면 본문이 날아간다. */
  if (path.startsWith("/p/") && request.method === "GET") {
    const to = request.nextUrl.clone();
    to.pathname = path.slice(2);
    const moved = NextResponse.redirect(to, 301);
    response.cookies.getAll().forEach((c) => moved.cookies.set(c));
    applySecurityHeaders(moved, true);
    return moved;
  }

  /* 대문자가 섞인 주소는 소문자 정본으로 보낸다 — slug 는 소문자로만 만들어지므로
     `/Finch-Demo` 는 지금까지 그냥 404 였다(실측). 명함·인쇄물에 문장부호 감각으로 대문자를
     섞어 적는 일이 흔하고, 받아 적는 사람도 그렇게 친다. 예약어 판정은 이미 소문자로 비교하니
     여기서 주소만 맞춰 주면 된다. GET 만 옮긴다 — 옛 /p/ 처리와 같은 이유(POST 본문 보존). */
  if (userPage && first !== first.toLowerCase() && request.method === "GET") {
    const to = request.nextUrl.clone();
    to.pathname = `/${first.toLowerCase()}${path.slice(1 + first.length)}`;
    const moved = NextResponse.redirect(to, 301);
    response.cookies.getAll().forEach((c) => moved.cookies.set(c));
    applySecurityHeaders(moved, true);
    return moved;
  }

  if (userPage) {
    const to = request.nextUrl.clone();
    to.pathname = `/p${path}`;
    const rewritten = NextResponse.rewrite(to, { request });
    /* 위 세션 리프레시가 심어 둔 쿠키를 새 응답으로 옮긴다 — 안 옮기면 갱신 토큰이 사라진다 */
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    response = rewritten;
  }

  const publicLink = userPage || path.startsWith("/p/");
  /* 방문자 토큰 쿠키 — 공개 프로필 링크 첫 방문에 여기서 발급한다. 서버 액션(recordView)이 발급하면 Next 가
     액션 응답에 페이지를 통째로 다시 렌더해 첫 방문 비용이 두 배였다(감사3 C4). 값은 임의 토큰이고 DB 엔 해시만 남는다. */
  if (publicLink && !request.cookies.get("finch_lv")) {
    response.cookies.set("finch_lv", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 180,
      /* path 를 **그 페이지 아래로** 좁힌다. 예전엔 /p 하나로 묶였지만 이제 페이지가 루트에 있어
         path=/ 로 두면 앱·마케팅 요청에까지 고정 식별자가 실려 나간다(감사4 최소권한).
         페이지마다 토큰이 갈리는 것은 오히려 낫다 — 페이지 사이를 잇는 식별자가 아예 생기지 않고,
         한 페이지 안의 재방문·체류 판정은 그대로 된다(소비처가 전부 그 페이지 아래다: 액션·/go·/vcard·/dwell). */
      path: `/${first}`,
    });
  }
  applySecurityHeaders(response, publicLink);
  return response;
}

function applySecurityHeaders(response: NextResponse, publicLink = false) {
  const isDev = process.env.NODE_ENV === "development";

  // Supabase 설정 시 클라이언트 SDK의 auth 요청(fetch)을 위해 해당 오리진만 connect-src에 추가
  const supabaseOrigin = getSupabaseOrigin();

  // Toss 결제위젯 — SDK 스크립트·위젯 iframe·API 호출이 tosspayments.com 서브도메인에서 이뤄진다
  const toss = "https://*.tosspayments.com";

  // 인스타그램·Threads 프로필 사진·게시물 썸네일 CDN (연동 계정 실데이터 표시용).
  // Threads는 인스타그램과 같은 Meta 미디어 인프라(cdninstagram.com/fbcdn.net)를 공유해 별도 도메인 추가가 불필요하다.
  const igCdn = "https://*.cdninstagram.com https://*.fbcdn.net";

  // TikTok 프로필 사진 CDN. 공식 문서에 정확한 CDN 호스트명이 명시돼 있지 않다(avatar_url이
  // user.info API 응답마다 서명된 전체 URL로 내려오는 방식) — TikTok이 실제로 쓰는 것으로 널리
  // 확인되는 도메인 패턴만 최소 허용한다. TODO: 첫 테스터 계정 연동 후 실제 avatar_url 호스트를
  // 로그로 확인해 필요시 이 목록을 좁히거나 보정할 것 (docs/REAL_API_SPEC.md 6절).
  const tiktokCdn = "https://*.tiktokcdn.com https://*.tiktokcdn-us.com";

  // GA4 트래픽 계측 — 측정 ID 설정 시에만 구글 태그매니저/애널리틱스 오리진 허용
  const gaConfigured = Boolean(process.env.NEXT_PUBLIC_GA_ID);
  const gaScript = gaConfigured ? " https://www.googletagmanager.com" : "";
  const gaConnect = gaConfigured
    ? " https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com"
    : "";

  // 공개 프로필 링크(/p/{slug}) 의 「동영상」 블록이 유튜브를 iframe 으로 띄운다.
  // 이게 없으면 **제대로 인식된 유튜브 URL 만** 빈 상자가 된다 — 임베드를 못 만드는
  // 주소는 링크 버튼으로 빠져 멀쩡하다. 편집기 미리보기도 항상 ▶ 상자를 그려서
  // 작성자는 발행 전에 눈치챌 수 없었다. (틱톡은 임베드하지 않는다 —
  //  block-renderer.tsx 가 링크 버튼으로 폴백한다.)
  //
  // **nocookie 오리진만 연다.** lib/links 의 youtubeEmbed 가 주소를 항상 이쪽으로
  // 다시 조립하므로 www.youtube.com 은 쓰이지 않는다. 방문자는 이 페이지 주인의
  // 손님이지 구글에 쿠키를 받으러 온 사람이 아니다.
  const youtube = "https://www.youtube-nocookie.com";
  /* 프로필 링크 「음악」 블록 임베드(리틀리 흡수 4단계) — 스포티파이·사운드클라우드 */
  const musicEmbeds = "https://open.spotify.com https://w.soundcloud.com";

  // 프로필 링크 「마케팅 연결」(6단계) — 주인이 GA4·Meta 픽셀·TikTok 픽셀 ID 를 넣으면 /p/{slug} 에 스크립트가 실린다.
  // 공개 페이지 경로에만 연다 — 앱 화면엔 남의 픽셀이 들어올 자리가 없다. ID 가 없는 페이지엔 스크립트 자체가 없다.
  const trackerScript = publicLink ? " https://www.googletagmanager.com https://connect.facebook.net https://analytics.tiktok.com" : "";
  const trackerConnect = publicLink
    ? " https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.facebook.com https://analytics.tiktok.com"
    : "";

  // CSP — Pretendard 웹폰트(jsdelivr CDN)만 외부 허용. 개발 모드는 HMR 때문에 unsafe-eval 필요
  const csp = [
    "default-src 'self'",
    /* t1.daumcdn.net = 다음 우편번호 SDK(편집기 지도 블록 주소 검색) — 없으면 모달이 소리 없이 빈 상자다 */
    `script-src 'self' 'unsafe-inline' https://t1.daumcdn.net ${toss}${gaScript}${trackerScript}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net",
    // https: 를 통째로 여는 유일한 지시어다. 프로필 링크는 사용자가 **자기 이미지 주소를
    // 붙여넣는** 제품이고(노션·드롭박스·기존 홈페이지에 이미 올려둔 것), 호스트를
    // 열거할 방법이 없다. 이미지는 실행되지 않으므로 여는 대가가 가장 작다.
    `img-src 'self' data: blob: https: ${toss} ${igCdn} ${tiktokCdn}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `connect-src 'self' ${toss}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${gaConnect}${trackerConnect}`,
    /* 우편번호 임베드는 실측상 postcode.map.kakao.com 을 프레이밍한다(구 daum.net 도 함께 허용) */
    `frame-src ${toss} ${youtube} ${musicEmbeds} https://postcode.map.daum.net https://postcode.map.kakao.com`,
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
