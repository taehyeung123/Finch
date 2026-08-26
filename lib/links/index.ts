/*
  프로필 링크 공용 규칙 — 서버·클라이언트 양쪽이 같은 판정을 써야 하는 것들.

  slug 검증을 화면과 서버가 따로 구현하면 반드시 갈린다. 여기 한 곳에 둔다.
  (DB 도 같은 정규식을 check 제약으로 갖고 있다 — 0045. 3중이지만 각각 다른
   이유로 필요하다: 화면은 즉시 피드백, 서버는 신뢰 경계, DB 는 최후 방어.)
*/

import { SNS_CATALOG } from "./sns-catalog";
import { isBrandImpersonation, isReservedSlug } from "./reserved";
import { bannedWordIn } from "./banned-words";

const SNS_KEY_SET = new Set(SNS_CATALOG.map((s) => s.key));

/** 소문자·숫자·하이픈, 2~30자, 하이픈으로 시작 불가 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;

/* 못 쓰는 slug 는 lib/links/reserved.ts 한 곳에서 관리한다 —
   주소가 루트로 올라오면서 «사칭 방지» 목록이 곧 «라우트 충돌 방지» 목록이 됐다. */

export type SlugError = "format" | "reserved" | "banned" | null;

export function validateSlug(raw: string): SlugError {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return "format";
  if (isReservedSlug(slug)) return "reserved";
  /* finch-official 류 브랜드 사칭 프리픽스 — 취득만 막는다(근거는 reserved.ts 주석) */
  if (isBrandImpersonation(slug)) return "reserved";
  /* 금칙어는 부분 일치 — 목록·근거는 banned-words.ts (2026-08-26 사장님 지시) */
  if (bannedWordIn(slug)) return "banned";
  return null;
}

export const SLUG_MESSAGES: Record<Exclude<SlugError, null>, string> = {
  format: "영문 소문자·숫자·하이픈만 쓸 수 있어요 (2~30자, 하이픈으로 시작 불가).",
  reserved: "이 주소는 쓸 수 없어요. 다른 주소를 입력해 주세요.",
  banned: "쓸 수 없는 낱말이 들어 있어요. 다른 주소를 골라 주세요.",
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
  /* userinfo(user@host) 거부 — 공개 링크에 자격증명이 실릴 이유가 없다.
     이걸 안 막으면 이메일 주소가 "https://lead@litt.ly/" 로 둔갑해 통과하고,
     방문자가 누르면 브라우저가 피싱 경고를 띄운다(우리 페이지 신뢰도 문제). */
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

/**
 * SNS 줄 관문 — **마지막 관문**으로 공개 페이지·발행 스냅샷 양쪽이 같이 쓴다.
 *
 * updateLinkProfile 이 이미 거르지만, 본인 행은 PostgREST 로 직접 PATCH 가 가능해
 * (0045 "own link page" for all) sns_links·published_snapshot 에 아무 값이나 들어갈 수 있다.
 * 공개 페이지가 그 값을 그대로 <a href> 로 찍으면 javascript: 저장형 XSS 가 된다(감사 #5).
 * 배열이 아니거나 항목이 이상하면 조용히 비운다 — 방문자 화면이 500 으로 죽지 않게.
 */
/**
 * 연락 스킴(mailto:·tel:·sms:) — SNS 줄의 이메일·전화·문자 칩 전용. 형식이 엄격해야 한다:
 * 이메일은 한 칸 규칙, 번호는 +·숫자·하이픈 3~20자. 그 밖은 null(javascript: 류가 스킴 검사를 못 타게).
 */
export function normalizeContactHref(raw: string): string | null {
  const v = raw.trim();
  const m = /^(mailto|tel|sms):(.*)$/i.exec(v);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const rest = m[2].trim();
  if (scheme === "mailto") return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(rest) ? `mailto:${rest}` : null;
  const num = rest.replace(/[\s()]/g, "");
  return /^\+?[\d-]{3,20}$/.test(num) ? `${scheme}:${num}` : null;
}

/** SNS 줄 주소 — http(s) 또는 연락 스킴 */
export function normalizeSnsUrl(raw: string): string | null {
  return normalizeContactHref(raw) ?? normalizeUrl(raw);
}

export function sanitizeSnsLinks(input: unknown): Array<{ kind: string; url: string }> {
  if (!Array.isArray(input)) return [];
  const out: Array<{ kind: string; url: string }> = [];
  for (const s of input) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const url = typeof o.url === "string" ? normalizeSnsUrl(o.url) : null;
    /* 카탈로그 밖 kind 는 버린다 — "constructor" 같은 프로토타입 이름이 아이콘 맵에서 Object 를 꺼내
       공개 페이지 SSR 을 통째로 터뜨렸다(감사 L2) */
    const kind = typeof o.kind === "string" && SNS_KEY_SET.has(o.kind) ? o.kind : "";
    if (url && kind) out.push({ kind, url });
    if (out.length >= 8) break;
  }
  return out;
}

