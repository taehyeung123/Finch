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

export function themeByKey(key: string | null | undefined): LinkTheme {
  return LINK_THEMES.find((t) => t.key === key) ?? LINK_THEMES[0];
}

/** 테마 → 인라인 CSS 변수. 공개 페이지 루트에 style 로 주입한다 */
export function themeVars(t: LinkTheme): Record<string, string> {
  return {
    "--lp-bg": t.bg,
    "--lp-fg": t.fg,
    "--lp-muted": t.muted,
    "--lp-card": t.card,
    "--lp-border": t.border,
    "--lp-accent": t.accent,
    "--lp-on-accent": t.onAccent,
    /* 모서리는 **두 갈래**다.
       radius 의 이름이 「버튼 모서리」인데(위 인터페이스 주석), 값 하나를 이미지·카드·
       그리드·커버까지 전부 먹였더니 full 테마(모노크롬·코랄)에서 **사진이 알약으로
       잘렸다.** 999px 를 /1.6 으로 나눠도 624px 라 아무 소용이 없었고, 미리보기도
       똑같이 뭉개져서 발행 전에 눈치챌 수도 없었다.
         --lp-radius-btn : 링크 버튼·CTA 처럼 알약이어도 되는 것
         --lp-radius     : 면(카드·이미지·썸네일·커버) — full 이어도 16px 로 눌러둔다 */
    "--lp-radius-btn": t.radius === "full" ? "999px" : t.radius === "sm" ? "8px" : "14px",
    "--lp-radius": t.radius === "full" ? "16px" : t.radius === "sm" ? "8px" : "14px",
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
