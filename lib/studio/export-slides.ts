"use client";

/**
 * 카드뉴스 PNG 렌더링 — 슬라이드를 1080x1080 캔버스에 그린다.
 *
 * 역할(role)별로 레이아웃이 다르다 (표지/본문/마무리). 인스타 정보성 카드뉴스 패턴을 따른다:
 *   - cover   : 잉크 전면 배경 + 키커 + 큰 헤드라인 + 부연 + 스와이프 힌트
 *   - content : 페이퍼 전면 배경 + 번호배지 + 키커 + 헤드라인 + 번호 포인트 리스트 + 구분선/페이지
 *   - closing : 잉크 전면 배경(표지와 수미상관) + 요약 + 강조 CTA 버튼
 * 카드를 넘길 때 잉크면↔페이퍼면 명암이 교대되며 리듬이 생긴다.
 *
 * 색은 CardTemplate(잉크/페이퍼/강조/강조위텍스트)에서 온다. 앱 UI가 아니라 "생성되는 이미지 자산"이라
 * 테마와 무관하게 항상 같은 색이 나와야 하므로 CSS 토큰 대신 템플릿 상수를 쓴다
 * (PDF·이메일 템플릿과 동일한 예외 — DESIGN.md 하드코딩 금지 규칙의 대상이 아님).
 */

import { type CardTemplate, DEFAULT_TEMPLATE, withAlpha } from "./templates";

export type SlideRole = "cover" | "content" | "closing";

export interface ExportSlide {
  role: SlideRole;
  no: number;
  /** 상단 라벨 (content 필수, cover 선택) */
  kicker?: string;
  headline: string;
  /** content 전용 — 핵심 포인트 명사구 2~4개 */
  points?: string[];
  /** cover/content 부연 한 줄 */
  footnote?: string;
  /** closing 요약 한 줄 */
  body?: string;
  /** closing CTA */
  cta?: { action: "save" | "follow" | "share"; text: string };
}

const SIZE = 1080;
const PAD = 96;
const CW = SIZE - PAD * 2;
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export type LogoPlacement = "cover" | "closing" | "all" | "none";
/** 렌더 시 이미 로드된 로고 이미지 + 어느 슬라이드에 넣을지 */
export interface LoadedLogo {
  img: CanvasImageSource & { width: number; height: number };
  placement: LogoPlacement;
}

/** 로고를 우상단에 그린다(높이 60, 최대폭 260). placement/role이 맞을 때만. */
function drawLogo(ctx: CanvasRenderingContext2D, logo: LoadedLogo, role: SlideRole) {
  const p = logo.placement;
  const show = p === "all" || (p === "cover" && role === "cover") || (p === "closing" && role === "closing");
  if (!show || !logo.img.width || !logo.img.height) return;
  let h = 60;
  let w = h * (logo.img.width / logo.img.height);
  if (w > 260) {
    h = h * (260 / w);
    w = 260;
  }
  ctx.drawImage(logo.img, SIZE - PAD - w, 84, w, h);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text).split("\n")) {
    const words = paragraph.split(" ");
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
      } else {
        let chunk = "";
        for (const ch of word) {
          const t = chunk + ch;
          if (ctx.measureText(t).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = t;
          }
        }
        line = chunk;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, s: ExportSlide, tpl: CardTemplate) {
  ctx.fillStyle = tpl.ink;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (s.kicker) {
    ctx.fillStyle = tpl.accent;
    ctx.fillRect(PAD, 150, 7, 34);
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(s.kicker, PAD + 24, 178);
  }

  ctx.fillStyle = tpl.accent;
  ctx.fillRect(PAD, 452, 96, 9);

  ctx.font = `800 98px ${FONT}`;
  const lines = wrapText(ctx, s.headline, CW).slice(0, 4);
  const lh = 116;
  let y = 560;
  ctx.fillStyle = tpl.paper;
  for (const l of lines) {
    ctx.fillText(l, PAD, y);
    y += lh;
  }

  if (s.footnote) {
    ctx.font = `500 38px ${FONT}`;
    ctx.fillStyle = withAlpha(tpl.paper, 0.72);
    const fl = wrapText(ctx, s.footnote, CW).slice(0, 2);
    let fy = y + 26;
    for (const l of fl) {
      ctx.fillText(l, PAD, fy);
      fy += 52;
    }
  }

  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = withAlpha(tpl.paper, 0.55);
  ctx.fillText("밀어서 보기 →", PAD, 980);
}

