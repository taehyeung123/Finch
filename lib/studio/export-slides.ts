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

/**
 * 단어(공백) 경계 우선 줄바꿈 — 글자 단위로 자르면 "이제" 같은 단어가 "이/제"로 끊기는
 * 문제가 있었다. 한 단어가 그 자체로 maxWidth를 넘을 때만 글자 단위로 쪼갠다.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 핀치 심볼 마크(components/logo.tsx FinchMark와 동일 path) — 배경 브랜드 워터마크용.
// 32x32 viewBox 전체가 캔버스 안에 다 들어오게 그려야 부리·꼬리 실루엣이 잘리지 않는다.
const MARK_PATH = new Path2D(
  "M6 18.5c0-5.8 4.7-10.5 10.5-10.5 3.4 0 6.5 1.7 8.4 4.2l4.1-1.2-2.4 4.4c.2.8.4 1.7.4 2.6 0 5.8-4.7 10.5-10.5 10.5-2.3 0-4.5-.8-6.2-2L4 28l2.7-5.2c-.5-1.3-.7-2.8-.7-4.3z",
);

function drawWatermark(ctx: CanvasRenderingContext2D, fg: string) {
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = fg;
  const boxSize = 400;
  const scale = boxSize / 32;
  ctx.translate(SIZE - boxSize - 56, SIZE - boxSize - 150);
  ctx.scale(scale, scale);
  ctx.fill(MARK_PATH);
  ctx.restore();
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

  // 배경 브랜드 워터마크 — 텍스트 사이 빈 공간을 채우는 장식 요소 (헤드/서브 그리기 전에 깔아둔다)
  drawWatermark(ctx, fg);

  ctx.fillStyle = fg;

  // 슬라이드 번호 — 옅은 배경의 pill
  ctx.font = `700 30px ${font}`;
  const noText = `${String(slide.no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const noWidth = ctx.measureText(noText).width;
  const pillPadX = 22;
  const pillH = 56;
  ctx.globalAlpha = 0.14;
  roundRect(ctx, PAD, PAD, noWidth + pillPadX * 2, pillH, pillH / 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.textBaseline = "middle";
  ctx.fillText(noText, PAD + pillPadX, PAD + pillH / 2 + 2);
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;

  // 콘텐츠 블록 — 헤드카피는 항상 같은 기준선(SIZE*0.4)에서 시작한다.
  // 세로 중앙정렬 방식은 카피가 짧을 때(1줄) 위쪽에 큰 여백이 남는 문제가 있어 고정 앵커로 바꿨다.
  const contentMaxWidth = SIZE - PAD * 2;
  ctx.font = `800 74px ${font}`;
  const headLines = wrapText(ctx, slide.head, contentMaxWidth).slice(0, 4);
  const headLH = 92;

  ctx.font = `500 38px ${font}`;
  const subLines = wrapText(ctx, slide.sub, contentMaxWidth).slice(0, 3);
  const subLH = 54;

  const headStartY = SIZE * 0.4;
  ctx.font = `800 74px ${font}`;
  ctx.globalAlpha = 1;
  let y = headStartY;
  for (const line of headLines) {
    ctx.fillText(line, PAD, y);
    y += headLH;
  }
  const lastHeadBaseline = headStartY + (headLines.length - 1) * headLH;
  y = lastHeadBaseline + 62;
  ctx.font = `500 38px ${font}`;
  ctx.globalAlpha = 0.82;
  for (const line of subLines) {
    ctx.fillText(line, PAD, y);
    y += subLH;
  }
  ctx.globalAlpha = 1;

  // 하단 구분선 + AI 생성 표기 (정책 준수)
  if (aiGenerated) {
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, SIZE - PAD - 6);
    ctx.lineTo(SIZE - PAD, SIZE - PAD - 6);
    ctx.stroke();

    ctx.globalAlpha = 0.6;
    ctx.font = `600 26px ${font}`;
    ctx.fillText("AI 생성 · finch.ai.kr", PAD, SIZE - PAD + 30);
    ctx.globalAlpha = 1;
  }

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob_failed"))), "image/png");
  });
}

/** 예약 발행 업로드용 — 다운로드 대신 PNG Blob 배열을 반환한다 */
export async function renderSlidesToBlobs(slides: ExportSlide[], aiGenerated: boolean): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const slide of slides) {
    const canvas = drawSlide(slide, slides.length, aiGenerated);
    blobs.push(await canvasToBlob(canvas));
  }
  return blobs;
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
