"use client";

/**
 * 카드뉴스 PNG 렌더링 — 슬라이드를 1080x1080 캔버스에 그린다.
 *
 * 역할(role)별로 레이아웃이 다르다 (표지/본문/마무리). 인스타 정보성 카드뉴스 패턴을 따른다:
 *   - cover   : 잉크 전면 배경 + 키커 + 큰 헤드라인 + 부연 + 하단 브랜드/스와이프 힌트
 *   - content : 페이퍼 전면 배경 + 번호배지 + 키커 + 헤드라인 + 번호 포인트 리스트 + 구분선/페이지
 *   - closing : 잉크 전면 배경(표지와 수미상관) + 요약 + 코랄 CTA 버튼 + 브랜드
 * 카드를 넘길 때 잉크면↔페이퍼면 명암이 교대되며 리듬이 생긴다.
 *
 * 색은 3종(잉크/페이퍼/코랄) 고정값이다. 앱 UI가 아니라 "생성되는 이미지 자산"이라
 * 라이트/다크 테마와 무관하게 항상 같은 브랜드 색으로 나와야 하므로 CSS 토큰 대신 상수를 쓴다
 * (PDF·이메일 템플릿과 동일한 예외 — DESIGN.md 하드코딩 금지 규칙의 대상이 아님).
 */

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

const INK = "#0C0C11";
const PAPER = "#FAF8F4";
const CORAL = "#FF6B4A";
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const inkA = (a: number) => `rgba(12,12,17,${a})`;
const paperA = (a: number) => `rgba(250,248,244,${a})`;

// 핀치 심볼 마크 (components/logo.tsx FinchMark와 동일 path) — 하단 브랜드 로고용
const MARK_PATH = new Path2D(
  "M6 18.5c0-5.8 4.7-10.5 10.5-10.5 3.4 0 6.5 1.7 8.4 4.2l4.1-1.2-2.4 4.4c.2.8.4 1.7.4 2.6 0 5.8-4.7 10.5-10.5 10.5-2.3 0-4.5-.8-6.2-2L4 28l2.7-5.2c-.5-1.3-.7-2.8-.7-4.3z",
);

/**
 * 단어(공백) 경계 우선 줄바꿈. 한 단어가 그 자체로 maxWidth를 넘을 때만 글자 단위로 쪼갠다
 * (글자 단위로 자르면 "이제"가 "이/제"로 끊기던 문제 방지).
 */
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

function markLogo(ctx: CanvasRenderingContext2D, x: number, yTop: number, size: number, color: string) {
  ctx.save();
  const s = size / 32;
  ctx.translate(x, yTop);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.fill(MARK_PATH);
  ctx.restore();
}

/** 좌하단 브랜드 (마크 + "핀치") */
function brandLeft(ctx: CanvasRenderingContext2D, baselineY: number, textColor: string, size: number) {
  markLogo(ctx, PAD, baselineY - size * 0.82, size, CORAL);
  ctx.fillStyle = textColor;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("핀치", PAD + size * 1.18, baselineY);
}

function drawCover(ctx: CanvasRenderingContext2D, s: ExportSlide) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // 키커 — 코랄 세로바 + 라벨
  if (s.kicker) {
    ctx.fillStyle = CORAL;
    ctx.fillRect(PAD, 150, 7, 34);
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(s.kicker, PAD + 24, 178);
  }

  // 코랄 액센트 바
  ctx.fillStyle = CORAL;
  ctx.fillRect(PAD, 452, 96, 9);

  // 헤드라인
  ctx.font = `800 98px ${FONT}`;
  const lines = wrapText(ctx, s.headline, CW).slice(0, 4);
  const lh = 116;
  let y = 560;
  ctx.fillStyle = PAPER;
  for (const l of lines) {
    ctx.fillText(l, PAD, y);
    y += lh;
  }

  // 부연
  if (s.footnote) {
    ctx.font = `500 38px ${FONT}`;
    ctx.fillStyle = paperA(0.72);
    const fl = wrapText(ctx, s.footnote, CW).slice(0, 2);
    let fy = y + 26;
    for (const l of fl) {
      ctx.fillText(l, PAD, fy);
      fy += 52;
    }
  }

  // 하단 브랜드 + 스와이프 힌트
  brandLeft(ctx, 980, PAPER, 34);
  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = paperA(0.6);
  ctx.textAlign = "right";
  ctx.fillText("밀어서 보기 →", SIZE - PAD, 980);
  ctx.textAlign = "left";
}

