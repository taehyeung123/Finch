import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDemoMode } from "@/lib/supabase/config";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { isReservedSlug } from "@/lib/links/reserved";
import { SLUG_RE } from "@/lib/links";
import { safeUrlBase } from "@/lib/links/url-base";

/**
 * 전 페이지 공통 보안 헤더 (PRD PART 13.4·13.5) + Supabase 세션 리프레시.
 * Next.js 16부터 middleware.ts가 proxy.ts로 이름이 바뀌었다.
 * 페이지마다 개별 적용하지 않고 이 한 곳에서 일괄 적용한다.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  /* 세션 갱신이 쿠키와 함께 넘겨주는 «이 응답은 캐시하지 말라» 머리글(@supabase/ssr) — 마지막 응답에 옮겨 단다.
     한 사람의 세션 쿠키가 실린 응답이 CDN·리버스 프록시에 저장돼 남에게 나가는 것을 막는 라이브러리 권고다. */
  let noStoreHeaders: Record<string, string> = {};

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
            setAll: (cookiesToSet, headers) => {
              cookiesToSet.forEach(({ name, value }) =>
                request.cookies.set(name, value),
              );
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options),
              );
              noStoreHeaders = { ...noStoreHeaders, ...(headers ?? {}) };
            },
          },
          /* 서버·브라우저와 같은 속성 — 여기서 빠지면 세션 갱신이 secure 없는 쿠키로 덮어쓴다(2026-09-07 감사) */
          cookieOptions: SESSION_COOKIE_OPTIONS,
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
  const segs = path.split("/");
  const first = segs[1] ?? "";
  /* slug 형식(SLUG_RE — 소문자·숫자·하이픈, 영문·숫자로 시작, 2~30자)에 맞는 첫 조각만 사용자 페이지로 본다.
     점이 든 조각(파일 요청)도 여기서 걸러진다. 예전엔 «점 없음·예약어 아님»이면 전부 리라이트해서, 스캐너가
     두드리는 아무 경로나 페이지 렌더·DB 조회가 됐다 — 창고 도입 뒤로는 그 404 가 창고에 쌓인다(2026-09-11).
     대문자는 아래에서 소문자 주소로 보내므로 소문자로 바꿔 판정한다. 인코딩된 글자(%61)는 slug 가 아니다. */
  const userPage = first !== "" && SLUG_RE.test(first.toLowerCase()) && !isReservedSlug(first);

  /* 옛 주소는 새 주소로 영구 이동 — 이미 뿌려진 /p/… 링크가 안 깨지고, 검색엔진도 새 주소를 정본으로 잡는다.
     GET 만 옮긴다: /dwell 은 keepalive POST 라 리다이렉트가 걸리면 본문이 날아간다. */
  if (path.startsWith("/p/") && request.method === "GET") {
    const to = request.nextUrl.clone();
    to.pathname = path.slice(2);
    const moved = NextResponse.redirect(to, 301);
    response.cookies.getAll().forEach((c) => moved.cookies.set(c));
    applyNoStore(moved, noStoreHeaders);
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
    applyNoStore(moved, noStoreHeaders);
    applySecurityHeaders(moved, true);
    return moved;
  }

  if (userPage) {
    const to = request.nextUrl.clone();
    /* 창고 vs 즉석(2026-09-11) — 공개 프로필의 완성 화면은 Vercel CDN(창고)에 굳혀 모두에게 같은 것을 준다
       (app/p/[slug]/page.tsx). 쿠키에 따라 화면이 달라져야 하는 요청만 매번 새로 그리는 즉석 경로로 보낸다:
       핀치 로그인 세션(주인이면 비공개 미리보기·픽셀 제외) · 비밀번호를 연 쿠키. /go·/vcard·/dwell 은 원래 매번 돈다. */
    const pagePath = isProfilePagePath(segs);
    const live = pagePath && needsLiveRender(request);
    to.pathname = live ? `/p/-live${path}` : `/p${path}`;
    /* ⚠️ 창고 «화면» 요청에만. /go·/vcard 는 쿼리가 곧 데이터다(?i= 항목 번호) — 지우면 갤러리·피드 클릭이 엉뚱한 곳으로 간다 */
    if (pagePath && !live) {
      /* 창고 경로엔 쿼리를 넘기지 않는다 — 첫 방문자의 ?fbclid=…·utm_* 가 렌더 결과(RSC 데이터)에 실려 그 뒤
         모든 방문자에게 나가지 않게. 창고 화면은 쿼리를 쓰지 않는다(?src= 는 브라우저가 주소창에서 읽는다 — view-beacon).
         _rsc 는 Next 클라이언트 라우터의 요청 표식이라 남긴다. */
      for (const k of [...to.searchParams.keys()]) if (k !== "_rsc") to.searchParams.delete(k);
    }
    const rewritten = NextResponse.rewrite(to, { request });
    /* 위 세션 리프레시가 심어 둔 쿠키를 새 응답으로 옮긴다 — 안 옮기면 갱신 토큰이 사라진다 */
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    response = rewritten;
  }

  const publicLink = userPage || path.startsWith("/p/");
  /* 방문자 토큰 쿠키 — 공개 프로필 링크 첫 방문에 여기서 발급한다. 서버 액션(recordView)이 발급하면 Next 가
     액션 응답에 페이지를 통째로 다시 렌더해 첫 방문 비용이 두 배였다(감사3 C4). 값은 임의 토큰이고 DB 엔 해시만 남는다. */
  /* ⚠️ 쿠키 path 에 넣기 **전에** 형식을 본다(2026-09-08 감사). pathname 은 세미콜론을 인코딩하지 않고
     Next 의 Set-Cookie 직렬화도 Path 를 그대로 이어 붙인다 — `/abc;Path=/` 링크 하나로 방문자 토큰이
     오리진 전체에 걸리고, `;Domain=finch.ai.kr` 이면 서브도메인까지 실려 나갔다. 인증이 필요 없는 경로다.
     옛 주소 `/p/{slug}` 로 들어온 방문자도 재방문 판정이 유지되도록 조각을 먼저 고른다 —
     그러지 않으면 first 가 "p" 라 쿠키가 /p 아래에 걸려 새 주소 요청에 안 실린다. */
  const cookieSlug = safeUrlBase(path.startsWith("/p/") ? (path.split("/")[2] ?? "") : first);
  if (publicLink && cookieSlug && !request.cookies.get("finch_lv")) {
    response.cookies.set("finch_lv", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 180,
      /* path 를 **그 페이지 아래로** 좁힌다. 예전엔 /p 하나로 묶였지만 이제 페이지가 루트에 있어
         path=/ 로 두면 앱·마케팅 요청에까지 고정 식별자가 실려 나간다(감사4 최소권한).
         페이지마다 토큰이 갈리는 것은 오히려 낫다 — 페이지 사이를 잇는 식별자가 아예 생기지 않고,
         한 페이지 안의 재방문·체류 판정은 그대로 된다(소비처가 전부 그 페이지 아래다: 액션·/go·/vcard·/dwell). */
      path: `/${cookieSlug}`,
    });
  }
  applyNoStore(response, noStoreHeaders);
  applySecurityHeaders(response, publicLink);
  return response;
}

