"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { uploadLinkImage } from "../actions";
import { FinchLoader } from "@/components/ui/finch-loader";

/*
  이미지 입력 — 업로드 또는 주소 붙여넣기.

  둘 다 두는 이유: 업로드가 실사용의 기본이지만, 이미 다른 곳(노션·드롭박스·기존
  사이트)에 올려둔 이미지를 쓰는 경우가 많다. 링크팜은 업로드만 준다.

  업로드는 서버 액션(uploadLinkImage)이 Storage 에 올리고 공개 URL 을 돌려준다 —
  화면은 그 URL 을 값으로 들고 있을 뿐이라, 저장 로직이 블록·프로필에서 동일해진다.

  cropAspect: 표시 틀이 비율 고정인 자리(프로필 정사각, 커버 3:1)용.
  비율이 다른 원본은 예전엔 object-cover 가 **가운데를 임의로** 잘랐다 —
  "정사각형 넣으니 위아래 다 잘린다, 원하는 부분 넣게 해달라"(2026-08-20).
  이제 올리기 전에 보일 부분을 슬라이더로 고르고, 고른 창만 잘라 올린다.
  저장본 자체가 맞는 비율이라 공개 페이지·미리보기 어디서도 다시 잘리지 않는다.
*/

/** 저장본의 최대 긴 변 — 표시 최대폭(PC 캔버스 600px)×레티나 3배보다 넉넉한 상한.
    «고화질을 왜 버리냐»(2026-08-26) 지시로 1600→2000. 이 위는 화질 체감 없이 무게만 는다. */
