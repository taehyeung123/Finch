/*
  루트에서 쓸 수 없는 이름 — 프로필 링크가 `finch.ai.kr/{slug}` 로 나가면서 생긴 목록.

  2026-08-25 이전에는 `/p/{slug}` 였고, 예약어는 **사칭 방지**만 했다(/p/admin 같은 주소가
  공식 페이지처럼 읽히는 것). 이제는 사용자 주소와 제품 주소가 **같은 이름 공간**을 쓴다 —
  이 목록이 안전장치다.

  ⚠️ **새 라우트를 만들면 여기에도 넣는다.** Next.js 는 정적 경로가 동적 경로를 이기므로,
  누군가 이미 `events` 를 쓰고 있는데 `app/(finch)/(app)/events/` 를 만들면 **그 사람 페이지가
  조용히 가려진다**. 반대로 여기 있는 이름은 애초에 사용자가 못 잡는다.
  scripts 없이도 확인할 수 있게, 목록은 `app/` 디렉터리 구조와 1:1로 맞춰 적어 둔다.
*/

/** app/(finch)/(marketing)/ 아래 공개 페이지 */
const MARKETING = ["brand", "goodbye", "instagram", "pricing", "privacy", "reference", "terms", "threads", "tiktok"];

/** app/(finch)/(app)/ 아래 로그인 화면 (구 경로 스텁 포함) */
const APP = [
  "ads", "analyze", "audience", "auto-dm", "competitors", "dashboard", "discover",
  "growth", "insights", "library", "links", "notifications", "publish", "reports",
  "scrap", "settings", "studio", "support",
];

/*
  라우트 핸들러·시스템 경로.

  ⚠️ 여기엔 **slug 가 될 수 없는 이름도 있다**(`_next`·`_fonts`·점 있는 파일들). 이 목록은 두 가지 일을 한다:
   ① proxy 의 «리라이트할 경로인가» 판정 — `/_next/data/…` 같은 요청이 사용자 페이지로 새면 안 된다
   ② validateSlug 의 «이 이름을 잡을 수 있나» 판정
  ①만 필요한 이름(언더스코어·점)은 형식 규칙(SLUG_RE)이 이미 막으므로 DB 예약어(0066)에는 넣지 않는다 —
  두 목록이 글자 그대로 같지 않은 것은 **의도된 것**이다(소넷 점검에서 불일치로 보고돼 여기 적어 둔다).
*/
const SYSTEM = ["api", "auth", "p", "_next", "_fonts", "onboarding", "robots.txt", "sitemap.xml", "icon.svg", "favicon.ico", "llms.txt"];

/** 사칭 방지 — 라우트는 없지만 공식 페이지처럼 읽히는 이름(구 RESERVED 를 흡수) */
const IMPERSONATION = [
  "admin", "app", "login", "logout", "signup", "signin", "help", "billing",
  "official", "team", "about", "contact", "root", "system", "static", "assets",
  "public", "new", "edit", "delete", "null", "undefined", "finch", "me", "my",
];

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([...MARKETING, ...APP, ...SYSTEM, ...IMPERSONATION]);

/** 루트 첫 조각이 제품 주소인가 — proxy 의 리라이트 판정과 slug 검증이 같은 함수를 쓴다 */
export function isReservedSlug(first: string): boolean {
  return RESERVED_SLUGS.has(first.toLowerCase());
}
