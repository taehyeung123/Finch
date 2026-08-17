/*
  프로필 링크 공용 규칙 — 서버·클라이언트 양쪽이 같은 판정을 써야 하는 것들.

  slug 검증을 화면과 서버가 따로 구현하면 반드시 갈린다. 여기 한 곳에 둔다.
  (DB 도 같은 정규식을 check 제약으로 갖고 있다 — 0045. 3중이지만 각각 다른
   이유로 필요하다: 화면은 즉시 피드백, 서버는 신뢰 경계, DB 는 최후 방어.)
*/

/** 소문자·숫자·하이픈, 2~30자, 하이픈으로 시작 불가 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;

/**
 * 못 쓰는 slug.
 *
 * /p/{slug} 라는 별도 프리픽스를 쓰므로 앱 라우트와는 충돌하지 않는다. 그래도
 * 막는 이유는 **사칭**이다: /p/admin, /p/support, /p/login 같은 주소는 핀치가
 * 운영하는 공식 페이지처럼 읽힌다. 누가 먼저 잡느냐의 문제가 되면 안 된다.
 */
const RESERVED = new Set([
  "admin", "api", "app", "auth", "login", "logout", "signup", "signin",
  "settings", "support", "help", "billing", "pricing", "terms", "privacy",
  "finch", "official", "team", "about", "contact", "root", "system",
  "static", "assets", "public", "new", "edit", "delete", "null", "undefined",
]);

export type SlugError = "format" | "reserved" | null;

export function validateSlug(raw: string): SlugError {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return "format";
  if (RESERVED.has(slug)) return "reserved";
  return null;
}

export const SLUG_MESSAGES: Record<Exclude<SlugError, null>, string> = {
  format: "영문 소문자·숫자·하이픈만 쓸 수 있어요 (2~30자, 하이픈으로 시작 불가).",
  reserved: "이 주소는 쓸 수 없어요. 다른 주소를 입력해 주세요.",
};

/**
 * 링크 URL 정규화 — 사람이 붙여넣는 값은 대개 스킴이 없다.
 *
 * ⚠️ **http(s) 만 통과시킨다.** javascript:·data: 를 그대로 두면 공개 페이지의
 * <a href> 가 방문자 브라우저에서 그걸 실행한다(저장형 XSS). DB check 제약도
 * 같은 규칙을 갖지만, 여기서 걸러야 사용자가 이유를 알 수 있다.
 */
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) ? v : `https://${v}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

/** 공개 주소 — 화면 여러 곳에서 만들어 쓰므로 한 곳에서 조립한다 */
export function publicLinkUrl(slug: string, origin?: string): string {
  const base = origin ?? "https://finch.ai.kr";
  return `${base.replace(/\/$/, "")}/p/${slug}`;
}
