import type { BlockType } from "./blocks";
import { contrastRatio, mixHex } from "./themes";

/*
  AI 디자인 엔진(2026-08-28 사장님 지시: «A부터 Z까지 AI가 디자인») — 순수 모듈.

  구조: 인터뷰(분야·목적·무드·소개) + 프로필 사진 팔레트(클라이언트 추출)
        → 카피(서버 Claude, 키 없으면 이 파일의 폴백) → **시안 3종**(테마+직접 꾸미기+블록).

  왜 «스키마 채우기»인가: AI 가 자유롭게 그리면 하한이 무너진다. 여기서는 AI 의 몫을
  카피와 취향 판단으로 좁히고, 색·대비·블록 구조는 이 엔진이 우리 디자인 시스템
  (themes.ts 스키마 + blocks 카탈로그) 안에서 조립한다 — 대비 관문(4.5:1)까지 통과한
  값만 나가므로 «디자인 못 하는 사람»이 무엇을 답해도 페이지가 망가지지 않는다.

  사진 → 배경 매칭(사장님 지시 핵심):
  · 시안 A «포토 워시»: 사진 자체를 흐려 배경으로(bgWash) — 항상 사진과 100% 어울린다
  · 시안 B «팔레트»: 사진에서 뽑은 주조색으로 지면·그라데이션·강조색을 만든다
  · 시안 C: 무드·사진 명도에 따라 파스텔/딥 다크/에디토리얼 중 하나
*/

/* ── 인터뷰 선택지 — 모달(PickChips)과 엔진이 같은 키를 쓴다 ── */
export const AI_FIELDS = [
  { key: "creator", label: "크리에이터·인플루언서" },
  { key: "seller", label: "판매·공동구매" },
  { key: "store", label: "카페·매장·공간" },
  { key: "beauty", label: "뷰티·패션" },
  { key: "portfolio", label: "포트폴리오·프리랜서" },
  { key: "etc", label: "그 외" },
] as const;
export const AI_GOALS = [
  { key: "follow", label: "구독·팔로우 늘리기" },
  { key: "sell", label: "판매로 잇기" },
  { key: "visit", label: "방문·예약 받기" },
  { key: "inquiry", label: "문의 받기" },
  { key: "showcase", label: "작업 보여주기" },
] as const;
export const AI_MOODS = [
  { key: "calm", label: "차분한" },
  { key: "bright", label: "화사한" },
  { key: "warm", label: "따뜻한" },
  { key: "chic", label: "시크한" },
  { key: "minimal", label: "미니멀" },
  { key: "lovely", label: "러블리" },
] as const;

export type AiField = (typeof AI_FIELDS)[number]["key"];
export type AiGoal = (typeof AI_GOALS)[number]["key"];
export type AiMood = (typeof AI_MOODS)[number]["key"];

export interface AiPalette {
  /** 사진 주조색(면적 기준) */
  main: string;
  /** 사진에서 가장 생생한 색 — 강조색 후보 */
  vivid: string;
  /** 사진이 전반적으로 어두운가 */
  dark: boolean;
}

export interface AiBrief {
  field: AiField;
  goal: AiGoal;
  mood: AiMood;
  /** 한 줄 소개(사용자 자신의 말 — 카피에 그대로 스며든다). 비어 있을 수 있다 */
  intro: string;
  palette: AiPalette | null;
  hasPhoto: boolean;
}

/** 시안 카피 — 서버(Claude)가 만들거나, 키가 없으면 fallbackCopy 가 만든다 */
export interface AiCopy {
  /** 상단 알림 한 줄(구체적 사실 어투) */
  notice: string;
  /** 대표 CTA 버튼 문구 */
  cta: string;
  /** 소개 문단(1~2문장) — 사용자의 intro 를 다듬은 것 */
  intro: string;
  /** 수집 블록(구독/문의) 제목 */
  leadTitle: string;
  /** 수집 블록 설명 한 줄 */
  leadDesc: string;
  /** 클로징 한 줄 */
  closing: string;
}

