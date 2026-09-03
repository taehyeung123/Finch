"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { adsWriteMessage } from "@/lib/ads/campaign-rules";
import {
  AD_IMAGE_MAX_RATIO,
  AD_IMAGE_MIN_RATIO,
  AD_IMAGE_MIN_SHORT_SIDE,
} from "@/lib/ads/image-spec";
import { uploadAdImageAction, type AdImageUploadResult } from "../media-actions";

/*
  광고 이미지 업로더 — 마법사 ②(소재)가 쓴다. 스펙 §4.2 «클라이언트 정규화».
  ① 고르자마자 로컬에서 판정(원본 30MB↑·비율 밖·짧은 변 미달은 **업로드 전에** 안내)
  ② 긴 변 ≤ 1800px 로 줄여 JPEG 0.85(2.5MB 넘으면 0.72) — PNG 투명은 흰 바탕
  ③ 서버 액션 → Meta adimages → {hash,url,width,height}
  같은 파일을 다시 고르면 이전 hash 를 그대로 쓴다(재업로드 금지 — §13-4). 메모는 탭을 닫으면 사라진다.
*/

export interface UploadedAdImage {
  hash: string;
  /** 메타가 준 썸네일(url_128) — 없을 수 있어 로컬 미리보기를 우선 쓴다 */
  url: string | null;
  width: number;
  height: number;
}

const SOURCE_MAX_BYTES = 30 * 1024 * 1024;
const LONG_EDGE_MAX = 1800;
const JPEG_QUALITY = 0.85;
const JPEG_QUALITY_FALLBACK = 0.72;
const TARGET_MAX_BYTES = 2.5 * 1024 * 1024;

/* 같은 파일(이름·크기·수정시각) → 같은 hash. 모듈 스코프 — 세션 메모 */
const uploaded = new Map<string, UploadedAdImage>();
function fileKey(f: File) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

type Phase = { step: "idle" } | { step: "preparing" } | { step: "uploading" } | { step: "error"; message: string };

