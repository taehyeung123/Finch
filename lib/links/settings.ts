/*
  페이지 설정(리틀리 ⚙ 페이지 설정 모달 카피, 흡수 5단계) — link_pages.settings jsonb(0058).

  블록·테마와 달리 **발행(스냅샷)과 무관하게 즉시** 적용된다: 비밀번호·언어·새창 여부는
  "콘텐츠"가 아니라 페이지 운영값이라 「라이브 반영」을 기다리면 오히려 사고가 난다
  (비밀번호를 걸었는데 발행 전이라 안 걸리는 식).

  비밀번호 해시는 별도 표(link_page_secrets, 주인만 읽음)에 두고 jsonb 엔 locked 플래그만 둔다 —
  link_pages 는 로그인한 누구나 발행 행을 읽을 수 있어 해시를 jsonb 에 넣으면 샌다.
*/

export const LINK_LANGS = [
  { key: "ko", label: "한국어" },
  { key: "en", label: "English" },
  { key: "ja", label: "日本語" },
] as const;
export type LinkLang = (typeof LINK_LANGS)[number]["key"];

export const LINK_TARGETS = [
  { key: "blank", label: "새 창에서 열기", hint: "방문자가 내 페이지를 떠나지 않아요" },
  { key: "self", label: "현재 창에서 열기", hint: "앱 내부 브라우저에서 더 자연스러워요" },
] as const;

/** 클라이언트·공개 페이지가 보는 모양 — 해시는 없다 */
export interface LinkPageSettings {
  lang: LinkLang;
  target: "blank" | "self";
  /** 검색·AI 노출 — noindex 면 robots 메타로 막는다 */
  robots: "index" | "noindex";
  /** SNS 공유 카드 제목 — 비우면 SEO 제목 → 페이지 제목 순 */
  ogTitle: string;
  /** 공유 카드 이미지 — 비우면 커버 → 프로필 사진 순 */
  ogImage: string;
  /** 파비콘 — 이모지 한 글자 또는 https 이미지 주소. 비우면 핀치 기본 */
  favicon: string;
  /** 비밀번호 화면에 보여줄 안내 문구 */
  lockMessage: string;
  /** 마케팅 연결(리틀리 「마케팅 연결」 카피) — 형식이 맞는 ID 만 저장된다. 비우면 아무 스크립트도 안 실린다 */
  ga4: string;
  metaPixel: string;
  tiktokPixel: string;
  /** 클릭 목적지에 UTM 자동 부착(리틀리 카피) — utm_source=finch 등 3개.
      목적지에 이미 utm_* 이 있으면 의도된 캠페인 태깅이므로 건드리지 않는다(/go 라우트) */
  utm: boolean;
  /** 비밀번호가 걸려 있는가(settings.locked). 해시는 link_page_secrets 에 */
  hasPassword: boolean;
}

export const DEFAULT_LINK_SETTINGS: LinkPageSettings = {
  lang: "ko",
  target: "blank",
  robots: "index",
  ogTitle: "",
  ogImage: "",
  favicon: "",
  lockMessage: "",
  ga4: "",
  metaPixel: "",
  tiktokPixel: "",
  utm: false,
  hasPassword: false,
};

/* 추적 ID 형식 — 이 정규식을 통과한 값만 공개 페이지 인라인 스크립트에 들어간다(따옴표·태그가 들어올 길이 없다) */
export const TRACKER_FORMATS = {
  ga4: /^G-[A-Z0-9]{4,14}$/,
  metaPixel: /^\d{8,20}$/,
  tiktokPixel: /^[A-Z0-9]{10,32}$/,
} as const;

const HTTPS_IMG = /^https:\/\/[^\s"'<>()]+$/;

/** 이모지 한 덩어리(ZWJ·변형 선택자 포함)인가 — 파비콘 텍스트 모드 판정 */
export function isSingleEmoji(v: string): boolean {
  if (!v) return false;
  const seg = [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(v)];
  return seg.length === 1 && /\p{Extended_Pictographic}/u.test(v);
}

/**
 * DB jsonb → 화면 모델. 모르는 값은 기본값으로. locked → hasPassword.
 * 공개 페이지·편집기·데모가 전부 이 관문을 지난다.
 */
export function sanitizeLinkSettings(raw: unknown): LinkPageSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: string, cap: number) => (typeof r[k] === "string" ? (r[k] as string).trim().slice(0, cap) : "");
  const lang = LINK_LANGS.some((l) => l.key === r.lang) ? (r.lang as LinkLang) : "ko";
  const favicon = str("favicon", 300);
  const ogImage = str("ogImage", 500);
  return {
    lang,
    target: r.target === "self" ? "self" : "blank",
    robots: r.robots === "noindex" ? "noindex" : "index",
    ogTitle: str("ogTitle", 80),
    ogImage: HTTPS_IMG.test(ogImage) ? ogImage : "",
    favicon: isSingleEmoji(favicon) || HTTPS_IMG.test(favicon) ? favicon : "",
    lockMessage: str("lockMessage", 200),
    ga4: TRACKER_FORMATS.ga4.test(str("ga4", 20).toUpperCase()) ? str("ga4", 20).toUpperCase() : "",
    metaPixel: TRACKER_FORMATS.metaPixel.test(str("metaPixel", 24)) ? str("metaPixel", 24) : "",
    tiktokPixel: TRACKER_FORMATS.tiktokPixel.test(str("tiktokPixel", 40).toUpperCase()) ? str("tiktokPixel", 40).toUpperCase() : "",
    utm: r.utm === true,
    hasPassword: r.locked === true,
  };
}

/** 파비콘 값 → <link rel=icon> href. 이모지는 SVG 데이터 URL 로 굽는다(외부 요청 0) */
export function faviconHref(v: string): string | null {
  if (!v) return null;
  if (HTTPS_IMG.test(v)) return v;
  if (!isSingleEmoji(v)) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${v}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