/* 창고 경로와 무관한 하위 라우트(라우트 핸들러) — app/p/[slug]/go·vcard·dwell. 서브 주소 예약어(links/actions.ts SUB_RESERVED)에 들어 있다 */
const PROFILE_HANDLER_SEGMENTS = new Set(["go", "vcard", "dwell"]);

/** 공개 프로필의 «화면» 주소인가 — /{slug} 또는 /{slug}/{서브}. segs 는 pathname.split("/") */
function isProfilePagePath(segs: string[]): boolean {
  const rest = segs.slice(2).filter(Boolean);
  return rest.length === 0 || (rest.length === 1 && !PROFILE_HANDLER_SEGMENTS.has(rest[0]));
}

/**
 * 쿠키에 따라 화면이 달라져야 하는 요청인가 — 창고본(익명 화면) 대신 즉석 렌더로 보낸다.
 *  · 핀치 로그인 세션: Supabase 세션 쿠키 `sb-{프로젝트}-auth-token`(길면 .0 .1 로 쪼개진다). 주인인지는 모른다 —
 *    그 판정은 즉석 렌더가 DB 로 한다. 로그인한 남의 방문도 여기로 오지만 화면은 익명과 같다(비용만 조금 더 든다).
 *  · 비밀번호를 연 쿠키: `finch_lu_{페이지 id 앞 16자}`(lib/links/password.ts unlockCookieName), path=그 페이지 주소.
 * 값은 보지 않는다(검증은 즉석 렌더의 몫) — 여기서는 «창고 화면이 이 사람에게 맞는가»만 가른다. 틀려도 새는 쪽이 아니다:
 * 가짜 쿠키를 붙이면 즉석 렌더가 검증에 실패해 익명 화면을 그릴 뿐이다.
 */
function needsLiveRender(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => (name.startsWith("sb-") && name.includes("-auth-token")) || name.startsWith("finch_lu_"));
}

/** 세션 갱신이 요구한 캐시 금지 머리글을 붙인다(없으면 아무것도 안 한다) */
function applyNoStore(response: NextResponse, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
}

