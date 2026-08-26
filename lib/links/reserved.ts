/*
  루트에서 쓸 수 없는 이름 — 프로필 링크가 `finch.ai.kr/{slug}` 로 나가면서 생긴 목록.

  2026-08-25 이전에는 `/p/{slug}` 였고, 예약어는 **사칭 방지**만 했다(/p/admin 같은 주소가
  공식 페이지처럼 읽히는 것). 이제는 사용자 주소와 제품 주소가 **같은 이름 공간**을 쓴다 —
  이 목록이 안전장치다.

  ⚠️ **새 라우트를 만들면 여기에도 넣는다.** Next.js 는 정적 경로가 동적 경로를 이기므로,
  누군가 이미 `events` 를 쓰고 있는데 `app/(finch)/(app)/events/` 를 만들면 **그 사람 페이지가
  조용히 가려진다**. 반대로 여기 있는 이름은 애초에 사용자가 못 잡는다.
  scripts 없이도 확인할 수 있게, 라우트 그룹들은 `app/`·`public/` 디렉터리 구조와 1:1로 맞춰
  적어 둔다. 라우트 없는 그룹(사칭·인프라)은 2026-08-26 쏘넷 공격 점검으로 고른 것 —
  **예약어 하나가 사용자 이름 하나를 뺏으므로**, 셀러가 실제로 쓸 낱말(shop·store·cafe·event
  등)은 일부러 넣지 않았다. 그 근거는 커밋 메시지와 점검 기록에 있다.
*/

/** app/(finch)/(marketing)/ 아래 공개 페이지 (+ PRD PART 13.2 가 URL 예시로 명시한 예정 라우트 features) */
const MARKETING = ["brand", "features", "goodbye", "instagram", "pricing", "privacy", "reference", "terms", "threads", "tiktok"];

/** app/(finch)/(app)/ 아래 로그인 화면 (구 경로 스텁 포함) */
const APP = [
  "ads", "analyze", "audience", "auto-dm", "competitors", "dashboard", "discover",
  "growth", "insights", "library", "links", "notifications", "publish", "reports",
  "scrap", "settings", "studio", "support",
];

/** 실제 라우트가 있는 인증·팀 화면 — app/(finch)/(auth-split)/login·signup, app/(finch)/team */
const AUTH_ROUTES = ["login", "signup", "team"];

/*
  라우트 핸들러·시스템 경로 (+ public/ 루트 디렉터리 — 정적 자산도 같은 이름 공간을 점유한다).

  ⚠️ 여기엔 **slug 가 될 수 없는 이름도 있다**(`_next`·`_fonts`·점 있는 파일들). 이 목록은 두 가지 일을 한다:
   ① proxy 의 «리라이트할 경로인가» 판정 — `/_next/data/…` 같은 요청이 사용자 페이지로 새면 안 된다
   ② validateSlug 의 «이 이름을 잡을 수 있나» 판정
  DB 예약어(0066·0068)에서 뺀 것은 **언더스코어 이름(_next·_fonts) 둘뿐**이다 — 점 있는 이름·1글자 p 는
  형식 규칙(SLUG_RE, DB 0045 check)로도 막히지만 DB 에 방어적으로 남겨 둔다. 두 목록이 글자 그대로
  같지 않은 것은 의도된 것이다(쏘넷 점검이 두 번 불일치로 보고해 여기 못 박아 둔다).
*/
const SYSTEM = [
  "api", "auth", "p", "go", "oauth", "_next", "_fonts", "onboarding", "samples",
  "robots.txt", "sitemap.xml", "icon.svg", "favicon.ico", "llms.txt",
];

/** 사칭 방지 — 라우트는 없지만 공식 페이지처럼 읽히는 이름(구 RESERVED 를 흡수, 2026-08-26 확장) */
const IMPERSONATION = [
  "admin", "app", "logout", "signin", "help", "billing",
  "official", "about", "contact", "root", "system", "static", "assets",
  "public", "new", "edit", "delete", "null", "undefined", "finch", "me", "my", "sns",
  // 한국 웹 관례(고객센터·게시판·계정) — finch.ai.kr/{이름} 이 공식 화면으로 읽힌다
  "cs", "notice", "qna", "faq", "mypage", "join",
  // 계정·결제·보안 피싱의 정석 이름들
  "account", "verify", "password", "payment", "pay", "security", "abuse", "legal",
  "unsubscribe", "report", "invite", "download", "partners",
];

/** 웹 인프라 관례 — 사용자에게 내줘 봐야 스쿼팅 가치뿐인 이름들 */
const INFRA = [
  "www", "mail", "cdn", "blog", "docs", "status",
  "dev", "test", "staging", "beta", "demo", "mobile",
];

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  ...MARKETING, ...APP, ...AUTH_ROUTES, ...SYSTEM, ...IMPERSONATION, ...INFRA,
]);

/** 루트 첫 조각이 제품 주소인가 — proxy 의 리라이트 판정과 slug 검증이 같은 함수를 쓴다 */
export function isReservedSlug(first: string): boolean {
  return RESERVED_SLUGS.has(first.toLowerCase());
}

/**
 * 브랜드 사칭 프리픽스 — finch-official·finchpay 처럼 「핀치의 공식 무엇」으로 읽히는 주소.
 * 새 주소 취득만 막는다(validateSlug 경유) — isReservedSlug 에 넣지 않는 이유는 proxy 가
 * 그 함수로 리라이트를 판정하기 때문이다: 여기 넣으면 기존 finch-* 페이지(데모 finch-demo 포함)가
 * 라우트에서 통째로 404 가 된다. 취득 관문과 라우팅 판정은 계층이 다르다.
 */
export function isBrandImpersonation(slug: string): boolean {
  return slug.replace(/-/g, "").startsWith("finch");
}
