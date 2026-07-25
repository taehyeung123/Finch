/**
 * 카드뉴스 편집기 데이터 모델 — canvas에 코드로 직접 그리던 카드를,
 * 개별 편집 가능한 요소(텍스트/도형/이미지) 트리로 변환한다.
 *
 * buildEditorScene(slide)이 export-slides.ts의 역할별 레이아웃을 요소들로 재현해,
 * 편집기 진입 시 "미리보기와 같은 카드"에서 시작하도록 한다. 이후 사용자가 요소를
 * 이동·수정·추가·삭제한다. 내보내기는 Konva Stage.toDataURL로 1080px PNG를 만든다.
 */

import type { ExportSlide, LogoPlacement } from "./export-slides";
import { type CardTemplate, DEFAULT_TEMPLATE } from "./templates";

export const CARD_SIZE = 1080;
export const CARD_PAD = 96;
const CW = CARD_SIZE - CARD_PAD * 2;

export const INK = "#0C0C11";
export const PAPER = "#FAF8F4";
export const CORAL = "#FF6B4A";
export const EDITOR_FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

/**
 * 편집기에서 고를 수 있는 폰트 — 전부 cdn.jsdelivr.net 호스팅(눈누 공개 폰트)이라
 * proxy.ts CSP(font-src 'self' jsdelivr)를 바꾸지 않고 쓸 수 있다.
 * 단일 웨이트 폰트(도현·주아·리디바탕)는 굵기 조절 시 캔버스가 합성 볼드로 그린다.
 */
export const FONT_OPTIONS: { label: string; family: string }[] = [
  { label: "프리텐다드", family: EDITOR_FONT },
  { label: "지마켓 산스", family: "GmarketSans" },
  { label: "배민 도현", family: "BMDOHYEON" },
  { label: "배민 주아", family: "BMJUA" },
  { label: "리디바탕", family: "RIDIBatang" },
];

/** 편집기 마운트 시 <style>로 주입하는 @font-face 정의 (jsdelivr — CSP 허용 오리진) */
export const FONT_FACE_CSS = `
@font-face { font-family: 'GmarketSans'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansMedium.woff') format('woff'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'GmarketSans'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansBold.woff') format('woff'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'BMDOHYEON'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/BMDOHYEON.woff') format('woff'); font-display: swap; }
@font-face { font-family: 'BMJUA'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/BMJUA.woff') format('woff'); font-display: swap; }
@font-face { font-family: 'RIDIBatang'; src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/RIDIBatang.woff') format('woff'); font-display: swap; }
`;

/** 글씨 굵기 단계 — Konva fontStyle에 숫자 웨이트 문자열로 전달된다 */
export const WEIGHT_OPTIONS: { label: string; value: string }[] = [
  { label: "가늘게", value: "300" },
  { label: "보통", value: "400" },
  { label: "중간", value: "500" },
  { label: "굵게", value: "700" },
  { label: "아주 굵게", value: "900" },
];

export type ElementType = "text" | "rect" | "circle" | "image" | "line" | "arrow" | "star" | "polygon";

interface BaseEl {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  /** false면 선택·이동 불가 (배경 장식 등). 기본 true */
  draggable: boolean;
}

export interface TextEl extends BaseEl {
  type: "text";
  text: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  /** Konva fontStyle — "300"~"900" 숫자 웨이트 문자열 */
  fontStyle: string;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
}

export interface RectEl extends BaseEl {
  type: "rect";
  width: number;
  height: number;
  fill: string;
  cornerRadius: number;
}

export interface CircleEl extends BaseEl {
  type: "circle";
  radius: number;
  fill: string;
}

export interface ImageEl extends BaseEl {
  type: "image";
  width: number;
  height: number;
  src: string;
}

export interface LineEl extends BaseEl {
  type: "line";
  /** x,y 기준 상대 좌표 [x1,y1,x2,y2] */
  points: number[];
  stroke: string;
  strokeWidth: number;
}

