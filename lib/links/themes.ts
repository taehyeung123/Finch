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

import { SNS_CATALOG } from "./sns-catalog";

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
  radius: "sm" | "md" | "lg" | "full";
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
  /** 글꼴 — LINK_FONTS 의 key(sans/serif/mono 는 예전 값과 호환) */
  font?: string;
  /* ── 리틀리 흡수 3단계(2026-08-22) ── */
  /** 배경 이미지 필터 — 없음/밝게/어둡게/밝은 블러/어두운 블러 */
  bgFilter?: "none" | "light" | "dark" | "blur" | "darkBlur";
  /** 버튼 액션(호버 효과) */
  effect?: "none" | "circle" | "wave" | "flip" | "swipe";
  /** 카드·버튼 그림자 */
  shadow?: "none" | "soft" | "strong";
  /** 스크롤 애니메이션 — 블록이 화면에 들어올 때 */
  anim?: "none" | "rise" | "zoom";
  /** PC 레이아웃 — phone(가운데 한 줄) | split(왼쪽 프로필 · 오른쪽 블록) */
  desktop?: "phone" | "split";
  /** 상단 공유 버튼 */
  share?: boolean;
  /** 하단 핀치 배지 — hide 는 추후 플랜 게이트 */
  badge?: "show" | "hide";
  /* ── 디자인 탭 보완(2026-08-23, 리틀리 디자인 탭 대조) ── */
  /** 버튼색 적용 범위 — partial(강조 버튼만) | all(모든 링크 버튼을 강조색으로 채움) */
  buttonScope?: "partial" | "all";
  /** 내 로고(이미지) — 있으면 핀치 배지 자리에 이 이미지. logoPos 로 위/아래 */
  logoImage?: string;
  logoPos?: "top" | "bottom";
  /** 상단 메뉴 — none | bar(스크롤해도 붙어 있는 제목 줄 + 공유/구독 버튼) */
  topbar?: "none" | "bar";
  /** 상단 구독 버튼 — 첫 구독신청 블록으로 스크롤 */
  subscribe?: boolean;
  /** 커서 모양 */
  cursor?: "default" | "dot" | "heart" | "star";
  /** 화면 효과 — 들어올 때 한 번(confetti) 또는 계속(snow·sparkle) */
  screenFx?: "none" | "confetti" | "snow" | "sparkle";
}

export const CUSTOM_BUTTON_SCOPE = [
  { key: "partial", label: "강조 버튼만", hint: "일반 링크는 카드색, 강조한 것만 강조색" },
  { key: "all", label: "전체 적용", hint: "모든 링크 버튼을 강조색으로 채워요" },
] as const;
export const CUSTOM_TOPBAR = [
  { key: "none", label: "없음" },
  { key: "bar", label: "제목 줄 고정" },
] as const;
export const CUSTOM_LOGO_POS = [
  { key: "top", label: "맨 위" },
  { key: "bottom", label: "맨 아래" },
] as const;
export const CUSTOM_CURSORS = [
  { key: "default", label: "기본" },
  { key: "dot", label: "점" },
  { key: "heart", label: "하트" },
  { key: "star", label: "별" },
] as const;
export const CUSTOM_SCREEN_FX = [
  { key: "none", label: "없음" },
  { key: "confetti", label: "색종이(입장 시)" },
  { key: "snow", label: "눈" },
  { key: "sparkle", label: "반짝임" },
] as const;

/** 커서 SVG — 데이터 URL. 현재색(currentColor)은 못 쓰므로 검정 윤곽 + 흰 채움으로 어느 배경에서도 보인다 */
export function cursorCss(kind: LinkThemeCustom["cursor"]): string {
  if (!kind || kind === "default") return "auto";
  const shape =
    kind === "dot"
      ? '<circle cx="12" cy="12" r="6" fill="#fff" stroke="#000" stroke-width="2"/>'
      : kind === "heart"
        ? '<path d="M12 21s-7-4.6-9.3-9A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 9.3 5.6C19 16.4 12 21 12 21z" fill="#ff5d8f" stroke="#000" stroke-width="1.5"/>'
        : '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#ffd84c" stroke="#000" stroke-width="1.5"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${shape}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
}

/** 같은 SVG 를 **그림으로** 쓸 때 — 편집기 칩이 커서 모양을 보여준다.
    호출부에서 정규식으로 파싱하지 않도록 정의를 이 파일 한 곳에 둔다 */