/** 공개 주소 — 화면 여러 곳에서 만들어 쓰므로 한 곳에서 조립한다 */
export function publicLinkUrl(slug: string, origin?: string): string {
  const base = origin ?? "https://finch.ai.kr";
  /* 2026-08-25 — 리틀리처럼 프리픽스 없이 루트로. 파일은 여전히 app/p/[slug] 이고 proxy 가 리라이트한다.
     옛 /p/{slug} 는 301 로 여기로 온다(이미 뿌려진 링크가 안 깨지게). */
  return `${base.replace(/\/$/, "")}/${slug}`;
}

/**
 * **화면에 보여줄** 주소 — 스킴(https://)을 뗀다.
 *
 * 주소를 루트로 올린 결정(위)의 핵심이 「finch 로 시작하는 심플한 주소」인데, 화면 세 곳
 * (폰 아래 주소 바·QR 캡션·마케팅 퍼뜨리기)이 https:// 째로 보여주고 있었다(2026-08-26 사장님 지적).
 * 표시만 뗀다 — 복사·공유·QR 인코딩·href 는 완전한 URL 을 유지한다. 스킴 없는 주소를
 * 클립보드에 넣으면 카톡·인스타 소개란 등에서 링크로 안 걸리는 곳이 있다.
 */
export function displayLinkUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "");
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

/* ══════════════════════════════════════════════════════════════════
   다른 서비스에서 링크 옮겨오기 — 붙여넣기 파싱
   ══════════════════════════════════════════════════════════════════

   ⚠️ **서버가 남의 URL 을 fetch 하지 않는다.** 링크팜·Beacons 식 "주소만 넣으면
   자동으로 가져오기"를 안 만든 이유는 셋이다:

    ① 위험. 사용자가 준 주소를 서버가 여는 건 SSRF 의 교과서적 형태다. Node 의
       global fetch 에는 소켓 연결 직전에 목적지 IP 를 검사할 훅이 없어서
       **DNS 리바인딩**(1차 조회는 공인 IP, 2차는 169.254.169.254)을 막을 수 없다.
       redirect:"manual" 로도 못 막는다 — 리다이렉트가 아니라 같은 주소의 DNS
       재조회가 문제이기 때문이다. 제대로 하려면 node:https + 커스텀 lookup 으로
       네트워크 계층을 직접 짜야 한다. 게다가 Vercel 의 방화벽은 전부 인바운드라
       애플리케이션 코드가 유일한 방어선이다 = 한 줄 실수가 곧 완전한 SSRF.

    ② 실익. 임의 URL 로 긁을 수 있는 곳이 거의 없다. 링크트리는 robots.txt 가
       `Disallow: /` 이고(명명된 봇만 허용, 우리는 없다), 링크팜은 Flutter 웹이라
       DOM 도 페이로드도 없다. 되는 곳(리틀리·인포크)은 **상수 호스트 예외**로
       따로 열었다 — actions.ts 의 importFromLittly·importFromInpock. 인포크의
       /api/r 추적 리다이렉트도 같은 상수 호스트에 Location 만 물어 해석한다.

    ③ 대안이 거의 같은 값을 낸다. 붙여넣기는 조작 4번이면 끝나고 서버가 아무 데도
       나가지 않는다(위 위협 모델 전체가 사라진다).

   (2026-08-22 추가) 리틀리 흡수 2단계의 「주소로 제목·이미지 불러오기」는 ①의 요구대로
   lib/links/safe-fetch.ts 가 node:http(s) + 커스텀 lookup 으로 연결 직전 IP 를 검사해 연다 —
   global fetch 가 아니다. 그 파일 밖에서 남의 URL 을 여는 코드는 여전히 금지다.

   그래서 여기 있는 건 **순수 함수**다. 네트워크를 쓰지 않는다. */

/** 붙여넣기에서 건져낸 링크 후보 */
export interface HarvestedLink {
  url: string;
  label: string;
  /** 남의 클릭 추적을 거치는 주소인가 — 그대로 넣으면 성과가 그쪽에 계속 쌓인다 */
  tracking: boolean;
}