export interface AiDesign {
  key: string;
  name: string;
  /** 카드에 보여줄 한 줄 설명 */
  note: string;
  theme: string;
  custom: Record<string, unknown>;
  blocks: Array<{ type: BlockType; data: Record<string, unknown> }>;
  /** 카드 스와치(왼쪽부터 지면·카드·강조) — 미리보기 전 한눈 비교용 */
  swatch: [string, string, string];
}

/* ── 색 도구 — 전부 themes.ts 의 검증된 함수 위에서 ── */

/** 흰 글자 대비 4.5:1 이 될 때까지 어둡게 — 강조색 관문 */
function ensureAccent(hex: string): string {
  let c = hex.toUpperCase();
  for (let i = 0; i < 10; i++) {
    if (contrastRatio(c, "#FFFFFF") >= 4.5) return c;
    c = mixHex(c, "#000000", 0.12);
  }
  return "#16161C";
}
const lighten = (hex: string, t: number) => mixHex(hex, "#FFFFFF", t);

/* ── 무드 → 글꼴·모서리 (LINK_FONTS/CUSTOM_RADIUS 의 실재 키만) ── */
const MOOD_STYLE: Record<AiMood, { font: string; radius: "sm" | "md" | "lg" | "full" }> = {
  calm: { font: "gowun-dodum", radius: "md" },
  bright: { font: "noto-sans", radius: "lg" },
  warm: { font: "gowun-batang", radius: "lg" },
  chic: { font: "ibm-plex", radius: "sm" },
  minimal: { font: "sans", radius: "sm" },
  lovely: { font: "hi-melody", radius: "full" },
};

/* ── 분야 → 대표 링크 목적지(전부 서비스 홈 — 사용자가 자기 주소로 바꾼다) ── */
const FIELD_URL: Record<AiField, string> = {
  creator: "https://www.youtube.com/",
  seller: "https://smartstore.naver.com/",
  store: "https://www.instagram.com/",
  beauty: "https://www.instagram.com/",
  portfolio: "https://blog.naver.com/",
  etc: "https://www.instagram.com/",
};

/** 키 없이도 동작하는 카피 — 사용자의 말(intro)을 최대한 그대로 살린다 */
export function fallbackCopy(brief: AiBrief): AiCopy {
  const intro =
    brief.intro.trim() ||
    {
      creator: "매주 새 콘텐츠로 찾아옵니다.",
      seller: "직접 써 보고 좋은 것만 골라 소개합니다.",
      store: "천천히 머물다 가시길 바라는 마음으로 준비합니다.",
      beauty: "오늘 나에게 어울리는 것을 함께 찾습니다.",
      portfolio: "기록이 곧 포트폴리오가 되도록, 꾸준히 만듭니다.",
      etc: "여기서 소식과 링크를 한곳에 모았습니다.",
    }[brief.field];
  const notice = {
    follow: "새 소식은 이 페이지에서 가장 먼저 알려드려요",
    sell: "이번 주 추천 — 아래에서 바로 보실 수 있어요",
    visit: "예약·방문 안내를 한곳에 모았어요",
    inquiry: "문의는 아래 폼으로 — 하루 안에 답해요",
    showcase: "최근 작업을 아래에 모아 두었어요",
  }[brief.goal];
  const cta = {
    follow: "구독하고 소식 받기",
    sell: "지금 보러 가기",
    visit: "예약·방문 안내 보기",
    inquiry: "문의 남기기",
    showcase: "대표 작업 보기",
  }[brief.goal];
  const [leadTitle, leadDesc] =
    brief.goal === "visit" || brief.goal === "inquiry"
      ? ["문의·예약", "이름과 연락처를 남겨 주시면 하루 안에 답해드려요."]
      : ["새 소식 받기", "새 소식이 있는 날에만 보내요. 스팸은 없어요."];
  const closing = {
    calm: "오늘도 조용히, 꾸준히.",
    bright: "좋은 소식으로 다시 올게요.",
    warm: "찾아와 주셔서 고맙습니다.",
    chic: "필요한 것만, 정확하게.",
    minimal: "여기까지가 전부입니다 — 충분하도록.",
    lovely: "와 준 것만으로도 고마워요.",
  }[brief.mood];
  return { notice, cta, intro, leadTitle, leadDesc, closing };
}

