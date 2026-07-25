/**
 * 카드뉴스 편집기 데이터 모델 — canvas에 코드로 직접 그리던 카드를,
 * 개별 편집 가능한 요소(텍스트/도형/이미지) 트리로 변환한다.
 *
 * buildEditorScene(slide)이 export-slides.ts의 역할별 레이아웃을 요소들로 재현해,
 * 편집기 진입 시 "미리보기와 같은 카드"에서 시작하도록 한다. 이후 사용자가 요소를
 * 이동·수정·추가·삭제한다. 내보내기는 Konva Stage.toDataURL로 1080px PNG를 만든다.
 */

import type { ExportSlide } from "./export-slides";

export const CARD_SIZE = 1080;
export const CARD_PAD = 96;
const CW = CARD_SIZE - CARD_PAD * 2;

export const INK = "#0C0C11";
export const PAPER = "#FAF8F4";
export const CORAL = "#FF6B4A";
export const EDITOR_FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export type ElementType = "text" | "rect" | "circle" | "image";

interface BaseEl {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  rotation: number;
  /** false면 선택·이동 불가 (배경 장식 등). 기본 true */
  draggable: boolean;
}

export interface TextEl extends BaseEl {
  type: "text";
  text: string;
  width: number;
  fontSize: number;
  fontStyle: "normal" | "bold";
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  opacity: number;
}

export interface RectEl extends BaseEl {
  type: "rect";
  width: number;
  height: number;
  fill: string;
  cornerRadius: number;
  opacity: number;
}

export interface CircleEl extends BaseEl {
  type: "circle";
  radius: number;
  fill: string;
  opacity: number;
}

export interface ImageEl extends BaseEl {
  type: "image";
  width: number;
  height: number;
  src: string;
}

export type EditorElement = TextEl | RectEl | CircleEl | ImageEl;

export interface EditorScene {
  background: string;
  elements: EditorElement[];
}

let idCounter = 0;
export function nextId(prefix = "el"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${idCounter * 2654435761 % 100000}`;
}

function text(partial: Partial<TextEl> & { text: string; x: number; y: number; width: number; fontSize: number }): TextEl {
  return {
    id: nextId("t"),
    type: "text",
    rotation: 0,
    draggable: true,
    fontStyle: "bold",
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

/** 역할별 카드 레이아웃을 편집 요소들로 변환 (export-slides.ts 좌표와 근사) */
export function buildEditorScene(slide: ExportSlide, total: number, aiGenerated: boolean): EditorScene {
  if (slide.role === "cover") return coverScene(slide);
  if (slide.role === "closing") return closingScene(slide, aiGenerated);
  return contentScene(slide, total);
}

function coverScene(s: ExportSlide): EditorScene {
  const els: EditorElement[] = [];
  if (s.kicker) {
    els.push(rect({ x: CARD_PAD, y: 150, width: 7, height: 34, fill: CORAL }));
    els.push(text({ text: s.kicker, x: CARD_PAD + 24, y: 148, width: CW, fontSize: 28, fill: CORAL }));
  }
  els.push(rect({ x: CARD_PAD, y: 452, width: 96, height: 9, fill: CORAL }));
  els.push(text({ text: s.headline, x: CARD_PAD, y: 470, width: CW, fontSize: 98, fill: PAPER, lineHeight: 1.18 }));
  if (s.footnote) {
    els.push(text({ text: s.footnote, x: CARD_PAD, y: 800, width: CW, fontSize: 38, fill: PAPER, fontStyle: "normal", opacity: 0.72 }));
  }
  els.push(text({ text: "밀어서 보기 →", x: CARD_PAD, y: 952, width: CW, fontSize: 28, fill: PAPER, fontStyle: "normal", opacity: 0.55 }));
  return { background: INK, elements: els };
}

function contentScene(s: ExportSlide, total: number): EditorScene {
  const els: EditorElement[] = [];
  const bx = CARD_PAD + 34;
  const by = 150;
  const br = 38;
  els.push(circle({ x: bx, y: by, radius: br, fill: CORAL }));
  els.push(text({ text: String(s.no).padStart(2, "0"), x: bx - br, y: by - 20, width: br * 2, fontSize: 34, fill: PAPER, align: "center" }));
  if (s.kicker) {
    els.push(text({ text: s.kicker, x: bx + br + 26, y: by - 18, width: CW, fontSize: 28, fill: CORAL }));
  }
  els.push(text({ text: s.headline, x: CARD_PAD, y: 232, width: CW, fontSize: 62, fill: INK, lineHeight: 1.26 }));

  const points = (s.points ?? []).slice(0, 4);
  let py = 460;
  const pr = 26;
  points.forEach((p, i) => {
    els.push(circle({ x: CARD_PAD + pr, y: py + 22, radius: pr, fill: CORAL }));
    els.push(text({ text: String(i + 1), x: CARD_PAD, y: py + 6, width: pr * 2, fontSize: 26, fill: PAPER, align: "center" }));
    els.push(text({ text: p, x: CARD_PAD + pr * 2 + 22, y: py, width: CW - pr * 2 - 22, fontSize: 38, fill: INK }));
    py += 92;
  });

  if (s.footnote) {
    els.push(text({ text: `— ${s.footnote}`, x: CARD_PAD, y: py + 10, width: CW, fontSize: 32, fill: INK, fontStyle: "normal", opacity: 0.6 }));
  }
  els.push(rect({ x: CARD_PAD, y: 908, width: 72, height: 6, fill: CORAL }));
  els.push(text({ text: `${String(s.no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, x: CARD_SIZE - CARD_PAD - 200, y: 958, width: 200, fontSize: 28, fill: INK, fontStyle: "normal", align: "right", opacity: 0.5 }));
  return { background: PAPER, elements: els };
}

function closingScene(s: ExportSlide, aiGenerated: boolean): EditorScene {
  const els: EditorElement[] = [];
  els.push(rect({ x: CARD_PAD, y: 300, width: 96, height: 9, fill: CORAL }));
  els.push(text({ text: s.headline, x: CARD_PAD, y: 340, width: CW, fontSize: 76, fill: PAPER, lineHeight: 1.2 }));
  if (s.body) {
    els.push(text({ text: s.body, x: CARD_PAD, y: 520, width: CW, fontSize: 38, fill: PAPER, fontStyle: "normal", opacity: 0.72 }));
  }
  const btnY = 680;
  const btnH = 104;
  els.push(rect({ x: CARD_PAD, y: btnY, width: CW, height: btnH, fill: CORAL, cornerRadius: btnH / 2 }));
  els.push(text({ text: s.cta?.text ?? "저장하기", x: CARD_PAD, y: btnY + btnH / 2 - 26, width: CW, fontSize: 40, fill: PAPER, align: "center" }));
  if (aiGenerated) {
    els.push(text({ text: "AI 생성", x: CARD_PAD, y: 952, width: CW, fontSize: 26, fill: PAPER, fontStyle: "normal", align: "center", opacity: 0.5 }));
  }
  return { background: INK, elements: els };
}