function localReason(reason: NonNullable<Extract<AdImageUploadResult, { ok: false }>["reason"]>): string {
  switch (reason) {
    case "too_large":
      return "이미지가 너무 커요. 4MB 이하로 줄여 주세요.";
    case "too_small":
      return `짧은 변이 ${AD_IMAGE_MIN_SHORT_SIDE}px 이상인 이미지를 올려 주세요.`;
    case "bad_ratio":
      return "1:1 또는 4:5 이미지가 가장 잘 나와요. 가로세로 비율은 4:5 ~ 1.91:1 사이여야 해요.";
    default:
      return "JPG 또는 PNG 이미지만 올릴 수 있어요.";
  }
}

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
  } finally {
    /* 디코드된 뒤엔 URL 이 필요 없다 — 미리보기는 축소본으로 따로 만든다 */
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** 긴 변 ≤ 1800 JPEG — 원본이 이미 작으면 크기는 그대로, 포맷만 JPEG */
async function normalize(img: HTMLImageElement): Promise<Blob> {
  const scale = Math.min(1, LONG_EDGE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  /* JPEG 엔 알파가 없다 — PNG 투명 영역이 검게 구워지지 않게 흰 바탕을 먼저 깐다(post-composer 관례) */
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let blob = await toBlob(canvas, JPEG_QUALITY);
  if (blob && blob.size > TARGET_MAX_BYTES) blob = await toBlob(canvas, JPEG_QUALITY_FALLBACK);
  if (!blob) throw new Error("encode");
  return blob;
}

export function AdImageUploader({
  value,
  onChange,
  onPreview,
  disabled = false,
}: {
  value: UploadedAdImage | null;
  onChange: (next: UploadedAdImage | null) => void;
  /** 축소본의 로컬 미리보기 URL — 부모(목업)가 같은 그림을 그릴 때. 제거 시 null */
  onPreview?: (url: string | null) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 로컬 미리보기 URL 은 바뀌거나 사라질 때 해제한다 */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const busy = phase.step === "preparing" || phase.step === "uploading";

  async function handleFile(file: File) {
    if (disabled || busy) return;
    if (file.size > SOURCE_MAX_BYTES) {
      setPhase({ step: "error", message: "원본이 30MB 를 넘어요. 더 작은 이미지를 골라 주세요." });
      return;
    }
    setPhase({ step: "preparing" });

    let img: HTMLImageElement;
    try {
      img = await decode(file);
    } catch {
      setPhase({ step: "error", message: localReason("not_image") });
      return;
    }
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const ratio = w / h;
    /* 업로드 전에 안내한다 — 서버도 같은 기준으로 다시 본다(image-spec.ts) */
    if (Math.min(w, h) < AD_IMAGE_MIN_SHORT_SIDE) {
      setPhase({ step: "error", message: localReason("too_small") });
      return;
    }
    if (ratio < AD_IMAGE_MIN_RATIO * 0.99 || ratio > AD_IMAGE_MAX_RATIO * 1.01) {
      setPhase({ step: "error", message: localReason("bad_ratio") });
      return;
    }

    let blob: Blob;
    try {
      blob = await normalize(img);
    } catch {
      setPhase({ step: "error", message: "이미지를 처리하지 못했어요. 다른 이미지를 골라 주세요." });
      return;
    }
    const nextPreview = URL.createObjectURL(blob);
    setPreviewUrl(nextPreview);
    onPreview?.(nextPreview);

    const key = fileKey(file);
    const memo = uploaded.get(key);
    if (memo) {
      /* 같은 파일 재선택 — 다시 올리지 않는다 */
      setPhase({ step: "idle" });
      onChange(memo);
      return;
    }

    setPhase({ step: "uploading" });
    const form = new FormData();
    form.set("file", blob, "ad.jpg");
    let res: AdImageUploadResult;
    try {
      res = await uploadAdImageAction(form);
    } catch {
      res = { ok: false, code: "media_upload_failed" };
    }
    if (!res.ok) {
      setPhase({
        step: "error",
        message: res.code === "media_invalid" && res.reason ? localReason(res.reason) : adsWriteMessage(res.code),
      });
      return;
    }
    const done: UploadedAdImage = { hash: res.hash, url: res.url, width: res.width, height: res.height };
    uploaded.set(key, done);
    setPhase({ step: "idle" });
    onChange(done);
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (file) void handleFile(file);
  }

  const shown = previewUrl ?? value?.url ?? null;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        aria-label="광고 이미지 선택"
        disabled={disabled || busy}
        onChange={pick}
      />

      {value ? (
        <div className="flex flex-wrap items-start gap-4 rounded-card border border-line bg-plate p-3">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-card border border-line bg-body">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element -- 업로드 전후 로컬 미리보기(object URL) 또는 메타 썸네일
              <img src={shown} alt="광고 이미지 미리보기" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-[12px] text-fg-sub">미리보기 없음</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-fg">이미지가 올라갔어요</p>
            <p className="tnum mt-0.5 text-[12px] text-fg-sub">
              {value.width}×{value.height}px · 광고 계정 이미지 라이브러리에 보관돼요
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
                <RefreshCw className="size-3.5" aria-hidden />
                다른 이미지
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || busy}
                onClick={() => {
                  setPreviewUrl(null);
                  onPreview?.(null);
                  setPhase({ step: "idle" });
                  onChange(null);
                }}
              >
                <X className="size-3.5" aria-hidden />
                제거
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center trans-state",
            dragOver ? "border-primary bg-primary-weak" : "border-line bg-plate hover:border-line-strong",
            (disabled || busy) && "cursor-not-allowed opacity-60",
          )}
        >
          <ImagePlus className="size-6 text-fg-faint" aria-hidden />
          <span className="text-[15px] font-semibold text-fg">
            {phase.step === "preparing" ? "이미지를 준비하는 중…" : phase.step === "uploading" ? "광고 계정에 올리는 중…" : "이미지 올리기"}
          </span>
          <span className="text-[12px] text-fg-sub">JPG·PNG · 1:1 또는 4:5 권장 · 짧은 변 {AD_IMAGE_MIN_SHORT_SIDE}px 이상</span>
        </button>
      )}

      {phase.step === "error" ? (
        <p role="alert" className="mt-2 rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}