/** 중복 판정 전에 떼어내는 추적 파라미터. **저장할 때도** 뗀다 */
const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "si", "fbclid", "igshid", "gclid", "mc_cid", "mc_eid", "ref_src", "ref_url", "_gl",
];

/**
 * 남의 클릭 집계를 거치는 주소.
 *
 * 이런 링크를 그대로 옮기면 방문자가 우리 페이지에서 눌러도 **클릭이 그쪽에 잡힌다.**
 * 게다가 원 서비스를 해지하면 그 주소가 통째로 죽는다. 자동 임포트를 파는 경쟁사는
 * 이 사실을 말해주지 않는다 — 우리는 체크를 꺼두고 이유를 적는다.
 */
const TRACKING_HOSTS = [
  "link.inpock.co.kr", "linktr.ee", "bit.ly", "buly.kr", "vo.la", "me2.do", "han.gl", "lnk.bio",
];

/** 추적 파라미터를 떼고 비교용으로 정규화 — 같은 목적지가 여러 번 들어오는 걸 막는다 */
function dedupeKey(raw: string): string {
  try {
    const u = new URL(raw);
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    u.hash = "";
    /* 끝의 / 하나는 같은 페이지다 */
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return raw;
  }
}

/** 추적 파라미터를 실제로 떼어낸 저장용 주소 */
function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * 붙여넣기 텍스트에서 이름·주소 쌍을 건진다.
 *
 * 두 갈래를 **한 상자에서** 받는다:
 *  · `anchors` — 브라우저가 클립보드에 함께 넣어준 HTML 에서 뽑은 <a> (본선).
 *    링크트리·리틀리 같은 페이지를 그대로 긁어 붙이면 이쪽이 채워진다.
 *  · `text` — "이름 | 주소" 또는 주소만 있는 줄 (안전망). HTML 이 없거나
 *    앵커가 하나도 없을 때 쓴다. 순수 텍스트에는 라벨만 남고 URL 이 없는 경우가
 *    많아서 본선이 될 수 없다.
 *
 * 노이즈 제거 규칙 셋이면 충분하다는 게 실측이다(링크트리 앵커 133개 → 정답 20,
 * 오검출 0): ① 원본과 같은 호스트 버리기 ② 이름 없는 링크 버리기 ③ 중복 제거.
 */
export function parsePastedLinks(input: {
  text: string;
  anchors?: Array<{ href: string; label: string }>;
  /** 붙여넣은 페이지 자신의 호스트 — 그쪽 푸터·로고 링크를 걸러낸다 */
  sourceHost?: string;
  max?: number;
}): HarvestedLink[] {
  const max = input.max ?? 30;
  const out: HarvestedLink[] = [];
  const seen = new Set<string>();

  const push = (rawHref: string, rawLabel: string) => {
    if (out.length >= max) return;
    const href = normalizeUrl(rawHref);
    if (!href) return;

    let host: string;
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return;
    }
    /* ① 붙여넣은 페이지 자신으로 돌아가는 링크(로고·푸터·약관)는 버린다 */
    if (input.sourceHost && host === input.sourceHost.replace(/^www\./, "")) return;

    const key = dedupeKey(href);
    if (seen.has(key)) return; // ③ 중복
    seen.add(key);

    const label = sliceChars(rawLabel.replace(/\s+/g, " ").trim(), 40);
    out.push({
      url: cleanUrl(href),
      label,
      tracking: TRACKING_HOSTS.some((t) => host === t || host.endsWith(`.${t}`)),
    });
  };

  /* 본선: HTML 앵커 */
  for (const a of input.anchors ?? []) {
    if (!a.label.trim()) continue; // ② 이름 없는 링크(아이콘·빈 앵커)
    push(a.href, a.label);
  }

  /* 안전망: 줄 단위. 앵커에서 이미 건진 주소는 dedupe 가 막는다 */
  for (const line of (input.text ?? "").split(/\r?\n/)) {
    const row = line.trim();
    if (!row) continue;
    /* "이름 | 주소", "이름 - 주소", "이름<탭>주소" 를 모두 받는다 */
    const m = /^(.*?)[\s|\-–—\t]+((?:https?:\/\/|www\.)\S+)$/i.exec(row);
    if (m) {
      push(m[2], m[1].trim());
      continue;
    }
    const only = /^((?:https?:\/\/|www\.)\S+)$/i.exec(row);
    if (only) push(only[1], "");
  }

  return out;
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
