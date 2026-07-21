import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * 리포트 PDF 렌더링 — pdf-lib(순수 JS, 서버리스/Vercel 안전, 헤드리스 브라우저 불필요) +
 * Pretendard TTF 임베드(fontkit, subset:true)로 한글을 정상 렌더링한다.
 * StandardFonts(Helvetica 등)는 Latin-1만 지원해 한글이 깨지므로 반드시 커스텀 폰트를 쓴다.
 * 폰트 파일은 assets/fonts/에 두고 process.cwd() 기준 경로로 읽는다 — Next.js 서버리스 파일
 * 트레이싱이 node_modules 깊은 경로보다 프로젝트 내 정적 경로를 안정적으로 포함하기 때문.
 * 색은 CSS 토큰을 못 쓰는 컨텍스트라 브랜드 코랄(app/globals.css --primary)을 직접 명시한다.
 */

const CORAL = rgb(1, 0.42, 0.29); // #FF6B4A
const INK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.88, 0.87, 0.85);

export interface ReportPdfInput {
  title: string;
  period: string;
  generatedAt: string;
  summaryRows: [string, string][];
  dailyRows?: { date: string; reach: number; followerNet: number }[];
  postRows?: { date: string; type: string; caption: string; views: number; likes: number; comments: number }[];
}

function loadFontBytes(filename: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "assets", "fonts", filename));
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(loadFontBytes("Pretendard-Regular.ttf"), { subset: true });
  const bold = await doc.embedFont(loadFontBytes("Pretendard-Bold.ttf"), { subset: true });

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 48;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPageIfNeeded(need: number) {
    if (y - need < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function text(s: string, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; x?: number } = {}) {
    const size = opts.size ?? 10;
    newPageIfNeeded(size + 6);
    page.drawText(s, { x: opts.x ?? MARGIN, y, size, font: opts.f ?? font, color: opts.color ?? INK });
    y -= size + 6;
  }

  function hr() {
    newPageIfNeeded(14);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LINE });
    y -= 14;
  }

  // 헤더 — 브랜드 코랄
  page.drawRectangle({ x: 0, y: PAGE_H - 64, width: PAGE_W, height: 64, color: CORAL });
  page.drawText("핀치", { x: MARGIN, y: PAGE_H - 42, size: 22, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y = PAGE_H - 96;

  text(input.title, { size: 16, f: bold });
  text(`기간 ${input.period}`, { color: GRAY });
  text(`생성 시각 ${input.generatedAt}`, { color: GRAY });
  y -= 6;
  hr();

  text("계정 요약", { size: 13, f: bold });
  y -= 2;
  for (const [label, value] of input.summaryRows) {
    newPageIfNeeded(16);
    page.drawText(label, { x: MARGIN, y, size: 10, font, color: GRAY });
    page.drawText(value, { x: MARGIN + 220, y, size: 10, font: bold, color: INK });
    y -= 16;
  }
  y -= 8;

  if (input.dailyRows && input.dailyRows.length > 0) {
    hr();
    text("일별 지표 (최근 14일)", { size: 13, f: bold });
    y -= 2;
    text("날짜            도달        팔로워 순증감", { size: 9, f: bold, color: GRAY });
    for (const d of input.dailyRows) {
      newPageIfNeeded(14);
      const line = `${d.date}   ${String(d.reach).padStart(8, " ")}   ${d.followerNet >= 0 ? "+" : ""}${d.followerNet}`;
      page.drawText(line, { x: MARGIN, y, size: 9, font });
      y -= 14;
    }
    y -= 8;
  }

  if (input.postRows && input.postRows.length > 0) {
    hr();
    text("최근 게시물", { size: 13, f: bold });
    y -= 2;
    for (const p of input.postRows) {
      newPageIfNeeded(28);
      page.drawText(`${p.date}  ·  ${p.type}`, { x: MARGIN, y, size: 9, font, color: GRAY });
      y -= 12;
      page.drawText(p.caption.slice(0, 60), { x: MARGIN, y, size: 9, font });
      y -= 12;
      page.drawText(`조회 ${p.views}  ·  좋아요 ${p.likes}  ·  댓글 ${p.comments}`, {
        x: MARGIN,
        y,
        size: 8,
        font,
        color: GRAY,
      });
      y -= 16;
    }
  }

  return doc.save();
}
