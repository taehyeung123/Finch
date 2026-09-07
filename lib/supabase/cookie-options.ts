import type { CookieOptions } from "@supabase/ssr";

/*
  세션 쿠키 속성 — **세 곳이 같은 값을 써야 한다**(서버·프록시·브라우저).
  한 곳만 넘기면 다른 쪽 갱신이 그 속성을 덮어써서 조용히 원래대로 돌아간다.

  왜 필요한가(2026-09-07 감사): @supabase/ssr 의 기본값에는 `secure` 가 없다. 그래서 로그인 세션 쿠키가
  평문 HTTP 요청에도 실려 나갔다 — 중간자 위치만 잡으면 XSS 없이 세션을 가져갈 수 있고, 쿠키 수명이 400일이라
  한 번 잡히면 오래 쓴다. HSTS 가 방어의 전부였는데 그건 «이미 한 번 https 로 방문한 브라우저»에만 걸린다.

  개발(localhost)은 http 라 secure 를 켜면 로그인이 아예 안 된다 — 프로덕션에서만 켠다.
  httpOnly 는 여기서 정하지 않는다: @supabase/ssr 이 서버 쿠키에 이미 걸고, 브라우저 클라이언트는
  document.cookie 로 쓰기 때문에 애초에 httpOnly 를 걸 수 없다(그쪽은 라이브러리 설계다).
*/
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