export interface ArrowEl extends BaseEl {
  type: "arrow";
  points: number[];
  stroke: string;
  /** 화살촉 채움 — stroke와 같은 색으로 유지한다 */
  fill: string;
  strokeWidth: number;
}

export interface StarEl extends BaseEl {
  type: "star";
  numPoints: number;
  innerRadius: number;
  outerRadius: number;
  fill: string;
}

export interface PolygonEl extends BaseEl {
  type: "polygon";
  sides: number;
  radius: number;
  fill: string;
}

export type EditorElement = TextEl | RectEl | CircleEl | ImageEl | LineEl | ArrowEl | StarEl | PolygonEl;

export interface EditorScene {
  background: string;
  elements: EditorElement[];
}

let idCounter = 0;
export function nextId(prefix = "el"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${(idCounter * 2654435761) % 100000}`;
}

function text(
  partial: Partial<TextEl> & { text: string; x: number; y: number; width: number; fontSize: number },
): TextEl {
  return {
    id: nextId("t"),
    type: "text",
    rotation: 0,
    draggable: true,
    fontFamily: EDITOR_FONT,
    fontStyle: "700",
    fill: INK,
    align: "left",
    lineHeight: 1.2,
    opacity: 1,
    ...partial,
  };
}

function rect(partial: Partial<RectEl> & { x: number; y: number; width: number; height: number; fill: string }): RectEl {
  return {
    id: nextId("r"),
    type: "rect",
    rotation: 0,
    draggable: true,
    cornerRadius: 0,
    opacity: 1,
    ...partial,
  };
}

function circle(partial: Partial<CircleEl> & { x: number; y: number; radius: number; fill: string }): CircleEl {
  return { id: nextId("c"), type: "circle", rotation: 0, draggable: true, opacity: 1, ...partial };
}

/** 역할별 카드 레이아웃을 편집 요소들로 변환 (export-slides.ts 좌표와 근사). 색은 템플릿에서. */
export function buildEditorScene(
  slide: ExportSlide,
  total: number,
  aiGenerated: boolean,
  tpl: CardTemplate = DEFAULT_TEMPLATE,
  logo?: { url: string; placement: LogoPlacement },
): EditorScene {
  const scene =
    slide.role === "cover"
      ? coverScene(slide, tpl)
      : slide.role === "closing"
        ? closingScene(slide, aiGenerated, tpl)
        : contentScene(slide, total, tpl);

  // 로고 — placement/role이 맞으면 우상단에 편집 가능한 이미지 요소로 추가
  if (logo?.url) {
    const show = logo.placement === "all" || logo.placement === slide.role;
    if (show) {
      scene.elements.push({
        id: nextId("logo"),
        type: "image",
        src: logo.url,
        x: CARD_SIZE - CARD_PAD - 200,
        y: 76,
        width: 200,
        height: 80,
        opacity: 1,
        rotation: 0,
        draggable: true,
      });
    }
  }
  return scene;
}

function coverScene(s: ExportSlide, tpl: CardTemplate): EditorScene {
  const els: EditorElement[] = [];
  if (s.kicker) {
    els.push(rect({ x: CARD_PAD, y: 150, width: 7, height: 34, fill: tpl.accent }));
    els.push(text({ text: s.kicker, x: CARD_PAD + 24, y: 148, width: CW, fontSize: 28, fill: tpl.accent }));
  }
  els.push(rect({ x: CARD_PAD, y: 452, width: 96, height: 9, fill: tpl.accent }));
  els.push(text({ text: s.headline, x: CARD_PAD, y: 470, width: CW, fontSize: 98, fill: tpl.paper, lineHeight: 1.18, fontStyle: "900" }));
  if (s.footnote) {
    els.push(text({ text: s.footnote, x: CARD_PAD, y: 800, width: CW, fontSize: 38, fill: tpl.paper, fontStyle: "400", opacity: 0.72 }));
  }
  els.push(text({ text: "밀어서 보기 →", x: CARD_PAD, y: 952, width: CW, fontSize: 28, fill: tpl.paper, fontStyle: "400", opacity: 0.55 }));
  return { background: tpl.ink, elements: els };
}

function contentScene(s: ExportSlide, total: number, tpl: CardTemplate): EditorScene {
  const els: EditorElement[] = [];
  const bx = CARD_PAD + 34;
  const by = 150;
  const br = 38;
  els.push(circle({ x: bx, y: by, radius: br, fill: tpl.accent }));
  els.push(text({ text: String(s.no).padStart(2, "0"), x: bx - br, y: by - 20, width: br * 2, fontSize: 34, fill: tpl.onAccent, align: "center", fontStyle: "800" }));
  if (s.kicker) {
    els.push(text({ text: s.kicker, x: bx + br + 26, y: by - 18, width: CW, fontSize: 28, fill: tpl.accent }));
  }
  els.push(text({ text: s.headline, x: CARD_PAD, y: 232, width: CW, fontSize: 62, fill: tpl.ink, lineHeight: 1.26, fontStyle: "800" }));

  const points = (s.points ?? []).slice(0, 4);
  let py = 460;
  const pr = 26;
  points.forEach((p, i) => {
    els.push(circle({ x: CARD_PAD + pr, y: py + 22, radius: pr, fill: tpl.accent }));
    els.push(text({ text: String(i + 1), x: CARD_PAD, y: py + 6, width: pr * 2, fontSize: 26, fill: tpl.onAccent, align: "center", fontStyle: "800" }));
    els.push(text({ text: p, x: CARD_PAD + pr * 2 + 22, y: py, width: CW - pr * 2 - 22, fontSize: 38, fill: tpl.ink }));
    py += 92;
  });

  if (s.footnote) {
    els.push(text({ text: `— ${s.footnote}`, x: CARD_PAD, y: py + 10, width: CW, fontSize: 32, fill: tpl.ink, fontStyle: "400", opacity: 0.6 }));
  }
  els.push(rect({ x: CARD_PAD, y: 908, width: 72, height: 6, fill: tpl.accent }));
  els.push(text({ text: `${String(s.no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, x: CARD_SIZE - CARD_PAD - 200, y: 958, width: 200, fontSize: 28, fill: tpl.ink, fontStyle: "400", align: "right", opacity: 0.5 }));
  return { background: tpl.paper, elements: els };
}

