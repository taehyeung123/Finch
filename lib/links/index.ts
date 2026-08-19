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

/**
 * 키 순서에 흔들리지 않는 비교용 직렬화.
 *
 * "편집기에 미저장 내용이 있는가"를 판정하는 데 쓴다. JSON.stringify 를 그냥 쓰면
 * 서버가 돌려준 객체와 화면 객체의 **키 순서**가 달라 내용이 같은데도 다르다고 나온다.
 */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * 글자 수를 **코드포인트 기준**으로 자른다.
 *
 * `String.prototype.slice` 는 UTF-16 코드유닛을 센다. 이모지는 대부분 2유닛이고
 * 🛍️(변형 선택자 포함) 3유닛, 🇰🇷(국기) 4유닛, 👍🏻(피부톤) 4유닛이다.
 * slice(0,2) 를 그대로 쓰면 🛍️ → 🛍(흑백), 🇰🇷 → 🇰 가 되고, 최악은
 * **짝 없는 서로게이트**가 남아 그 값이 DB·JSON 을 오가며 손상된다.
 */
export function sliceChars(raw: string, max: number): string {
  const chars = [...raw];
  return chars.length <= max ? raw : chars.slice(0, max).join("");
}

/**
 * 이니셜 원에 쓸 첫 글자.
 *
 * `charAt(0)` 은 UTF-16 코드유닛 한 개라 "🍰케이크공방" 이면 **서로게이트 반쪽**이
 * 남는다. 그 반쪽은 SSR 직렬화 단계에서 U+FFFD(�)로 확정 변환돼, 브랜드 페이지
 * 머리에 검은 마름모가 박힌다. 코드포인트로 잘라야 한다.
 */
export function initialOf(raw: string): string {
  const first = [...(raw ?? "").trim()][0];
  return first ? first.toUpperCase() : "?";
}

/** 임베드 주소에 그대로 실어도 되는 유튜브 파라미터 — 재생목록·시작 위치 */
const YT_KEEP = ["list", "start", "t"] as const;

/**
 * 유튜브 URL → 임베드 주소. 임베드할 수 없으면 null.
 *
 * 유튜브만 다룬다. 틱톡·인스타는 임베드 정책이 자주 바뀌어 깨진 iframe 이 남는데,
 * 그럴 바에는 "▶ 영상 보러 가기" 링크가 낫다(공개 렌더러가 그렇게 떨어뜨린다).
 *
 * ⚠️ **공개 렌더러와 미리보기가 같은 판정을 써야 한다.** 앞서는 미리보기가 무조건
 * ▶ 상자를 그려서, 임베드가 안 되는 주소도 작성자에게는 재생될 것처럼 보였다.
 *
 * ⚠️ 주소를 **처음부터 다시 조립한다.** 앞서 `/embed/` 경로만 원본을 그대로
 * 돌려줬는데, 그러면 ① 비-www 호스트가 CSP frame-src 에 막혀 빈 카드가 되고
 * ② 원본 쿼리스트링이 통째로 iframe src 에 실린다. 화이트리스트한 파라미터만 옮긴다.
 *
 * 호스트는 항상 **youtube-nocookie.com** 이다 — 방문자는 이 페이지 주인의 손님이지
 * 구글에 쿠키를 받으러 온 사람이 아니다. CSP frame-src 도 이 오리진만 연다(proxy.ts).
 */
export function youtubeEmbed(raw: string): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.replace(/^www\./, "");
  let id: string | null = null;
  let series = false;

  if (host === "youtu.be") {
    id = u.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg[0] === "shorts" || seg[0] === "live" || seg[0] === "v") id = seg[1] ?? null;
    else if (seg[0] === "embed") {
      /* 재생목록 임베드는 영상 id 가 없다 — list 파라미터가 본체다 */
      if (seg[1] === "videoseries") series = true;
      else id = seg[1] ?? null;
    } else id = u.searchParams.get("v");
  } else {
    return null;
  }

  if (series) {
    const list = u.searchParams.get("list");
    if (!list || !/^[A-Za-z0-9_-]{2,64}$/.test(list)) return null;
    return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`;
  }

  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;

  const out = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  for (const k of YT_KEEP) {
    const v = u.searchParams.get(k);
    if (v && /^[A-Za-z0-9_-]{1,64}$/.test(v)) out.searchParams.set(k, v);
  }
  return out.toString();
}