export function cursorImage(kind: LinkThemeCustom["cursor"]): string | undefined {
  const css = cursorCss(kind);
  return css === "auto" ? undefined : css.replace(/\s+\d+\s+\d+,\s*auto$/, "");
}

/** 글꼴 목록 — fontsource(jsdelivr) 로 싣는다. CSP 가 이미 cdn.jsdelivr.net 의 style/font 를 허용한다.
    pkg 가 null 이면 시스템 글꼴(추가 로드 없음). bold 는 700.css 가 있는 패키지. */
export const LINK_FONTS: ReadonlyArray<{ key: string; label: string; family: string; pkg: string | null; bold: boolean }> = [
  { key: "sans", label: "기본 고딕", family: "inherit", pkg: null, bold: false },
  { key: "noto-sans", label: "노토 산스", family: '"Noto Sans KR", sans-serif', pkg: "noto-sans-kr", bold: true },
  { key: "ibm-plex", label: "IBM 플렉스", family: '"IBM Plex Sans KR", sans-serif', pkg: "ibm-plex-sans-kr", bold: true },
  { key: "nanum-gothic", label: "나눔고딕", family: '"Nanum Gothic", sans-serif', pkg: "nanum-gothic", bold: true },
  { key: "gowun-dodum", label: "고운돋움", family: '"Gowun Dodum", sans-serif', pkg: "gowun-dodum", bold: false },
  { key: "sunflower", label: "해바라기", family: '"Sunflower", sans-serif', pkg: "sunflower", bold: true },
  { key: "serif", label: "명조", family: '"Noto Serif KR", "Apple Myungjo", "Nanum Myeongjo", Georgia, serif', pkg: "noto-serif-kr", bold: true },
  { key: "nanum-myeongjo", label: "나눔명조", family: '"Nanum Myeongjo", serif', pkg: "nanum-myeongjo", bold: true },
  { key: "gowun-batang", label: "고운바탕", family: '"Gowun Batang", serif', pkg: "gowun-batang", bold: true },
  { key: "hahmlet", label: "함렛", family: '"Hahmlet", serif', pkg: "hahmlet", bold: true },
  { key: "song-myung", label: "송명", family: '"Song Myung", serif', pkg: "song-myung", bold: false },
  { key: "do-hyeon", label: "도현", family: '"Do Hyeon", sans-serif', pkg: "do-hyeon", bold: false },
  { key: "jua", label: "주아", family: '"Jua", sans-serif', pkg: "jua", bold: false },
  { key: "black-han", label: "검은고딕", family: '"Black Han Sans", sans-serif', pkg: "black-han-sans", bold: false },
  { key: "gaegu", label: "개구", family: '"Gaegu", cursive', pkg: "gaegu", bold: true },
  { key: "nanum-pen", label: "나눔손글씨 펜", family: '"Nanum Pen Script", cursive', pkg: "nanum-pen-script", bold: false },
  { key: "mono", label: "모노", family: 'ui-monospace, "D2Coding", "Cascadia Code", Consolas, monospace', pkg: null, bold: false },
  /* 2026-08-23 확장(디자인 탭 글꼴 검색) — jsdelivr 에 index.css 존재 확인 */
  { key: "gothic-a1", label: "고딕 A1", family: '"Gothic A1", sans-serif', pkg: "gothic-a1", bold: true },
  { key: "dongle", label: "동글", family: '"Dongle", sans-serif', pkg: "dongle", bold: true },
  { key: "stylish", label: "스타일리시", family: '"Stylish", sans-serif', pkg: "stylish", bold: false },
  { key: "gugi", label: "구기", family: '"Gugi", cursive', pkg: "gugi", bold: false },
  { key: "hi-melody", label: "하이멜로디", family: '"Hi Melody", cursive', pkg: "hi-melody", bold: false },
  { key: "poor-story", label: "푸어스토리", family: '"Poor Story", cursive', pkg: "poor-story", bold: false },
  { key: "yeon-sung", label: "연성", family: '"Yeon Sung", cursive', pkg: "yeon-sung", bold: false },
  { key: "single-day", label: "싱글데이", family: '"Single Day", cursive', pkg: "single-day", bold: false },
  { key: "kirang-haerang", label: "기랑해랑", family: '"Kirang Haerang", cursive', pkg: "kirang-haerang", bold: false },
  { key: "gamja-flower", label: "감자꽃", family: '"Gamja Flower", cursive', pkg: "gamja-flower", bold: false },
  { key: "east-sea-dokdo", label: "동해독도", family: '"East Sea Dokdo", cursive', pkg: "east-sea-dokdo", bold: false },
  { key: "cute-font", label: "귀여운 글꼴", family: '"Cute Font", cursive', pkg: "cute-font", bold: false },
  { key: "nanum-brush", label: "나눔손글씨 붓", family: '"Nanum Brush Script", cursive', pkg: "nanum-brush-script", bold: false },
  { key: "nanum-coding", label: "나눔고딕코딩", family: '"Nanum Gothic Coding", monospace', pkg: "nanum-gothic-coding", bold: true },
  /* 라틴 전용 글꼴 — 한글 글리프가 없어 generic 으로 떨어지면 굴림·Comic Sans 급이 된다.
     한글은 앱 기본 글꼴(Pretendard)로 받아 라틴만 그 글꼴을 쓴다(2026-08-24 비평).
     ⚠️ **var(--font-pretendard) 를 넣는다** — next/font 는 해시된 패밀리 이름을 만들어서
     리터럴 "Pretendard Variable" 은 실제 로드된 글꼴과 매칭되지 않는다(globals.css --font-sans 와 같은 관례, 소넷 확정).
     명조 계열은 Noto Serif KR·애플명조를 먼저 보고, 없으면 Pretendard 로 떨어진다(굴림보다 낫다). */
  { key: "inter", label: "Inter", family: '"Inter", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif', pkg: "inter", bold: true },
  { key: "montserrat", label: "Montserrat", family: '"Montserrat", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif', pkg: "montserrat", bold: true },
  { key: "poppins", label: "Poppins", family: '"Poppins", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif', pkg: "poppins", bold: true },
  { key: "raleway", label: "Raleway", family: '"Raleway", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif', pkg: "raleway", bold: true },
  { key: "space-grotesk", label: "Space Grotesk", family: '"Space Grotesk", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif', pkg: "space-grotesk", bold: true },
  { key: "playfair", label: "Playfair Display", family: '"Playfair Display", "Noto Serif KR", "Apple Myungjo", var(--font-pretendard), serif', pkg: "playfair-display", bold: true },
  { key: "lora", label: "Lora", family: '"Lora", "Noto Serif KR", "Apple Myungjo", var(--font-pretendard), serif', pkg: "lora", bold: true },
  { key: "dm-serif", label: "DM Serif Display", family: '"DM Serif Display", "Noto Serif KR", "Apple Myungjo", var(--font-pretendard), serif', pkg: "dm-serif-display", bold: false },
  { key: "bebas", label: "Bebas Neue", family: '"Bebas Neue", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif', pkg: "bebas-neue", bold: false },
  { key: "pacifico", label: "Pacifico", family: '"Pacifico", "Nanum Pen Script", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", cursive', pkg: "pacifico", bold: false },
  { key: "caveat", label: "Caveat", family: '"Caveat", "Nanum Pen Script", var(--font-pretendard), "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", cursive', pkg: "caveat", bold: true },
];