function closingScene(s: ExportSlide, aiGenerated: boolean, tpl: CardTemplate): EditorScene {
  const els: EditorElement[] = [];
  els.push(rect({ x: CARD_PAD, y: 300, width: 96, height: 9, fill: tpl.accent }));
  els.push(text({ text: s.headline, x: CARD_PAD, y: 340, width: CW, fontSize: 76, fill: tpl.paper, lineHeight: 1.2, fontStyle: "900" }));
  if (s.body) {
    els.push(text({ text: s.body, x: CARD_PAD, y: 520, width: CW, fontSize: 38, fill: tpl.paper, fontStyle: "400", opacity: 0.72 }));
  }
  const btnY = 680;
  const btnH = 104;
  els.push(rect({ x: CARD_PAD, y: btnY, width: CW, height: btnH, fill: tpl.accent, cornerRadius: btnH / 2 }));
  els.push(text({ text: s.cta?.text ?? "저장하기", x: CARD_PAD, y: btnY + btnH / 2 - 26, width: CW, fontSize: 40, fill: tpl.onAccent, align: "center", fontStyle: "800" }));
  if (aiGenerated) {
    els.push(text({ text: "AI 생성", x: CARD_PAD, y: 952, width: CW, fontSize: 26, fill: tpl.paper, fontStyle: "400", align: "center", opacity: 0.5 }));
  }
  return { background: tpl.ink, elements: els };
}
