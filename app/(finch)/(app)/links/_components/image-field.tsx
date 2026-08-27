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
/** 이 바이트를 넘으면 치수가 작아도 다시 인코딩한다(무거운 PNG 스크린샷 등) */
const REENCODE_BYTES = 1_500_000;
/** 전송 안전 상한 — Vercel 요청 본문 4.5MB 하드캡을 base64(+33%) 포함해 넘지 않는 선 */
const WIRE_MAX_BYTES = 3_000_000;

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
  const cropBoxCls = `${maxW ?? "max-w-[280px]"} ${round ? "rounded-full" : "rounded-card"} ${aspect}`.trim();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 위치 조정 대기 중인 이미지(4000px 캡 축소본) — cropAspect 와 비율이 다른 이미지만 여기로 온다.
      원본 그대로면 25MB 를 크롭 내내 물고, 2000px 로 깎으면 크롭 후 해상도가 상한에 못 미친다 */
  const [pending, setPending] = useState<{ dataUrl: string; w: number; h: number } | null>(null);
  /** 보일 창의 위치 0~100 — 세로로 긴 원본이면 위아래, 가로로 길면 좌우 */
  const [offset, setOffset] = useState(50);
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
      const img = new Image();
      img.onerror = () => setError("이미지를 읽지 못했어요.");
      img.onload = () => {
        /* 자동 최적화(2026-08-26 지시 «고화질 수용 + 리스크 없이») — 긴 변 2000px 로 줄이고
           WebP(알파 보존) 우선으로 다시 인코딩한다. 치수가 작아도 무거우면(스크린샷 PNG 등)
           재인코딩 — 원본이 이미 작고 가벼울 때만 그대로 보낸다. */
        const shrink = (): { url: string; w: number; h: number } => {
          const longest = Math.max(img.naturalWidth, img.naturalHeight);
          if (longest <= CROP_MAX_W && fileBytes <= REENCODE_BYTES) {
            return { url: dataUrl, w: img.naturalWidth, h: img.naturalHeight };
          }
          const k = Math.min(1, CROP_MAX_W / longest);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
          const ctx = canvas.getContext("2d");
          if (!ctx) return { url: dataUrl, w: img.naturalWidth, h: img.naturalHeight };
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const mime = /^data:(image\/(?:png|webp))/.exec(dataUrl)?.[1] ?? "image/jpeg";
          return { url: encodeCanvas(canvas, mime), w: canvas.width, h: canvas.height };
        };
        if (!cropAspect) {
          const sh = shrink();
          void upload(sh.url, { w: sh.w, h: sh.h });
          return;
        }
        const ratio = img.naturalWidth / img.naturalHeight;
        /* 이미 맞는 비율(±2%)이면 조정 단계 없이 바로 — 괜히 한 단계 늘리지 않는다 */
        if (Math.abs(ratio - cropAspect) / cropAspect < 0.02) {
          const sh = shrink();
          void upload(sh.url, { w: sh.w, h: sh.h });
          return;
        }
        setOffset(50);
        /* 크롭 대기용 축소본은 저장 상한(2000px)의 2배로만 줄인다 — shrink() 를 그대로 쓰면
           창을 «자르기 전에» 2000px 로 깎여 세로 원본→4:3 커버가 1500px 로 떨어진다(쏘넷 점검).
           4000px 이면 어떤 비율로 잘라도 창이 상한을 채우고, 중간 인코딩은 0.92 로 세대 손실을 줄인다. */
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
      ctx.drawImage(img, x, y, cropW, cropH, 0, 0, canvas.width, canvas.height);
      setPending(null);
      /* WebP 우선 — 알파가 살아서 흰 바탕 강제(옛 JPEG 고정)의 투명 손실이 없다.
         WebP 미지원 폴백은 encodeCanvas 가 흰 바탕 JPEG 로 처리한다 */
      const srcMime = /^data:(image\/(?:png|webp))/.exec(dataUrl)?.[1] ?? "image/jpeg";
      void upload(encodeCanvas(canvas, srcMime), { w: canvas.width, h: canvas.height });
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
          <div className={`relative overflow-hidden border border-line bg-plate ${cropBoxCls}`}>
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
          {/* 제거 버튼은 **클리핑 밖**에 둔다 — 원형 미리보기 안에 넣으면 원 모서리에 잘려
              검은 조각처럼 보인다(2026-08-24). 사각형은 안쪽 여백에 그대로. */}
          <div className={`relative ${cap}`}>
            <div className={`relative overflow-hidden border border-line bg-plate ${boxCls}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL·외부 URL 혼용 */}
              <img src={value} alt="" className="size-full object-cover" />
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

      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-negative-strong">
          {error}
        </p>
      ) : null}
      {hint && !error ? <p className="mt-1 text-[12px] text-fg-sub">{hint}</p> : null}
    </div>
  );
}