/* ── 블록 조립 — 분야 뼈대 + 목적 수집 + 카피 ── */
function buildBlocks(brief: AiBrief, copy: AiCopy): Array<{ type: BlockType; data: Record<string, unknown> }> {
  const url = FIELD_URL[brief.field];
  const blocks: Array<{ type: BlockType; data: Record<string, unknown> }> = [];

  blocks.push({ type: "notice", data: { text: copy.notice, tone: "primary" } });
  /* 소개(copy.intro)는 블록이 아니라 **헤더 bio** 로 들어간다 — 헤더 소개와 블록 소개가
     두 벌로 겹쳐 보이던 것(쏘넷 점검). applyAiDesign 이 bio 를 함께 저장한다 */
  blocks.push({ type: "link", data: { label: copy.cta, url, emphasis: "primary" } });

  /* 분야별 가운데 토막 — 빈 값 블록은 편집기에서 «채우면 보여요» 유령 카드가 되어
     다음 할 일을 안내한다(공개 페이지엔 안 나가므로 껍데기 위험 없음) */
  if (brief.field === "creator" || brief.field === "beauty") {
    blocks.push({ type: "heading", data: { text: "요즘 올린 것" } });
    blocks.push({ type: "social_feed", data: { channel: "instagram", count: 3 } });
    blocks.push({
      type: "card_row",
      data: { items: [{ title: "협업·광고 문의", subtitle: "DM 주시면 소개서를 보내드려요", url: "https://www.instagram.com/" }] },
    });
  } else if (brief.field === "seller") {
    blocks.push({ type: "heading", data: { text: "지금 판매 중" } });
    blocks.push({
      type: "grid",
      data: {
        columns: 2,
        items: [
          { title: "대표 상품 1", url },
          { title: "대표 상품 2", url },
        ],
      },
    });
    blocks.push({ type: "link", data: { label: "지난 판매 모아보기", url: "https://www.instagram.com/", emphasis: "outline" } });
  } else if (brief.field === "store") {
    blocks.push({ type: "heading", data: { text: "찾아오시는 길" } });
    blocks.push({ type: "map", data: { address: "", label: "매장 위치" } });
    blocks.push({ type: "text", data: { text: "영업시간을 여기에 적어 주세요", align: "center" } });
  } else if (brief.field === "portfolio") {
    blocks.push({ type: "heading", data: { text: "최근 작업" } });
    blocks.push({ type: "gallery", data: { items: [], layout: "grid", aspect: "square" } });
    blocks.push({
      type: "card_row",
      data: { items: [{ title: "작업 의뢰·제안", subtitle: "간단히 남겨 주시면 검토 후 연락드려요", url }] },
    });
  } else {
    blocks.push({ type: "link", data: { label: "인스타그램", url: "https://www.instagram.com/" } });
    blocks.push({ type: "link", data: { label: "유튜브", url: "https://www.youtube.com/" } });
  }

  blocks.push({ type: "divider", data: { style: "line" } });
  if (brief.goal === "visit" || brief.goal === "inquiry") {
    blocks.push({
      type: "contact",
      data: { title: copy.leadTitle, description: copy.leadDesc, fields: ["name", "phone", "message"] },
    });
  } else {
    blocks.push({ type: "subscribe", data: { title: copy.leadTitle, description: copy.leadDesc, buttonLabel: "신청하기" } });
  }
  blocks.push({ type: "spacer", data: { size: 16 } });
  blocks.push({ type: "text", data: { text: copy.closing, align: "center" } });
  return blocks;
}

