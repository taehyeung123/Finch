/*
  프로필 링크 테마 프리셋.

  링크팜은 테마를 카테고리(MINIMAL / PROFESSIONAL) + 이름(기본·포슬린·모노크롬·
  다크모드·서울의 밤·노션)으로 묶어 카드 그리드로 고르게 한다. 그 문법을 가져오되
  값은 우리가 정한다.

  ⚠️ **여기 색은 앱 디자인 토큰과 무관하다.** 공개 페이지(/p/{slug})는 방문자의
  브랜드 화면이지 핀치 화면이 아니다. 앱 토큰(--surface 등)을 쓰면 사용자가 다크
  테마를 골라도 방문자의 시스템 설정에 따라 색이 뒤집힌다. 그래서 각 테마가
  **자기 색을 직접 들고** 인라인 CSS 변수로 주입한다.
  (CLAUDE.md 의 "hex 하드코딩 금지"는 **앱 화면** 규칙이다 — 여기는 사용자 콘텐츠의
   테마 데이터라 값 자체가 데이터다. 앱 UI 에는 이 값을 쓰지 않는다.)
*/

export interface LinkTheme {
  key: string;
  group: "MINIMAL" | "PROFESSIONAL" | "VIVID";
  name: string;
  /** 페이지 배경 */
  bg: string;
  /** 본문 글자 */
  fg: string;
  /** 흐린 글자(부제·설명) */
  muted: string;
  /** 카드·버튼 면 */
  card: string;
  /** 카드 테두리 */
  border: string;
  /** 강조(주요 버튼·링크) */
  accent: string;
  /** 강조 위 글자 */
  onAccent: string;
  /** 버튼 모서리 */
  radius: "sm" | "md" | "full";
  /** 카드에 그림자를 줄지 — 어두운 테마는 그림자가 안 보인다 */
  shadow: boolean;
  /** 배경 그라데이션 끝색(선택) — 있으면 bg→bg2 대각선 그라데이션 */
  bg2?: string;
}

/**
 * 직접 꾸미기 — 프리셋 위에 덮는 오버라이드. 전부 선택. 저장은 link_pages.theme_custom(0056),
 * 발행 시 스냅샷에 함께 굳는다. 검증은 sanitizeThemeCustom 한 곳.
 */
export interface LinkThemeCustom {
  /** 배경색 #rrggbb */
  bg?: string;
  /** 그라데이션 끝색 — 있으면 bg→bg2 */
  bg2?: string;
  /** 배경 이미지(http/https) — 있으면 그라데이션보다 우선 */
  bgImage?: string;
  accent?: string;
  card?: string;
  fg?: string;
  radius?: "sm" | "md" | "lg" | "full";
  button?: "fill" | "outline" | "soft";
  font?: "sans" | "serif" | "mono";
}