function drawContent(ctx: CanvasRenderingContext2D, s: ExportSlide, total: number, tpl: CardTemplate) {
  ctx.fillStyle = tpl.paper;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const bx = PAD + 34;
  const by = 150;
  const br = 38;
  ctx.fillStyle = tpl.accent;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tpl.onAccent;
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(s.no).padStart(2, "0"), bx, by + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (s.kicker) {
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = tpl.accent;
    ctx.fillText(s.kicker, bx + br + 26, by + 10);
  }

  ctx.font = `800 62px ${FONT}`;
  ctx.fillStyle = tpl.ink;
  const hl = wrapText(ctx, s.headline, CW).slice(0, 3);
  let y = 300;
  const hlh = 78;
  for (const l of hl) {
    ctx.fillText(l, PAD, y);
    y += hlh;
  }

  const points = (s.points ?? []).slice(0, 4);
  let py = y + 46;
  const pr = 26;
  const ptx = PAD + pr * 2 + 22;
  points.forEach((p, i) => {
    ctx.font = `700 38px ${FONT}`;
    const plines = wrapText(ctx, p, SIZE - ptx - PAD);
    const rowH = Math.max(pr * 2, plines.length * 50);
    ctx.fillStyle = tpl.accent;
    ctx.beginPath();
    ctx.arc(PAD + pr, py + 22, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tpl.onAccent;
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), PAD + pr, py + 24);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 38px ${FONT}`;
    ctx.fillStyle = tpl.ink;
    let ty = py + 34;
    for (const l of plines) {
      ctx.fillText(l, ptx, ty);
      ty += 50;
    }
    py += rowH + 34;
  });

  if (s.footnote) {
    ctx.font = `500 32px ${FONT}`;
    ctx.fillStyle = withAlpha(tpl.ink, 0.6);
    const fl = wrapText(ctx, `— ${s.footnote}`, CW).slice(0, 2);
    let fy = py + 24;
    for (const l of fl) {
      ctx.fillText(l, PAD, fy);
      fy += 44;
    }
  }

  ctx.fillStyle = tpl.accent;
  ctx.fillRect(PAD, 908, 72, 6);
  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = withAlpha(tpl.ink, 0.5);
  ctx.textAlign = "right";
  ctx.fillText(`${String(s.no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, SIZE - PAD, 984);
  ctx.textAlign = "left";
}

function drawClosing(ctx: CanvasRenderingContext2D, s: ExportSlide, aiGenerated: boolean, tpl: CardTemplate) {
  ctx.fillStyle = tpl.ink;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = tpl.accent;
  ctx.fillRect(PAD, 300, 96, 9);

  ctx.font = `800 76px ${FONT}`;
  ctx.fillStyle = tpl.paper;
  const hl = wrapText(ctx, s.headline, CW).slice(0, 3);
  let y = 410;
  const lh = 92;
  for (const l of hl) {
    ctx.fillText(l, PAD, y);
    y += lh;
  }

  if (s.body) {
    ctx.font = `500 38px ${FONT}`;
    ctx.fillStyle = withAlpha(tpl.paper, 0.72);
    const bl = wrapText(ctx, s.body, CW).slice(0, 2);
    let by = y + 20;
    for (const l of bl) {
      ctx.fillText(l, PAD, by);
      by += 52;
    }
    y = by;
  }

  const ctaText = s.cta?.text ?? "저장하기";
  const btnY = Math.max(y + 40, 680);
  const btnH = 104;
  const r = btnH / 2;
  ctx.fillStyle = tpl.accent;
  ctx.beginPath();
  ctx.moveTo(PAD + r, btnY);
  ctx.arcTo(SIZE - PAD, btnY, SIZE - PAD, btnY + btnH, r);
  ctx.arcTo(SIZE - PAD, btnY + btnH, PAD, btnY + btnH, r);
  ctx.arcTo(PAD, btnY + btnH, PAD, btnY, r);
  ctx.arcTo(PAD, btnY, SIZE - PAD, btnY, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tpl.onAccent;
  ctx.font = `800 40px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ctaText, SIZE / 2, btnY + btnH / 2 + 2);
  ctx.textBaseline = "alphabetic";

  // AI 생성 고지 — 정책상 유지. 템플릿 폴백에는 표기 안 함.
  if (aiGenerated) {
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = withAlpha(tpl.paper, 0.5);
    ctx.textAlign = "center";
    ctx.fillText("AI 생성", SIZE / 2, 978);
    ctx.textAlign = "left";
  }
}

function drawSlide(
  slide: ExportSlide,
  total: number,
  aiGenerated: boolean,
  tpl: CardTemplate,
  logo?: LoadedLogo,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");

  if (slide.role === "cover") drawCover(ctx, slide, tpl);
  else if (slide.role === "closing") drawClosing(ctx, slide, aiGenerated, tpl);
  else drawContent(ctx, slide, total, tpl);

  if (logo) drawLogo(ctx, logo, slide.role);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob_failed"))), "image/png");
  });
}

/** 미리보기용 — 슬라이드를 data URL 배열로 렌더한다 (화면에 실제 카드 그대로 표시, WYSIWYG). */
export function renderSlidesToDataUrls(
  slides: ExportSlide[],
  aiGenerated: boolean,
  tpl: CardTemplate = DEFAULT_TEMPLATE,
  logo?: LoadedLogo,
): string[] {
  return slides.map((slide) => drawSlide(slide, slides.length, aiGenerated, tpl, logo).toDataURL("image/png"));
}

/** 예약 발행 업로드용 — 다운로드 대신 PNG Blob 배열을 반환한다 */
export async function renderSlidesToBlobs(
  slides: ExportSlide[],
  aiGenerated: boolean,
  tpl: CardTemplate = DEFAULT_TEMPLATE,
  logo?: LoadedLogo,
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const slide of slides) {
    blobs.push(await canvasToBlob(drawSlide(slide, slides.length, aiGenerated, tpl, logo)));
  }
  return blobs;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * 최종 이미지 Blob 배열 — 편집기로 수정한 슬라이드(edits[index]=dataUrl)는 그 이미지를,
 * 아닌 슬라이드는 자동 렌더 결과를 쓴다. (다운로드·예약 발행 공용)
 */
export async function buildFinalBlobs(
  slides: ExportSlide[],
  aiGenerated: boolean,
  edits: Record<number, string>,
  tpl: CardTemplate = DEFAULT_TEMPLATE,
  logo?: LoadedLogo,
): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let i = 0; i < slides.length; i += 1) {
    const edited = edits[i];
    out.push(edited ? await dataUrlToBlob(edited) : await canvasToBlob(drawSlide(slides[i], slides.length, aiGenerated, tpl, logo)));
  }
  return out;
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      // 즉시 revoke하면 일부 브라우저에서 다운로드가 끊긴다 — 지연 해제
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      resolve();
    }, "image/png");
  });
}

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

/** 슬라이드 전체를 PNG 파일로 순차 다운로드. 편집된 슬라이드는 그 이미지를 저장한다. */
export async function exportSlidesAsPng(
  slides: ExportSlide[],
  aiGenerated: boolean,
  edits: Record<number, string> = {},
  tpl: CardTemplate = DEFAULT_TEMPLATE,
  logo?: LoadedLogo,
): Promise<void> {
  for (let i = 0; i < slides.length; i += 1) {
    const name = `finch-cardnews-${String(slides[i].no).padStart(2, "0")}.png`;
    if (edits[i]) {
      downloadUrl(edits[i], name);
    } else {
      await downloadCanvas(drawSlide(slides[i], slides.length, aiGenerated, tpl, logo), name);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