/** 시안 3종 조립 — 사진 팔레트가 색을 정하고, 무드가 글꼴·모서리를 정한다 */
export function buildDesigns(brief: AiBrief, copy: AiCopy): AiDesign[] {
  const style = MOOD_STYLE[brief.mood];
  const pal = brief.palette;
  const accent = ensureAccent(pal?.vivid ?? "#C7502B");
  const blocks = buildBlocks(brief, copy);
  const designs: AiDesign[] = [];

  /* A. 포토 워시 — 사진을 흐려 배경으로. 사진과 «어울림»이 구조적으로 보장된다 */
  if (brief.hasPhoto) {
    designs.push({
      key: "wash",
      name: "포토 워시",
      note: "프로필 사진을 은은하게 번지게 깔아 배경으로 써요",
      theme: "basic",
      custom: { bgWash: true, accent, font: style.font, radius: style.radius, anim: "rise", shadow: "soft" },
      blocks,
      swatch: [lighten(pal?.main ?? "#EAEAEA", 0.5), lighten(pal?.main ?? "#EAEAEA", 0.78), accent],
    });
  }

  /* B. 팔레트 — 사진 주조색으로 지면·그라데이션을 만든다 */
  if (pal) {
    /* 워시(사진 블러)와 갈리게 색을 한 단계 진하게 깐다 — 저채도 사진에서 A·B 가
       같은 살구색으로 수렴하던 것(쏘넷 점검) */
    const bg = lighten(pal.main, 0.78);
    const bg2 = lighten(pal.vivid, 0.68);
    designs.push({
      key: "palette",
      name: "컬러 팔레트",
      note: "사진에서 뽑은 색을 진하게 깔았어요 — 버튼은 둥근 소프트 톤",
      theme: "basic",
      custom: { bg, bg2, accent, font: style.font, radius: style.radius, button: "soft", anim: "rise", shadow: "soft" },
      blocks,
      swatch: [bg, bg2, accent],
    });
  }

  /* C. 무드 픽 — 사진 명도·무드에 따라 셋 중 하나 */
  if (pal?.dark || brief.mood === "chic") {
    designs.push({
      key: "deep",
      name: "딥 나이트",
      note: "어두운 지면 위에서 사진과 강조색이 또렷해져요",
      theme: "midnight",
      custom: { font: style.font, anim: "rise" },
      blocks,
      swatch: ["#0B1220", "#14203A", "#6EA8FF"],
    });
  } else if (brief.mood === "minimal" || brief.mood === "calm") {
    designs.push({
      key: "editorial",
      name: "에디토리얼",
      note: "장식을 걷어낸 종이 같은 지면 — 글이 주인공이에요",
      theme: "porcelain",
      custom: { font: style.font, button: "outline", anim: "rise" },
      blocks,
      swatch: ["#F6F5F2", "#EAE7E1", "#2A2622"],
    });
  } else {
    designs.push({
      key: "pastel",
      name: "파스텔 무드",
      note: "군데군데 파스텔이 번진 배경 — 화사하고 부드럽게",
      theme: "basic",
      custom: { bgPastel: true, accent, font: style.font, radius: style.radius, anim: "rise" },
      blocks,
      swatch: [lighten(accent, 0.82), lighten(pal?.vivid ?? accent, 0.68), accent],
    });
  }

  /* 사진이 없으면 A 가 빠져 2개가 된다 — 클린 라이트로 셋을 채운다 */
  if (designs.length < 3) {
    designs.push({
      key: "clean",
      name: "클린 라이트",
      note: "밝은 지면에 강조색 하나 — 어디에나 어울리는 기본기",
      theme: "basic",
      custom: { accent, font: style.font, radius: style.radius, anim: "rise", shadow: "soft" },
      blocks,
      swatch: ["#F3F4F6", "#E7E9ED", accent],
    });
  }
  return designs.slice(0, 3);
}