/** 글꼴 스타일시트 주소 — 공개 페이지·편집 미리보기가 <link rel="stylesheet"> 로 싣는다 */
export function fontStylesheets(fontKey: string | undefined): string[] {
  const f = LINK_FONTS.find((x) => x.key === fontKey);
  if (!f || !f.pkg) return [];
  const base = `https://cdn.jsdelivr.net/npm/@fontsource/${f.pkg}@5`;
  return f.bold ? [`${base}/index.css`, `${base}/700.css`] : [`${base}/index.css`];
}

export const CUSTOM_FILTERS = [
  { key: "none", label: "없음" },
  { key: "light", label: "밝게" },
  { key: "dark", label: "어둡게" },
  { key: "blur", label: "밝은 블러" },
  { key: "darkBlur", label: "어두운 블러" },
] as const;
export const CUSTOM_EFFECTS = [
  { key: "none", label: "없음" },
  { key: "circle", label: "원 채움" },
  { key: "wave", label: "물결" },
  { key: "flip", label: "기울임" },
  { key: "swipe", label: "스와이프" },
] as const;
export const CUSTOM_SHADOWS = [
  { key: "none", label: "없음" },
  { key: "soft", label: "은은하게" },
  { key: "strong", label: "진하게" },
] as const;
export const CUSTOM_ANIMS = [
  { key: "none", label: "없음" },
  { key: "rise", label: "아래에서" },
  { key: "zoom", label: "확대" },
] as const;
export const CUSTOM_DESKTOP = [
  { key: "phone", label: "가운데 한 줄" },
  { key: "split", label: "프로필 분리" },
] as const;

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