function applySecurityHeaders(response: NextResponse, publicLink = false) {
  const isDev = process.env.NODE_ENV === "development";

  // Supabase 설정 시 클라이언트 SDK의 auth 요청(fetch)을 위해 해당 오리진만 connect-src에 추가
  const supabaseOrigin = getSupabaseOrigin();
  const sentryOrigin = getSentryIngestOrigin();

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

  /* Cloudflare Web Analytics 비콘 허용은 2026-09-11 에 뺐다 — 그날 Cloudflare 프록시를 끄고(DNS 전용) Vercel 에 직접 연결했다.
     비콘은 Cloudflare 가 프록시할 때 응답 HTML 에 끼워 넣던 것이라, 이제는 실릴 일이 없다.
     프록시를 다시 켜면 비콘이 이 CSP 에 막혀 방문자 콘솔에 오류 한 줄이 남는다(해롭지는 않다) — 그때 script-src 에
     https://static.cloudflareinsights.com, connect-src 에 https://cloudflareinsights.com 을 되돌린다.
     다시 켜기 전에 한국 방문자 경로부터 잴 것: 무료 요금제는 미국 거점으로 돌아 첫 바이트가 5배 느렸다(0.53초 → 끈 뒤 0.1초). */

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
    /* t1.daumcdn.net = 다음 우편번호 SDK **그리고 카카오맵 엔진(mapjsapi — dapi 로더가 2차로 주입)** —
       우편번호를 없애더라도 이 항목을 지우면 지도가 조용히 깨진다(쏘넷 점검, 실측). */
    /* dapi.kakao.com = 카카오맵 JS SDK 로더(지도 블록). 타일 이미지는 img-src https: 가 이미 연다 */
    `script-src 'self' 'unsafe-inline' https://t1.daumcdn.net https://dapi.kakao.com ${toss}${gaScript}${trackerScript}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net",
    // https: 를 통째로 여는 유일한 지시어다. 프로필 링크는 사용자가 **자기 이미지 주소를
    // 붙여넣는** 제품이고(노션·드롭박스·기존 홈페이지에 이미 올려둔 것), 호스트를
    // 열거할 방법이 없다. 이미지는 실행되지 않으므로 여는 대가가 가장 작다.
    `img-src 'self' data: blob: https: ${toss} ${igCdn} ${tiktokCdn}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    /* Sentry 인제스트 — 브라우저 SDK 가 오류 이벤트를 DSN 의 오리진으로 직접 보낸다(터널 라우트를 쓰지 않는다 —
       이벤트마다 Vercel 함수 호출이 붙는 비용을 피한다). DSN 이 없으면 항목도 없다. */
    `connect-src 'self' https://dapi.kakao.com ${toss}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${sentryOrigin ? ` ${sentryOrigin}` : ""}${gaConnect}${trackerConnect}`,
    /* 우편번호 임베드는 실측상 postcode.map.kakao.com 을 프레이밍한다(구 daum.net 도 함께 허용) */
    /* 메타 광고 미리보기 iframe(generatepreviews) — **경로까지** 좁혀 앱 화면에만 연다(공개 프로필엔 열 이유가 없다, 스펙 §13-18).
       리다이렉트로 web./m.facebook.com 이 나오면 그때 넓힌다(실측 항목 §11-12). */
    `frame-src ${toss} ${youtube} ${musicEmbeds} https://postcode.map.daum.net https://postcode.map.kakao.com${publicLink ? "" : " https://www.facebook.com/ads/api/preview_iframe.php"}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  /* 공개 프로필 지면에는 **페이지 주인이 고른 제3자 스크립트·임베드**가 산다(마케팅 픽셀·유튜브·지도).
     그래서 «우리가 안 쓰는 강력한 기능»은 명시적으로 닫아 둔다 — 목록이 짧으면 나머지는 전부 열린 것이다
     (2026-09-07 감사). 우리가 실제로 쓰는 것(클립보드 쓰기 등)은 여기 넣지 않는다. */
  response.headers.set(
    "Permissions-Policy",
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "serial=()",
      "bluetooth=()",
      "midi=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "display-capture=()",
      "idle-detection=()",
      "local-fonts=()",
      "screen-wake-lock=()",
      "xr-spatial-tracking=()",
      "interest-cohort=()",
    ].join(", "),
  );
  // HSTS — HTTPS 전면 강제 (PART 13.4). localhost HTTP에서는 브라우저가 무시한다
  // ⚠️ 같은 값을 vercel.json 의 headers 로도 내보낸다 — proxy 는 matcher 에서 제외한 정적 자산
  //    응답을 못 보기 때문이다(그 경로에는 이 함수가 아예 안 돈다, 2026-09-07 감사).
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

/** Sentry DSN(https://key@oNNN.ingest.us.sentry.io/PID) 의 오리진 — 이벤트 envelope 이 같은 호스트로 간다 */
function getSentryIngestOrigin(): string {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return "";
  try {
    return new URL(dsn).origin;
  } catch {
    return "";
  }
}

export const config = {
  // 정적 자산 제외 — 인증 가드 추가 시에도 CSS/JS/이미지가 막히지 않도록 (proxy 문서 권장 패턴)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|llms.txt|.*\\.(?:svg|png|jpg|webp|ico)$).*)"],
};