const CROP_MAX_W = 2000;
/** 조정 화면 비율 선택지 — cropAspect 가 없는 칸에서 사용자가 직접 고른다(2026-08-27 지시) */
const CROP_RATIOS: { label: string; value: number | null }[] = [
  { label: "원본", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:1", value: 3 },
];
/** 전송 안전 상한 — Vercel 요청 본문 4.5MB 하드캡을 base64(+33%) 포함해 넘지 않는 선 */
const WIRE_MAX_BYTES = 3_000_000;

/** 가장자리 «여백 띠» 경계 — 완전 투명 + **균일 단색 테두리**(합성 이미지의 흰 배경 등)를
    프로브(≤512px)로 찾아 원본 좌표로 돌려준다. 단색 판정은 네 모서리 색이 서로 같을 때만
    켠다(실사진의 밝은 하늘 모서리 오탐 방지). 여백이 거의 없으면(양 축 98% 이상 그림) null.
    풀사이즈 ImageData 를 만들지 않는다. 2026-08-27 «여백 없애» 지시 — 지우는 건 렌더가
    아니라 업로드 단계의 일이다. */
function alphaTrimBox(img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const k = Math.min(1, 512 / Math.max(W, H));
  const pw = Math.max(1, Math.round(W * k));
  const ph = Math.max(1, Math.round(H * k));
  const c = document.createElement("canvas");
  c.width = pw;
  c.height = ph;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, pw, ph);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, pw, ph).data;
  } catch {
    return null;
  }
  /* 네 모서리가 같은 불투명 단색이면 그 색도 «여백»으로 본다 — 흰 패딩을 두른 합성 이미지 */
  const px = (x: number, y: number) => {
    const i = (y * pw + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
  };
  const corners = [px(0, 0), px(pw - 1, 0), px(0, ph - 1), px(pw - 1, ph - 1)];
  const TOL = 14;
  const cornersUniform =
    corners.every((c) => c[3] > 247) &&
    corners.every((c) => Math.abs(c[0] - corners[0][0]) <= TOL && Math.abs(c[1] - corners[0][1]) <= TOL && Math.abs(c[2] - corners[0][2]) <= TOL);
  const bg = corners[0];
  const isPad = (x: number, y: number) => {
    const i = (y * pw + x) * 4;
    if (data[i + 3] <= 8) return true;
    if (!cornersUniform) return false;
    return data[i + 3] > 247 && Math.abs(data[i] - bg[0]) <= TOL && Math.abs(data[i + 1] - bg[1]) <= TOL && Math.abs(data[i + 2] - bg[2]) <= TOL;
  };
  let minX = pw;
  let minY = ph;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (!isPad(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; /* 전부 투명 — 손대지 않는다 */
  /* 프로브 → 원본 좌표(경계 1px 여유). 스케일 손실로 그림을 자르느니 여백 1px 를 남긴다 */
  const sx = Math.max(0, Math.floor((minX - 1) / k));
  const sy = Math.max(0, Math.floor((minY - 1) / k));
  const ex = Math.min(W, Math.ceil((maxX + 2) / k));
  const ey = Math.min(H, Math.ceil((maxY + 2) / k));
  const w = ex - sx;
  const h = ey - sy;
  if (w <= 0 || h <= 0 || (w >= W * 0.98 && h >= H * 0.98)) return null;
  return { x: sx, y: sy, w, h };
}

/** data URL 의 실제 바이트 수(base64 → 원본) */
function dataUrlBytes(u: string): number {
  const i = u.indexOf(",");
  return i < 0 ? 0 : Math.floor(((u.length - i - 1) * 3) / 4);
}

/** 캔버스를 가장 작게 인코딩 — WebP 우선(알파 보존+고압축), 미지원 브라우저(사파리 일부)는
    원형식 폴백. 그래도 전송 상한을 넘으면 흰 바탕 JPEG 로 마지막 압축. */
function encodeCanvas(canvas: HTMLCanvasElement, sourceMime: string): string {
  if (sourceMime !== "image/jpeg") {
    const webp = canvas.toDataURL("image/webp", 0.85);
    if (webp.startsWith("data:image/webp") && dataUrlBytes(webp) <= WIRE_MAX_BYTES) return webp;
  }
  const fallback = canvas.toDataURL(sourceMime === "image/png" ? "image/png" : "image/jpeg", 0.85);
  if (dataUrlBytes(fallback) <= WIRE_MAX_BYTES) return fallback;
  /* 마지막 수단 — 알파를 포기하고 흰 바탕 JPEG (여기까지 오는 건 극단적 원본뿐) */
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const fctx = flat.getContext("2d");
  if (!fctx) return fallback;
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(canvas, 0, 0);
  const jpeg = flat.toDataURL("image/jpeg", 0.8);
  if (dataUrlBytes(jpeg) <= WIRE_MAX_BYTES) return jpeg;
  /* 그래도 넘으면 치수를 한 단계 줄여 마지막 한 번 — 상한은 주석이 아니라 코드가 보장한다(쏘넷 점검) */
  const half = document.createElement("canvas");
  half.width = Math.max(1, Math.round(flat.width * 0.7));
  half.height = Math.max(1, Math.round(flat.height * 0.7));
  const hctx = half.getContext("2d");
  if (!hctx) return jpeg;
  hctx.drawImage(flat, 0, 0, half.width, half.height);
  return half.toDataURL("image/jpeg", 0.72);
}

export function ImageField({
  value,
  onChange,
  label,
  hint,
  aspect = "aspect-[16/9]",
  cropAspect,
  maxW,
  round = false,
}: {
  value: string;
  /** dims 는 업로드 경로에서만 온다 — 주소 붙여넣기·지우기는 undefined (부모가 이전 치수를 지운다) */
  onChange: (url: string, dims?: { w: number; h: number }) => void;
  label: string;
  hint?: string;
  /** 미리보기 비율 — 프로필은 정사각, 커버는 3:1 */
  aspect?: string;
  /** 지정하면 비율이 다른 원본에 위치 조정 단계가 끼어든다 (가로/세로, 예: 1, 3) */
  cropAspect?: number;
  /** 미리보기 상한 폭 — 정사각(프로필 사진)은 패널 폭을 그대로 먹으면 600px 짜리 거대한
      네모가 된다(2026-08-24 사장님 지적). 가로로 긴 비율은 기본(칸 폭)이 맞다 */
  maxW?: string;
  /** 원형 미리보기 — 실제로 원으로 보이는 자리(프로필 사진)와 모양을 맞춘다 */
  round?: boolean;
}) {
  /* 세 상태(조정 중·값 있음·빈 칸)가 같은 크기·모양이어야 한 자리처럼 읽힌다.
     기본 상한 200px(2026-08-27 «사진 넣는 칸이 다 너무 크다») — 넓어야 하는 칸만 maxW 로 푼다.
     크롭 조정 중에는 280px: 어디를 남길지 고르는 화면이라 조금 더 크게. */
  const cap = maxW ?? "max-w-[200px]";
  const boxCls = `${cap} ${round ? "rounded-full" : "rounded-card"} ${aspect}`.trim();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 조정 대기 중인 이미지(4000px 캡 축소본) — 원본 그대로면 25MB 를 조정 내내 물고,
      2000px 로 깎으면 크롭 후 해상도가 상한에 못 미친다 */
  const [pending, setPending] = useState<{ dataUrl: string; w: number; h: number } | null>(null);
  /** 조정값(2026-08-27 «영역·크기 직접 설정하게 전부») — 확대 1~3배, 위치 0~100(2축),
      비율(null=원본 비율). cropAspect 가 있는 칸은 그 비율로 고정된다. */
  const [adj, setAdj] = useState<{ zoom: number; x: number; y: number; ratio: number | null }>({ zoom: 1, x: 50, y: 50, ratio: null });
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; x0: number; y0: number; fw: number; fh: number } | null>(null);
  /** 트림 전 원본 — «원본 유지» 버튼이 트림 없이 조정 단계를 다시 연다(쏘넷 점검: 옵트아웃) */
  const origRef = useRef<string | null>(null);
  const [wasTrimmed, setWasTrimmed] = useState(false);
  /* 주소 입력의 로컬 초안 — 부모 value 가 바뀌면(업로드·서버 정규화·지우기) 따라간다 */
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }
  function commit(v: string) {
    const t = v.trim();
    if (t !== value) onChange(t);
  }

  async function upload(dataUrl: string, dims?: { w: number; h: number }) {
    setBusy(true);
    try {
      const res = await uploadLinkImage(dataUrl);
      if (!res.ok || !res.url) setError(res.error ?? "업로드하지 못했어요.");
      else onChange(res.url, dims);
    } catch {
      setError("업로드하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    /* 같은 파일을 다시 고를 수 있게 즉시 비운다 — 안 그러면 onChange 가 안 뜬다 */
    e.target.value = "";
    if (!f) return;
    setError(null);
    /* 읽기 전 조기 차단 — 25MB 를 넘으면 브라우저 메모리부터 위험하다 */
    if (f.size > 25 * 1024 * 1024) {
      setError("이미지가 너무 커요 — 25MB 이하로 올려 주세요.");
      return;
    }
    const fileBytes = f.size;

    const r = new FileReader();
    r.onerror = () => setError("파일을 읽지 못했어요.");
    r.onload = () => {
      const dataUrl = String(r.result);
      /* gif(애니)·svg(벡터)는 크롭·축소가 원본을 망가뜨린다 — 그대로 올리되 전송 상한만 지킨다.
         Vercel 요청 본문 4.5MB 하드캡(base64 +33% 포함)이 진짜 한계다(2026-08-26 실측·조사) */
      if (/^data:image\/gif/.test(dataUrl)) {
        if (fileBytes > WIRE_MAX_BYTES) {
          setError("움직이는 GIF는 3MB 이하만 올릴 수 있어요 — 용량을 줄여 다시 시도해 주세요.");
          return;
        }
        void upload(dataUrl);
        return;
      }
      if (/^data:image\/svg/.test(dataUrl)) {
        if (fileBytes > 1024 * 1024) {
          setError("SVG는 1MB 이하만 올릴 수 있어요.");
          return;
        }
        void upload(dataUrl);
        return;
      }
      origRef.current = dataUrl;
      startAdjust(dataUrl, true);
    };
    r.readAsDataURL(f);
  }

  /** 조정 단계 진입 — (선택적)여백 트림 후 4000px 작업본을 만든다.
      «원본 유지» 버튼이 같은 함수를 트림 없이 다시 태운다(쏘넷 점검: 무통보 트림 옵트아웃). */
  function startAdjust(srcUrl: string, allowTrim: boolean) {
    let dataUrl = srcUrl;
    const img = new Image();
    img.onerror = () => setError("이미지를 읽지 못했어요.");
    /* 투명·단색 여백 자동 트림 — 잘라낸 사본을 같은 img 로 한 번만 다시 로드해 아래를 그대로 태운다 */
    let trimmedOnce = false;
    img.onload = () => {
      if (allowTrim && !trimmedOnce && /^data:image\/(png|webp|jpe?g)/.test(dataUrl)) {
        const box = alphaTrimBox(img);
        if (box) {
          const tc = document.createElement("canvas");
          tc.width = box.w;
          tc.height = box.h;
          const tx = tc.getContext("2d");
          if (tx) {
            tx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
            trimmedOnce = true;
            const mime = /^data:(image\/(?:png|webp|jpeg))/.exec(dataUrl)?.[1] ?? "image/png";
            dataUrl = tc.toDataURL(mime, 0.95);
            img.src = dataUrl;
            return;
          }
        }
      }
      /* 조정 단계 **필수**(2026-08-27 «사진 영역·크기 직접 설정하게 전부») — 어떤 원본이든
         올리기 전에 보일 영역·크기를 직접 정한다. 작업본은 저장 상한(2000px)의 2배로만 줄인다:
         어떤 비율로 잘라도 창이 상한을 채우고, 원본(최대 25MB)을 메모리에 물지 않는다. */
      setAdj({ zoom: 1, x: 50, y: 50, ratio: cropAspect ?? null });
      setWasTrimmed(trimmedOnce);
      const PENDING_MAX = CROP_MAX_W * 2;
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest <= PENDING_MAX) {
        setPending({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
      } else {
        const c = document.createElement("canvas");
        const k = PENDING_MAX / longest;
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const cx = c.getContext("2d");
        if (cx) {
          cx.drawImage(img, 0, 0, c.width, c.height);
          const mime = /^data:(image\/(?:png|webp))/.exec(dataUrl)?.[1] ?? "image/jpeg";
          setPending({ dataUrl: c.toDataURL(mime, 0.92), w: c.width, h: c.height });
        } else {
          setPending({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
        }
      }
    };
    img.src = dataUrl;
  }

  /** 보일 창(원본 좌표) — 미리보기와 applyCrop 이 같은 수식을 쓴다: «보이는 대로 잘린다» */
  function cropWindow(p: { w: number; h: number }, a: { zoom: number; x: number; y: number; ratio: number | null }) {
    const R = a.ratio ?? p.w / p.h;
    const base = Math.min(p.w, p.h * R);
    const winW = base / a.zoom;
    const winH = winW / R;
    return { winW, winH, x: (p.w - winW) * (a.x / 100), y: (p.h - winH) * (a.y / 100), R };
  }

  /** 고른 창만 잘라 저장 — 저장본 = 화면에 보이던 영역 */
  function applyCrop() {
    if (!pending) return;
    const { dataUrl, w, h } = pending;
    const { winW, winH, x, y } = cropWindow(pending, adj);
    /* 창=원본 전체(무변경)이고 원본이 이미 작고 가벼우면 재인코딩 없이 그대로 —
       무손실 PNG·이미 최적화된 JPEG 를 공연히 굽지 않는다(쏘넷 점검: 직행 경로 복원) */
    if (winW >= w - 0.5 && winH >= h - 0.5 && Math.max(w, h) <= CROP_MAX_W && dataUrlBytes(dataUrl) <= 1_500_000) {
      setPending(null);
      void upload(dataUrl, { w, h });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, CROP_MAX_W / Math.max(winW, winH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(winW * scale));
      canvas.height = Math.max(1, Math.round(winH * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("이미지를 처리하지 못했어요.");
        return;
      }
      ctx.drawImage(img, x, y, winW, winH, 0, 0, canvas.width, canvas.height);
      setPending(null);
      /* WebP 우선 — 알파가 살아서 흰 바탕 강제(옛 JPEG 고정)의 투명 손실이 없다 */
      const srcMime = /^data:(image\/(?:png|webp))/.exec(dataUrl)?.[1] ?? "image/jpeg";
      void upload(encodeCanvas(canvas, srcMime), { w: canvas.width, h: canvas.height });
    };
    img.src = dataUrl;
  }

  /* 끌어서 위치 조정 — 화면 이동량을 원본 좌표로 환산해 0~100 위치로 되돌린다 */
  function dragStart(e: React.PointerEvent) {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || !pending) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x0: adj.x, y0: adj.y, fw: r.width, fh: r.height };
  }
  function dragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !pending) return;
    const { winW, winH } = cropWindow(pending, adj);
    const slackX = pending.w - winW;
    const slackY = pending.h - winH;
    const dxSrc = ((e.clientX - d.px) * winW) / d.fw;
    const dySrc = ((e.clientY - d.py) * winH) / d.fh;
    setAdj((a) => ({
      ...a,
      x: slackX > 0.5 ? Math.min(100, Math.max(0, d.x0 - (dxSrc / slackX) * 100)) : a.x,
      y: slackY > 0.5 ? Math.min(100, Math.max(0, d.y0 - (dySrc / slackY) * 100)) : a.y,
    }));
  }
  function dragEnd() {
    dragRef.current = null;
  }
  const win = pending ? cropWindow(pending, adj) : null;

  return (
    <div>
      <p className="text-[12px] font-medium text-fg-sub">{label}</p>

      {pending && win ? (
        <div className="mt-1.5 space-y-2">
          {/* 조정 무대 — 프레임이 곧 저장본이다. 끌어서 위치, 슬라이더로 크기 */}
          <div
            ref={frameRef}
            onPointerDown={dragStart}
            onPointerMove={dragMove}
            onPointerUp={dragEnd}
            onPointerCancel={dragEnd}
            className={`relative w-full max-w-[320px] cursor-move touch-none select-none overflow-hidden border border-line bg-plate ${round ? "rounded-full" : "rounded-card"}`}
            style={{ aspectRatio: String(win.R) }}
            role="application"
            aria-label="사진 위치 조정 — 끌어서 이동"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 전 로컬 data URL */}
            <img
              src={pending.dataUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: `${(pending.w / win.winW) * 100}%`,
                left: `-${(win.x / win.winW) * 100}%`,
                top: `-${(win.y / win.winH) * 100}%`,
              }}
            />
          </div>
          {!cropAspect ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="저장 비율">
              {CROP_RATIOS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={adj.ratio === r.value}
                  onClick={() => setAdj((a) => ({ ...a, ratio: r.value, x: 50, y: 50 }))}
                  className={`trans-state rounded-chip border px-2.5 py-1 text-[12px] font-medium ${
                    adj.ratio === r.value ? "border-fg bg-fg text-body" : "border-line bg-body text-fg-sub hover:bg-tint-hover hover:text-fg"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ) : null}
          {wasTrimmed ? (
            <p className="flex max-w-[320px] items-center justify-between gap-2 text-[12px] text-fg-sub">
              가장자리 여백을 잘라냈어요.
              <button
                type="button"
                onClick={() => {
                  if (origRef.current) startAdjust(origRef.current, false);
                }}
                className="trans-state shrink-0 rounded-chip border border-line px-2 py-0.5 font-medium hover:bg-tint-hover hover:text-fg"
              >
                원본 유지
              </button>
            </p>
          ) : null}
          <label className="block max-w-[320px]">
            <span className="text-[12px] text-fg-sub">크기(확대) — 사진을 끌어 위치를 맞추세요</span>
            <input
              type="range"
              min={100}
              max={300}
              value={Math.round(adj.zoom * 100)}
              onChange={(e) => setAdj((a) => ({ ...a, zoom: Number(e.target.value) / 100 }))}
              aria-label="크기"
              className="mt-1 w-full accent-[var(--color-primary)]"
            />
          </label>
          <div className="flex max-w-[320px] gap-2">
            <button
              type="button"
              onClick={applyCrop}
              disabled={busy}
              className="trans-state flex-1 rounded-card bg-primary px-3 py-2 text-[14px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? "올리는 중…" : "이 영역으로 올리기"}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="trans-state rounded-card border border-line px-3 py-2 text-[14px] font-medium text-fg-sub hover:bg-tint-hover disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      ) : value ? (
        <div className="mt-1.5 space-y-2">
          {/* 제거 버튼은 **클리핑 밖**에 둔다 — 원형 미리보기 안에 넣으면 원 모서리에 잘려
              검은 조각처럼 보인다(2026-08-24). 사각형은 안쪽 여백에 그대로. */}
          <div className={`relative ${cap}`}>
            {/* 값 미리보기는 **원본 비율 그대로**(2026-08-27 «왜 잘라놨냐 — 전체 비율만 축소») —
                발행본(그리드 등)이 원본 비율로 그리므로 편집 칸이 잘라 보여주면 거짓말이 된다.
                원형(프로필)만 실제 화면과 같은 원 크롭을 유지한다. */}
            <div className={`relative overflow-hidden border border-line bg-plate ${round ? boxCls : "rounded-card"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL·외부 URL 혼용 */}
              <img src={value} alt="" className={round ? "size-full object-cover" : "block w-full"} />
            </div>
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label={`${label} 제거`}
              className={`trans-state absolute rounded-full bg-scrim p-1.5 text-on-scrim shadow-pop hover:opacity-80 ${round ? "-right-1.5 -top-1.5" : "right-2 top-2"}`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={`${label} 올리기`}
          /* busy 중엔 로더가 내용이라 흐리게 하지 않는다 */
          /* w-full 은 항상 둔다 — 빼면 button 이 내용 폭(fit-content)으로 쪼그라들어
             사진이 있을 때(152px)와 없을 때 칸 크기가 달라진다. 상한은 max-w 가 잡는다 */
          className={`trans-state mt-1.5 flex w-full items-center justify-center gap-1.5 border border-dashed border-line bg-plate text-fg-sub hover:border-primary hover:text-fg ${boxCls}`}
        >
          {busy ? (
            /* 올리는 동안은 핀치 로더 — "로딩 중이면 로딩 화면" (2026-08-22 지시) */
            <FinchLoader label="올리는 중…" />
          ) : (
            <>
              {/* 한 줄 구성 — 4:1(내 로고)·3:1(배경) 칸은 200px 폭에서 높이가 50~67px 뿐이라
                  세로 쌓기가 비율을 밀어 올렸다(쏘넷 점검). 형식 안내는 각 칸의 hint 가 말한다. */}
              <ImagePlus className="size-5" aria-hidden />
              <span className="text-[14px] font-medium">이미지 올리기</span>
            </>
          )}
        </button>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={pick} />

      {/* 조정 중에는 주소 입력을 접는다 — 붙여넣기가 조용히 값이 되고 «올리기»가 덮어쓴다(쏘넷) */}
      {pending ? null : (
      <>
      {/* 주소 붙여넣기 — 이미 다른 곳에 올려둔 이미지를 쓰는 경우가 많다.
          ⚠️ 키 입력마다 onChange 를 올리지 않는다. 프로필 패널은 이 값이 서버 액션에 직접 묶여
          있어 'h' 한 글자가 저장되고 나머지는 busy 로 삼켜졌다(감사 #7). 붙여넣기는 즉시,
          타이핑은 Enter·포커스 이탈에 확정한다. */}
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if ((e.nativeEvent as InputEvent).inputType === "insertFromPaste") commit(e.target.value);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
        }}
        placeholder="또는 이미지 주소 붙여넣기"
        aria-label={`${label} 주소`}
        className="mt-2 h-9 w-full rounded-card border border-line bg-body px-2.5 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
      />
      </>
      )}

      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-negative-strong">
          {error}
        </p>
      ) : null}
      {hint && !error ? <p className="mt-1 text-[12px] text-fg-sub">{hint}</p> : null}
    </div>
  );
}