const HEX = /^#[0-9a-fA-F]{6}$/;
/* 배경 이미지 주소 — http(s)·공백/따옴표/괄호 금지(url("...") 로 CSS 에 들어간다) */
const IMG_URL = /^https?:\/\/[^\s"'()\\]{1,500}$/;

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/** WCAG 상대 휘도 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 밝은 색인가 — 화면 효과(눈)가 입자색을 고르는 데 쓴다. hex 가 아니면 어두운 쪽으로 취급 */
export function isLightColor(hex: string): boolean {
  return HEX.test(hex) && luminance(hex) > 0.5;
}

/** WCAG 대비 — hex 둘. hex 가 아니면(color-mix 등) 계산 불가 → 0 */
export function contrastRatio(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) return 0;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 두 hex 를 t(0~1) 비율로 섞는다 — 그라데이션 끝색 기본값 등 */
export function mixHex(a: string, b: string, t: number): string {
  if (!HEX.test(a) || !HEX.test(b)) return a;
  const ch = (i: number) => Math.round(parseInt(a.slice(i, i + 2), 16) + (parseInt(b.slice(i, i + 2), 16) - parseInt(a.slice(i, i + 2), 16)) * t);
  return `#${[1, 3, 5].map((i) => ch(i).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** 강조색 위 글자 — 흰/어두운 글자 중 WCAG 대비가 큰 쪽. YIQ 는 채도 높은 주황·파랑에서 흰 글자를 골라 2.8:1 이 났다(감사2 C6) */
function onAccentFor(hex: string): string {
  /* 흰 글자 대비 1.05/(L+.05) 와 #16161C(L≈0.0083) 대비 (L+.05)/0.0583 가 같아지는 지점 L≈0.197 */
  return luminance(hex) > 0.197 ? "#16161C" : "#FFFFFF";
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
  if (LINK_FONTS.some((f) => f.key === i.font)) out.font = i.font as string;
  if (CUSTOM_FILTERS.some((f) => f.key === i.bgFilter)) out.bgFilter = i.bgFilter as LinkThemeCustom["bgFilter"];
  if (CUSTOM_EFFECTS.some((f) => f.key === i.effect)) out.effect = i.effect as LinkThemeCustom["effect"];
  if (CUSTOM_SHADOWS.some((f) => f.key === i.shadow)) out.shadow = i.shadow as LinkThemeCustom["shadow"];
  if (CUSTOM_ANIMS.some((f) => f.key === i.anim)) out.anim = i.anim as LinkThemeCustom["anim"];
  if (CUSTOM_DESKTOP.some((f) => f.key === i.desktop)) out.desktop = i.desktop as LinkThemeCustom["desktop"];
  if (i.share === true) out.share = true;
  if (i.badge === "hide") out.badge = "hide";
  if (CUSTOM_BUTTON_SCOPE.some((f) => f.key === i.buttonScope)) out.buttonScope = i.buttonScope as LinkThemeCustom["buttonScope"];
  if (typeof i.logoImage === "string" && IMG_URL.test(i.logoImage)) out.logoImage = i.logoImage;
  if (CUSTOM_LOGO_POS.some((f) => f.key === i.logoPos)) out.logoPos = i.logoPos as LinkThemeCustom["logoPos"];
  if (CUSTOM_TOPBAR.some((f) => f.key === i.topbar)) out.topbar = i.topbar as LinkThemeCustom["topbar"];
  if (i.subscribe === true) out.subscribe = true;
  if (CUSTOM_CURSORS.some((f) => f.key === i.cursor)) out.cursor = i.cursor as LinkThemeCustom["cursor"];
  if (CUSTOM_SCREEN_FX.some((f) => f.key === i.screenFx)) out.screenFx = i.screenFx as LinkThemeCustom["screenFx"];
  return Object.keys(out).length ? out : null;
}

export const LINK_THEMES: LinkTheme[] = [
  {
    key: "basic",
    group: "MINIMAL",
    name: "기본",
    /* 2026-08-23 손질 — 리틀리 기본 화면 수준으로: 지면을 아주 살짝 회색으로, 모서리 lg.
       2026-08-24: #F8F8FA 는 흰 카드와 1.05:1 이라 버튼이 지면에 녹았다 — 앱 지면(#F3F4F6)과
       같은 단차로 내린다(리틀리 지면도 #F2F2F2 다). */
    bg: "#F3F4F6",
    fg: "#16161C",
    muted: "#69707E",
    card: "#FFFFFF",
    border: "#E5E7EB",
    accent: "#16161C",
    onAccent: "#FFFFFF",
    radius: "lg",
    shadow: true,
  },
  {
    key: "cream",
    group: "MINIMAL",
    name: "크림",
    bg: "#FBF6EE",
    fg: "#3B2F23",
    muted: "#71614E",
    card: "#FFFFFF",
    border: "#EFE6D8",
    accent: "#9C5417",
    onAccent: "#FFFFFF",
    radius: "lg",
    shadow: true,
  },
  {
    key: "sky",
    group: "MINIMAL",
    name: "스카이",
    bg: "#EEF5FD",
    fg: "#152238",
    muted: "#4E617C",
    card: "#FFFFFF",
    border: "#DFEAF6",
    accent: "#2563EB",
    onAccent: "#FFFFFF",
    radius: "lg",
    shadow: true,
  },
  {
    key: "blush",
    group: "MINIMAL",
    name: "블러시",
    bg: "#FCF1F4",
    fg: "#3B222C",
    muted: "#75565F",
    card: "#FFFFFF",
    border: "#F3E1E8",
    accent: "#C2366B",
    onAccent: "#FFFFFF",
    radius: "full",
    shadow: true,
  },
  {
    key: "aurora",
    group: "VIVID",
    name: "오로라",
    bg: "#E8F4FE",
    bg2: "#EFE9FE",
    fg: "#20233C",
    muted: "#565B77",
    card: "#FFFFFF",
    border: "#E2E6F5",
    accent: "#5B5BD6",
    onAccent: "#FFFFFF",
    radius: "lg",
    shadow: true,
  },
  {
    key: "porcelain",
    group: "MINIMAL",
    name: "포슬린",
    bg: "#F4F1EC",
    fg: "#2A2622",
    muted: "#746B61",
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
    muted: "#767572",
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
    muted: "#88685E",
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
  { key: "sunset", group: "VIVID", name: "선셋", bg: "#FFE8D6", bg2: "#FFD0DD", fg: "#2A1B12", muted: "#75594A", card: "#FFFFFF", border: "#F2D6C6", accent: "#C74D1E", onAccent: "#FFFFFF", radius: "full", shadow: true },
  { key: "lavender", group: "VIVID", name: "라벤더", bg: "#F1ECFA", bg2: "#E3DCFF", fg: "#221B3A", muted: "#645C84", card: "#FFFFFF", border: "#E0D8F2", accent: "#6D4AFF", onAccent: "#FFFFFF", radius: "md", shadow: true },
  { key: "peach", group: "VIVID", name: "피치", bg: "#FFF1E6", fg: "#2B2118", muted: "#7E6A5D", card: "#FFFFFF", border: "#F5DCCB", accent: "#FF7A59", onAccent: "#2B2118", radius: "md", shadow: true },
  { key: "sage", group: "MINIMAL", name: "세이지", bg: "#EEF3EC", fg: "#1F2A22", muted: "#617067", card: "#FFFFFF", border: "#DCE5DC", accent: "#4F7C5A", onAccent: "#FFFFFF", radius: "sm", shadow: false },
  { key: "ocean", group: "PROFESSIONAL", name: "오션", bg: "#E9F4F8", bg2: "#DDEBF5", fg: "#0F2430", muted: "#516B7B", card: "#FFFFFF", border: "#D2E4EC", accent: "#0E7490", onAccent: "#FFFFFF", radius: "md", shadow: true },
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
  const muted = c.fg || c.bg || c.bg2 ? `color-mix(in srgb, ${fg} 68%, ${bg})` : t.muted;
  const border = c.card || c.fg || c.bg ? `color-mix(in srgb, ${fg} 14%, transparent)` : t.border;
  const radius = c.radius ?? t.radius;
  /* 배경: 이미지 > 그라데이션 > 단색. 사용자가 단색을 새로 골랐으면 프리셋 그라데이션은 버린다 */
  const bg2 = c.bg2 ?? (c.bg ? undefined : t.bg2);
  /* 배경 필터 — 이미지 위에 덮는 반투명 겹. 그라데이션으로 쌓아 같은 변수 하나로 공개·미리보기가 같다.
     블러는 공개 페이지가 별도 레이어에서만 건다(--lp-bg-blur). */
  /* 배경 사진의 **기본 필터**(2026-08-24 비평) — 없음이 기본이면 사진 위에 글자가 그대로 얹혀
     어떤 대비 가드도 소용이 없다. 밝은 글자면 어둡게, 어두운 글자면 밝게 한 겹 깔아 준다.
     사용자가 「없음」을 명시적으로 고르면 그대로 존중한다(c.bgFilter 가 있으면 그 값). */
  const autoFilter = luminance(HEX.test(fg) ? fg : "#000000") > 0.5 ? "dark" : "light";
  const filter = c.bgImage ? (c.bgFilter ?? autoFilter) : "none";
  const overlay =
    filter === "light" ? "rgba(255,255,255,.35)" : filter === "dark" ? "rgba(0,0,0,.42)" : filter === "blur" ? "rgba(255,255,255,.22)" : filter === "darkBlur" ? "rgba(0,0,0,.42)" : null;
  /* url("…") 안에 들어간다 — 관문(IMG_URL)이 역슬래시·따옴표를 막지만 직렬화도 따로 안전하게(감사2 C5) */
  const bgImage = c.bgImage
    ? `${overlay ? `linear-gradient(${overlay}, ${overlay}), ` : ""}url("${c.bgImage.replace(/[\\"]/g, (m) => `\\${m}`)}")`
    : bg2
      ? `linear-gradient(160deg, ${bg}, ${bg2})`
      : "none";
  const bgBlur = filter === "blur" || filter === "darkBlur" ? "10px" : "0px";
  const font = LINK_FONTS.find((f) => f.key === c.font)?.family ?? "inherit";
  /* 그림자 — 검정 그림자는 **어두운 지면에서 보이지 않는다**. 「진하게」를 골라도 아무 변화가 없어
     보였던 이유다(2026-08-24 비평). 어두운 배경이면 같은 자리에 **밝은 테두리 겹**을 쓴다
     (앱 다크 규칙과 같은 문법: 그림자 대신 밝기·테두리로 깊이). */
  /* 지면 밝기 — **밑색만** 본다. 사진 배경은 서버에서 밝기를 알 수 없으므로 아래에서 따로 다룬다.
     ⚠️ 필터로 판정하려던 시도는 틀렸다: 「밝게」(흰 35%) 겹은 새까만 사진을 밝게 만들지 못해
     밝은 지면이라 단정하면 그림자가 또 사라진다(소넷 확정). */
  const darkGround = luminance(HEX.test(bg) ? bg : "#ffffff") < 0.35;
  /* 사진 배경이면 지면 밝기를 알 수 없다 — 밝은 겹·어두운 겹을 **함께** 써서 어느 쪽에서도 보이게 한다
     (흰 헤어라인은 어두운 사진 위에서, 검은 그림자는 밝은 사진 위에서 각각 살아난다). */
  const photoGround = !!c.bgImage;
  const shadowSoft = photoGround
    ? "0 0 0 1px rgba(255,255,255,.10), 0 1px 3px rgba(15,23,42,.10), 0 10px 24px rgba(15,23,42,.18)"
    : darkGround
      ? "0 0 0 1px rgba(255,255,255,.07), 0 8px 20px rgba(0,0,0,.45)"
      : "0 1px 3px rgba(15,23,42,.08), 0 6px 14px rgba(15,23,42,.04)";
  const shadowStrong = photoGround
    ? "0 0 0 1px rgba(255,255,255,.14), 0 2px 6px rgba(15,23,42,.14), 0 16px 36px rgba(15,23,42,.28)"
    : darkGround
      ? "0 0 0 1px rgba(255,255,255,.12), 0 14px 34px rgba(0,0,0,.6)"
      : "0 2px 6px rgba(15,23,42,.12), 0 14px 32px rgba(15,23,42,.12)";
  const shadowVal =
    c.shadow === "none"
      ? "none"
      : c.shadow === "strong"
        ? shadowStrong
        : c.shadow === "soft"
          ? shadowSoft
          : t.shadow
            ? shadowSoft
            : "none";
  /* 버튼 스타일 — 링크 버튼의 "기본" 변형이 따른다(채움/외곽선/은은하게) */
  const btn = c.button ?? "fill";
  /* 전체 적용(리틀리 buttonColorLayout=inverted) — 모든 링크 버튼이 강조색 채움 */
  const all = c.buttonScope === "all";
  /* 카드 색 가드(2026-08-24 비평) — 「카드」 색에는 검사가 하나도 없어서 어두운 카드색을 고르면
     카드 위 글자(fg)가 통째로 안 읽혔다. 글자 대비가 4.5:1 미만이면 프리셋 카드색으로 되돌린다.
     디자인 탭 문구가 "대비가 낮으면 자동으로 읽히는 쪽으로 바꿔요"라고 약속하고 있다. */
  const cardReadable = !c.card || contrastRatio(fg, card) >= 4.5;
  const cardSafe = cardReadable ? card : t.card;
  /* 카드 밝기는 지면과 **다른 축**이다 — 카드 위에 얹는 잉크(오류색 등)는 이쪽을 따른다.
     반드시 **가드를 통과한** cardSafe 를 본다(되돌려진 색이 실제로 칠해지는 색이다). */
  const darkCard = luminance(HEX.test(cardSafe) ? cardSafe : "#ffffff") < 0.35;
  const btnBg = all ? accent : btn === "fill" ? cardSafe : btn === "outline" ? "transparent" : `color-mix(in srgb, ${accent} 14%, transparent)`;
  /* 외곽선·은은하게의 글자는 강조색인데, 코랄·피치처럼 밝은 강조색은 배경 위에서 2.3~3.1:1 이다 — 안 읽히면 본문색으로(감사2 U8) */
  const accentReadable = contrastRatio(accent, bg) >= 4.5;
  const accentText = accentReadable ? accent : fg;
  const btnFg = all ? onAccent : btn === "fill" ? fg : accentText;
  const btnBorder = all ? accent : btn === "fill" ? border : btn === "outline" ? accent : "transparent";
  return {
    "--lp-bg": bg,
    "--lp-bg-image": bgImage,
    "--lp-bg-blur": bgBlur,
    "--lp-font": font,
    "--lp-btn-bg": btnBg,
    "--lp-btn-fg": btnFg,
    "--lp-btn-border": btnBorder,
    "--lp-cursor": cursorCss(c.cursor),
    "--lp-fg": fg,
    "--lp-muted": muted,
    "--lp-card": cardSafe,
    "--lp-border": border,
    "--lp-accent": accent,
    /* 배경 위 글자로 쓸 강조색 — 대비 4.5 미만이면 본문색. 외곽선 강조 버튼·태그 칩이 쓴다 */
    "--lp-accent-text": accentText,
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
    "--lp-shadow": shadowVal,
    /* 오류색 — 테마와 무관하게 고정한다(스크림과 같은 성격). 방문자 폼의 실패 안내는
       어떤 테마에서도 "빨강"으로 읽혀야 하고, 강조색이 빨강인 테마와도 구분돼야 한다.
       어두운 지면에서는 잉크를 밝게 올린다. 컴포넌트에 hex 를 쓰지 않기 위한 토큰이다. */
    "--lp-danger": "#E5484D",
    /* 잉크는 **카드** 위에 얹힌다 — 지면(darkGround)으로 고르면 어두운 사진 + 흰 카드에서
       분홍 글자가 흰 띠 위에 놓여 1.2:1 이 된다(소넷 확정) */
    "--lp-danger-ink": darkCard ? "#FFC9CB" : "#B42318",
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
/** SNS 채널 — 목록의 단일 출처는 lib/links/sns-catalog.ts(리틀리 흡수 4단계, 90여 채널) */
export const SNS_KINDS: ReadonlyArray<{ key: string; label: string }> = SNS_CATALOG.map((s) => ({ key: s.key, label: s.label }));

export type SnsKind = string;
