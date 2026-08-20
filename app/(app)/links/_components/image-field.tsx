"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { uploadLinkImage } from "../actions";

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

/** 크롭 결과의 최대 가로 픽셀 — 커버 표시 폭(모바일 프레임)보다 넉넉한 상한 */
const CROP_MAX_W = 1600;

export function ImageField({
  value,
  onChange,
  label,
  hint,
  aspect = "aspect-[16/9]",
  cropAspect,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  /** 미리보기 비율 — 프로필은 정사각, 커버는 3:1 */
  aspect?: string;
  /** 지정하면 비율이 다른 원본에 위치 조정 단계가 끼어든다 (가로/세로, 예: 1, 3) */
  cropAspect?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 위치 조정 대기 중인 원본 — cropAspect 와 비율이 다른 이미지만 여기로 온다 */
  const [pending, setPending] = useState<{ dataUrl: string; w: number; h: number } | null>(null);
  /** 보일 창의 위치 0~100 — 세로로 긴 원본이면 위아래, 가로로 길면 좌우 */
  const [offset, setOffset] = useState(50);

  async function upload(dataUrl: string) {
    setBusy(true);
    try {
      const res = await uploadLinkImage(dataUrl);
      if (!res.ok || !res.url) setError(res.error ?? "업로드하지 못했어요.");
      else onChange(res.url);
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

    const r = new FileReader();
    r.onerror = () => setError("파일을 읽지 못했어요.");
    r.onload = () => {
      const dataUrl = String(r.result);
      /* gif(애니)·svg(벡터)는 크롭이 원본을 망가뜨린다 — 그대로 올린다 */
      if (!cropAspect || /^data:image\/(gif|svg)/.test(dataUrl)) {
        void upload(dataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => setError("이미지를 읽지 못했어요.");
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        /* 이미 맞는 비율(±2%)이면 조정 단계 없이 바로 — 괜히 한 단계 늘리지 않는다 */
        if (Math.abs(ratio - cropAspect) / cropAspect < 0.02) {
          void upload(dataUrl);
          return;
        }
        setOffset(50);
        setPending({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
      };
      img.src = dataUrl;
    };
    r.readAsDataURL(f);
  }

  /** 고른 창만 잘라 JPEG 로 — 저장본 자체가 맞는 비율이 된다 */
  function applyCrop() {
    if (!pending || !cropAspect) return;
    const { dataUrl, w, h } = pending;
    const wide = w / h > cropAspect;
    const cropW = wide ? h * cropAspect : w;
    const cropH = wide ? h : w / cropAspect;
    const x = wide ? ((w - cropW) * offset) / 100 : 0;
    const y = wide ? 0 : ((h - cropH) * offset) / 100;

    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, CROP_MAX_W / cropW);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cropW * scale));
      canvas.height = Math.max(1, Math.round(cropH * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("이미지를 처리하지 못했어요.");
        return;
      }
      /* JPEG 엔 알파가 없다 — PNG 투명 영역이 검게 구워지지 않게 흰 바탕 먼저 */
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, x, y, cropW, cropH, 0, 0, canvas.width, canvas.height);
      setPending(null);
      void upload(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  }

  /* 조정 미리보기 — object-position 의 % 정렬이 applyCrop 의 창 계산과 같은 수식이라
     "보이는 대로 잘린다"가 보장된다 */
  const pendingWide = pending ? pending.w / pending.h > (cropAspect ?? 1) : false;

  return (
    <div>
      <p className="text-[12px] font-medium text-fg-sub">{label}</p>

      {pending ? (
        <div className="mt-1.5 space-y-2">
          <div className={`relative overflow-hidden rounded-card border border-line bg-plate ${aspect}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 전 로컬 data URL */}
            <img
              src={pending.dataUrl}
              alt=""
              className="size-full object-cover"
              style={{ objectPosition: pendingWide ? `${offset}% 50%` : `50% ${offset}%` }}
            />
          </div>
          <label className="block">
            <span className="text-[12px] text-fg-sub">
              보일 부분 — {pendingWide ? "좌우로" : "위아래로"} 움직여 맞추세요
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--color-primary)]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyCrop}
              disabled={busy}
              className="trans-state flex-1 rounded-card bg-primary px-3 py-2 text-[14px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? "올리는 중…" : "이 위치로 올리기"}
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
          <div className={`relative overflow-hidden rounded-card border border-line bg-plate ${aspect}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL·외부 URL 혼용 */}
            <img src={value} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="이미지 제거"
              className="trans-state absolute right-2 top-2 rounded-card bg-scrim p-1.5 text-on-scrim hover:opacity-80"
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
          className={`trans-state mt-1.5 flex w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-plate text-fg-sub hover:border-primary hover:text-fg disabled:opacity-50 ${aspect}`}
        >
          <ImagePlus className="size-5" aria-hidden />
          <span className="text-[14px] font-medium">{busy ? "올리는 중…" : "이미지 올리기"}</span>
          <span className="text-[11px]">PNG·JPG·WEBP · 2MB 이하</span>
        </button>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={pick} />

      {/* 주소 붙여넣기 — 이미 다른 곳에 올려둔 이미지를 쓰는 경우가 많다 */}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="또는 이미지 주소 붙여넣기"
        aria-label={`${label} 주소`}
        className="mt-2 h-9 w-full rounded-card border border-line bg-body px-2.5 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
      />

      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-negative-strong">
          {error}
        </p>
      ) : null}
      {hint && !error ? <p className="mt-1 text-[12px] text-fg-sub">{hint}</p> : null}
    </div>
  );
}