export const CUSTOM_RADIUS = [
  { key: "sm", label: "각진" },
  { key: "md", label: "둥근" },
  { key: "lg", label: "더 둥근" },
  { key: "full", label: "알약" },
] as const;
export const CUSTOM_BUTTONS = [
  { key: "fill", label: "채움" },
  { key: "outline", label: "외곽선" },
  { key: "soft", label: "은은하게" },
] as const;
export const CUSTOM_FONTS = [
  { key: "sans", label: "고딕" },
  { key: "serif", label: "명조" },
  { key: "mono", label: "모노" },
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
/* 배경 이미지 주소 — http(s)·공백/따옴표/괄호 금지(url("...") 로 CSS 에 들어간다) */
const IMG_URL = /^https?:\/\/[^\s"'()]{1,500}$/;

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/** 강조색 위 글자 — 밝은 강조면 어둡게, 어두우면 희게(YIQ) */
function onAccentFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? "#16161C" : "#FFFFFF";
}

/**
 * 커스텀의 **유일한 관문** — 서버 저장·발행·로더가 전부 이걸 통과시킨다.
 * 모르는 키·틀린 hex·목록 밖 열거값·이상한 이미지 주소는 조용히 떨군다.
 * 남는 게 없으면 null(= 프리셋 그대로).
 */
export function sanitizeThemeCustom(input: unknown): LinkThemeCustom | null {
  if (!input || typeof input !== "object") return null;
  const i = input as Record<string, unknown>;
  const out: LinkThemeCustom = {};
  for (const k of ["bg", "bg2", "accent", "card", "fg"] as const) if (isHex(i[k])) out[k] = (i[k] as string).toUpperCase();
  if (typeof i.bgImage === "string" && IMG_URL.test(i.bgImage)) out.bgImage = i.bgImage;
  if (CUSTOM_RADIUS.some((r) => r.key === i.radius)) out.radius = i.radius as LinkThemeCustom["radius"];
  if (CUSTOM_BUTTONS.some((b) => b.key === i.button)) out.button = i.button as LinkThemeCustom["button"];
  if (CUSTOM_FONTS.some((f) => f.key === i.font)) out.font = i.font as LinkThemeCustom["font"];
  return Object.keys(out).length ? out : null;
}

export const LINK_THEMES: LinkTheme[] = [
  {
    key: "basic",
    group: "MINIMAL",
    name: "기본",
    bg: "#F7F8FA",
    fg: "#16161C",
    muted: "#6B7280",
    card: "#FFFFFF",
    border: "#E8EBEF",
    accent: "#16161C",
    onAccent: "#FFFFFF",
    radius: "md",
    shadow: true,
  },
  {
    key: "porcelain",
    group: "MINIMAL",
    name: "포슬린",
    bg: "#F4F1EC",
    fg: "#2A2622",
    muted: "#7A7167",
    card: "#FFFDF9",
    border: "#E3DDD3",
    accent: "#2A2622",
    onAccent: "#FFFDF9",
    radius: "sm",
    shadow: false,
  },
  {
    key: "notion",
    group: "MINIMAL",
    name: "노션",
    bg: "#FFFFFF",
    fg: "#191919",
    muted: "#787774",
    card: "#FFFFFF",
    border: "#E3E2E0",
    accent: "#191919",
    onAccent: "#FFFFFF",
    radius: "sm",
    shadow: false,
  },
  {
    key: "mono",
    group: "PROFESSIONAL",
    name: "모노크롬",
    bg: "#FFFFFF",
    fg: "#111111",
    muted: "#6E6E6E",
    card: "#F5F5F5",
    border: "#DEDEDE",
    accent: "#111111",
    onAccent: "#FFFFFF",
    radius: "full",
    shadow: false,
  },
  {
    key: "dark",
    group: "PROFESSIONAL",
    name: "다크 모드",
    bg: "#0C0C11",
    fg: "#F2F3F5",
    muted: "#9096A1",
    card: "#17171E",
    border: "#26262F",
    accent: "#F2F3F5",
    onAccent: "#0C0C11",
    radius: "md",
    shadow: false,
  },
  {
    key: "seoul_night",
    group: "PROFESSIONAL",
    name: "서울의 밤",
    bg: "#0E1424",
    fg: "#EAF0FF",
    muted: "#8FA0C4",
    card: "#18203440",
    border: "#2A3350",
    accent: "#5B8CFF",
    onAccent: "#0B1020",
    radius: "md",
    shadow: false,
  },
  {
    key: "coral",
    group: "VIVID",
    name: "코랄",
    bg: "#FFF6F3",
    fg: "#2B1A15",
    muted: "#8A6A60",
    card: "#FFFFFF",
    border: "#FBDDD3",
    accent: "#FF6B4A",
    onAccent: "#2B1A15",
    radius: "full",
    shadow: true,
  },
  {
    key: "forest",
    group: "VIVID",
    name: "포레스트",
    bg: "#F2F6F1",
    fg: "#16241A",
    muted: "#5E7460",
    card: "#FFFFFF",
    border: "#D8E4D6",
    accent: "#2F7A46",
    onAccent: "#FFFFFF",
    radius: "md",
    shadow: true,
  },
];

export const DEFAULT_THEME_KEY = "basic";

/* 2026-08-20 추가 7종 — "테마 종류 더 자유롭게". 그라데이션(bg2)·네온·미드나잇 등
   프리셋 8종이 전부 단색·중성이라 "다 비슷하다"는 인상을 깨는 쪽으로 골랐다. */
LINK_THEMES.push(
  { key: "sunset", group: "VIVID", name: "선셋", bg: "#FFE8D6", bg2: "#FFD0DD", fg: "#2A1B12", muted: "#8A6A5A", card: "#FFFFFF", border: "#F2D6C6", accent: "#E25822", onAccent: "#FFFFFF", radius: "full", shadow: true },
  { key: "lavender", group: "VIVID", name: "라벤더", bg: "#F1ECFA", bg2: "#E3DCFF", fg: "#221B3A", muted: "#6F6790", card: "#FFFFFF", border: "#E0D8F2", accent: "#6D4AFF", onAccent: "#FFFFFF", radius: "md", shadow: true },
  { key: "peach", group: "VIVID", name: "피치", bg: "#FFF1E6", fg: "#2B2118", muted: "#8C7668", card: "#FFFFFF", border: "#F5DCCB", accent: "#FF7A59", onAccent: "#FFFFFF", radius: "md", shadow: true },
  { key: "sage", group: "MINIMAL", name: "세이지", bg: "#EEF3EC", fg: "#1F2A22", muted: "#64736A", card: "#FFFFFF", border: "#DCE5DC", accent: "#4F7C5A", onAccent: "#FFFFFF", radius: "sm", shadow: false },
  { key: "ocean", group: "PROFESSIONAL", name: "오션", bg: "#E9F4F8", bg2: "#DDEBF5", fg: "#0F2430", muted: "#587383", card: "#FFFFFF", border: "#D2E4EC", accent: "#0E7490", onAccent: "#FFFFFF", radius: "md", shadow: true },
  { key: "midnight", group: "PROFESSIONAL", name: "미드나잇", bg: "#0B1220", bg2: "#1B2A4A", fg: "#E6EDF7", muted: "#93A4BD", card: "#14203A", border: "#24345A", accent: "#6EA8FF", onAccent: "#0B1220", radius: "md", shadow: false },
  { key: "neon", group: "VIVID", name: "네온", bg: "#0A0A0F", fg: "#F2F2F7", muted: "#9A9AAB", card: "#15151F", border: "#26263A", accent: "#39FF88", onAccent: "#0A0A0F", radius: "full", shadow: false },
);

export function themeByKey(key: string | null | undefined): LinkTheme {
  return LINK_THEMES.find((t) => t.key === key) ?? LINK_THEMES[0];
}

/** 테마 → 인라인 CSS 변수. 공개 페이지 루트에 style 로 주입한다 */
export function themeVars(t: LinkTheme, custom?: LinkThemeCustom | null): Record<string, string> {
  const c = custom ?? {};
  const bg = c.bg ?? t.bg;
  const fg = c.fg ?? t.fg;
  const card = c.card ?? t.card;
  const accent = c.accent ?? t.accent;
  /* 파생색 — 사용자가 기준색을 건드렸을 때만 다시 계산한다(안 건드리면 프리셋 값 그대로) */
  const onAccent = c.accent ? onAccentFor(accent) : t.onAccent;
  const muted = c.fg || c.bg ? `color-mix(in srgb, ${fg} 62%, ${bg})` : t.muted;
  const border = c.card || c.fg || c.bg ? `color-mix(in srgb, ${fg} 14%, transparent)` : t.border;
  const radius = c.radius ?? t.radius;
  /* 배경: 이미지 > 그라데이션 > 단색. 사용자가 단색을 새로 골랐으면 프리셋 그라데이션은 버린다 */
  const bg2 = c.bg2 ?? (c.bg ? undefined : t.bg2);
  const bgImage = c.bgImage ? `url("${c.bgImage}")` : bg2 ? `linear-gradient(160deg, ${bg}, ${bg2})` : "none";
  const font =
    c.font === "serif"
      ? '"Noto Serif KR", "Apple Myungjo", "Nanum Myeongjo", Georgia, serif'
      : c.font === "mono"
        ? 'ui-monospace, "D2Coding", "Cascadia Code", Consolas, monospace'
        : "inherit";
  /* 버튼 스타일 — 링크 버튼의 "기본" 변형이 따른다(채움/외곽선/은은하게) */
  const btn = c.button ?? "fill";
  const btnBg = btn === "fill" ? card : btn === "outline" ? "transparent" : `color-mix(in srgb, ${accent} 14%, transparent)`;
  const btnFg = btn === "fill" ? fg : accent;
  const btnBorder = btn === "fill" ? border : btn === "outline" ? accent : "transparent";
  return {
    "--lp-bg": bg,
    "--lp-bg-image": bgImage,
    "--lp-font": font,
    "--lp-btn-bg": btnBg,
    "--lp-btn-fg": btnFg,
    "--lp-btn-border": btnBorder,
    "--lp-fg": fg,
    "--lp-muted": muted,
    "--lp-card": card,
    "--lp-border": border,
    "--lp-accent": accent,
    "--lp-on-accent": onAccent,
    /* 모서리는 **두 갈래**다.
       radius 의 이름이 「버튼 모서리」인데(위 인터페이스 주석), 값 하나를 이미지·카드·
       그리드·커버까지 전부 먹였더니 full 테마(모노크롬·코랄)에서 **사진이 알약으로
       잘렸다.** 999px 를 /1.6 으로 나눠도 624px 라 아무 소용이 없었고, 미리보기도
       똑같이 뭉개져서 발행 전에 눈치챌 수도 없었다.
         --lp-radius-btn : 링크 버튼·CTA 처럼 알약이어도 되는 것
         --lp-radius     : 면(카드·이미지·썸네일·커버) — full 이어도 16px 로 눌러둔다 */
    "--lp-radius-btn": radius === "full" ? "999px" : radius === "sm" ? "8px" : radius === "lg" ? "20px" : "14px",
    "--lp-radius": radius === "full" ? "16px" : radius === "sm" ? "8px" : radius === "lg" ? "18px" : "14px",
    "--lp-shadow": t.shadow ? "0 1px 3px rgba(15,23,42,.08), 0 6px 14px rgba(15,23,42,.04)" : "none",
  };
}

/** 프로필 레이아웃 — 링크팜의 프로필 / 커버 / 커버+프로필 */
export const LAYOUTS = [
  { key: "profile", label: "프로필", hint: "동그란 프로필 사진만" },
  { key: "cover", label: "커버", hint: "가로 배너 한 장" },
  { key: "cover_profile", label: "커버+프로필", hint: "배너 위에 프로필 사진" },
] as const;

export type LayoutKey = (typeof LAYOUTS)[number]["key"];

/** SNS 아이콘 줄에서 지원하는 채널 */
export const SNS_KINDS = [
  { key: "website", label: "웹사이트" },
  { key: "instagram", label: "인스타그램" },
  { key: "youtube", label: "유튜브" },
  { key: "tiktok", label: "틱톡" },
  { key: "threads", label: "스레드" },
  { key: "x", label: "X" },
  { key: "kakao", label: "카카오톡" },
] as const;

export type SnsKind = (typeof SNS_KINDS)[number]["key"];
