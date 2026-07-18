"use client";

/**
 * 카드뉴스 PNG 내보내기 — 슬라이드를 1080x1080 캔버스에 그려 파일로 저장한다.
 * 색은 하드코딩하지 않고 런타임 CSS 토큰(--color-primary 등)에서 읽는다 (디자인 규칙).
 * AI 생성 결과에는 하단에 'AI 생성' 표기를 부착한다 (플랫폼 정책 준수 문구와 일치).
 */

export interface ExportSlide {
  no: number;
  head: string;
  sub: string;
}

const SIZE = 1080;
const PAD = 96;

function cssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 한글 포함 텍스트 줄바꿈 — measureText 기준 글자 단위 래핑 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch === " " ? "" : ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawSlide(slide: ExportSlide, total: number, aiGenerated: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");

  const bg = cssToken("--color-primary", "#FF6B4A");
  const fg = cssToken("--color-on-primary", "#1A1A1A");
  const font = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

  // 배경 — 브랜드 코랄 고정 (템플릿 v1)
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = fg;

  // 슬라이드 번호
  ctx.font = `600 34px ${font}`;
  ctx.globalAlpha = 0.65;
  ctx.fillText(`${String(slide.no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, PAD, PAD + 20);
  ctx.globalAlpha = 1;

  // 헤드카피 — 세로 중앙부
  ctx.font = `800 76px ${font}`;
  const headLines = wrapText(ctx, slide.head, SIZE - PAD * 2).slice(0, 4);
  const headLineHeight = 100;
  let y = SIZE * 0.42 - ((headLines.length - 1) * headLineHeight) / 2;
  for (const line of headLines) {
    ctx.fillText(line, PAD, y);
    y += headLineHeight;
  }

  // 서브카피 — 하단부
  ctx.font = `500 40px ${font}`;
  ctx.globalAlpha = 0.85;
  const subLines = wrapText(ctx, slide.sub, SIZE - PAD * 2).slice(0, 4);
  let sy = SIZE - PAD - 40 - (subLines.length - 1) * 58 - (aiGenerated ? 64 : 0);
  for (const line of subLines) {
    ctx.fillText(line, PAD, sy);
    sy += 58;
  }
  ctx.globalAlpha = 1;

  // AI 생성 표기 (정책 준수) + 워터마크
  if (aiGenerated) {
    ctx.font = `600 28px ${font}`;
    ctx.globalAlpha = 0.6;
    ctx.fillText("AI 생성 · finch.ai.kr", PAD, SIZE - PAD + 24);
    ctx.globalAlpha = 1;
  }

  return canvas;
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

/** 슬라이드 전체를 PNG 파일로 순차 다운로드 */
export async function exportSlidesAsPng(slides: ExportSlide[], aiGenerated: boolean): Promise<void> {
  for (const slide of slides) {
    const canvas = drawSlide(slide, slides.length, aiGenerated);
    await downloadCanvas(canvas, `finch-cardnews-${String(slide.no).padStart(2, "0")}.png`);
    // 브라우저 다운로드 스로틀 회피
    await new Promise((r) => setTimeout(r, 250));
  }
}