function drawContent(ctx: CanvasRenderingContext2D, s: ExportSlide, total: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 번호 배지
  const bx = PAD + 34;
  const by = 150;
  const br = 38;
  ctx.fillStyle = CORAL;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(s.no).padStart(2, "0"), bx, by + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // 키커
  if (s.kicker) {
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = CORAL;
    ctx.fillText(s.kicker, bx + br + 26, by + 10);
  }

  // 헤드라인
  ctx.font = `800 62px ${FONT}`;
  ctx.fillStyle = INK;
  const hl = wrapText(ctx, s.headline, CW).slice(0, 3);
  let y = 300;
  const hlh = 78;
  for (const l of hl) {
    ctx.fillText(l, PAD, y);
    y += hlh;
  }

  // 포인트 리스트 — 코랄 번호 배지 + 잉크 명사구
  const points = (s.points ?? []).slice(0, 4);
  let py = y + 46;
  const pr = 26;
  const ptx = PAD + pr * 2 + 22;
  points.forEach((p, i) => {
    ctx.font = `700 38px ${FONT}`;
    const plines = wrapText(ctx, p, SIZE - ptx - PAD);
    const rowH = Math.max(pr * 2, plines.length * 50);
    ctx.fillStyle = CORAL;
    ctx.beginPath();
    ctx.arc(PAD + pr, py + 22, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), PAD + pr, py + 24);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 38px ${FONT}`;
    ctx.fillStyle = INK;
    let ty = py + 34;
    for (const l of plines) {
      ctx.fillText(l, ptx, ty);
      ty += 50;
    }
    py += rowH + 34;
  });

  // 부연
  if (s.footnote) {
    ctx.font = `500 32px ${FONT}`;
    ctx.fillStyle = inkA(0.6);
    const fl = wrapText(ctx, `— ${s.footnote}`, CW).slice(0, 2);
    let fy = py + 24;
    for (const l of fl) {
      ctx.fillText(l, PAD, fy);
      fy += 44;
    }
  }

  // 구분선 + 페이지 인디케이터 + 브랜드
  ctx.fillStyle = CORAL;
  ctx.fillRect(PAD, 908, 72, 6);
  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = inkA(0.5);
  ctx.textAlign = "right";
  ctx.fillText(`${String(s.no).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, SIZE - PAD, 984);
  ctx.textAlign = "left";
  brandLeft(ctx, 984, inkA(0.72), 30);
}

function drawClosing(ctx: CanvasRenderingContext2D, s: ExportSlide, aiGenerated: boolean) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = CORAL;
  ctx.fillRect(PAD, 300, 96, 9);

  ctx.font = `800 76px ${FONT}`;
  ctx.fillStyle = PAPER;
  const hl = wrapText(ctx, s.headline, CW).slice(0, 3);
  let y = 410;
  const lh = 92;
  for (const l of hl) {
    ctx.fillText(l, PAD, y);
    y += lh;
  }

  if (s.body) {
    ctx.font = `500 38px ${FONT}`;
    ctx.fillStyle = paperA(0.72);
    const bl = wrapText(ctx, s.body, CW).slice(0, 2);
    let by = y + 20;
    for (const l of bl) {
      ctx.fillText(l, PAD, by);
      by += 52;
    }
    y = by;
  }

  // CTA 버튼 블록
  const ctaText = s.cta?.text ?? "저장하기";
  const btnY = Math.max(y + 40, 680);
  const btnH = 104;
  const r = btnH / 2;
  ctx.fillStyle = CORAL;
  ctx.beginPath();
  ctx.moveTo(PAD + r, btnY);
  ctx.arcTo(SIZE - PAD, btnY, SIZE - PAD, btnY + btnH, r);
  ctx.arcTo(SIZE - PAD, btnY + btnH, PAD, btnY + btnH, r);
  ctx.arcTo(PAD, btnY + btnH, PAD, btnY, r);
  ctx.arcTo(PAD, btnY, SIZE - PAD, btnY, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = `800 40px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ctaText, SIZE / 2, btnY + btnH / 2 + 2);

  // 브랜드 중앙 하단 (마크 + 텍스트를 그룹으로 중앙 정렬)
  const brandText = aiGenerated ? "AI 생성 · finch.ai.kr" : "finch.ai.kr";
  ctx.font = `700 30px ${FONT}`;
  const tw = ctx.measureText(brandText).width;
  const markSize = 32;
  const groupW = markSize + 12 + tw;
  const startX = SIZE / 2 - groupW / 2;
  markLogo(ctx, startX, 952, markSize, CORAL);
  ctx.fillStyle = PAPER;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(brandText, startX + markSize + 12, 978);
  ctx.textAlign = "left";
}

function drawSlide(slide: ExportSlide, total: number, aiGenerated: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");

  if (slide.role === "cover") drawCover(ctx, slide);
  else if (slide.role === "closing") drawClosing(ctx, slide, aiGenerated);
  else drawContent(ctx, slide, total);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob_failed"))), "image/png");
  });
}

/** 미리보기용 — 슬라이드를 data URL 배열로 렌더한다 (화면에 실제 카드 그대로 표시, WYSIWYG). */
export function renderSlidesToDataUrls(slides: ExportSlide[], aiGenerated: boolean): string[] {
  return slides.map((slide) => drawSlide(slide, slides.length, aiGenerated).toDataURL("image/png"));
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
