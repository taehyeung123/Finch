"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Sparkles, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { FinchLoader } from "@/components/ui/finch-loader";
import { PickChips } from "./option-picker";
import { PhonePreview } from "./phone-preview";
import type { LinkBlock } from "@/lib/links/blocks";
import type { LinkPageView } from "@/lib/links/types";
import { sanitizeThemeCustom } from "@/lib/links/themes";
import {
  AI_FIELDS,
  AI_GOALS,
  AI_MOODS,
  buildDesigns,
  fallbackCopy,
  type AiBrief,
  type AiCopy,
  type AiDesign,
  type AiField,
  type AiGoal,
  type AiMood,
  type AiPalette,
} from "@/lib/links/ai-design";
import { applyAiDesign, generateAiLinkCopy } from "../actions";

/*
  AI 디자인 위저드(2026-08-28 사장님 지시) — «디자인 하나도 못 하는 사람»이 대상이다.

  ① 사진: 프로필 사진을 올리면(또는 지금 사진 그대로) 캔버스로 팔레트를 뽑는다 —
     주조색·생생한 색·명도. 이 값이 시안의 지면·그라데이션·강조색이 된다
     («사진 인식해서 배경이랑 맞추고»의 실체).
  ② 인터뷰: 분야·목적·무드 칩 + 한 줄 소개(본인의 말 — 카피에 그대로 스며든다).
  ③ 시안 3종: 서버(Claude)가 카피를 쓰고(키 없으면 엔진 폴백) 엔진이 우리 디자인
     스키마 안에서 조립 → 미리보기(적용 결과와 같은 렌더러) → 적용.

  적용은 서버가 전 관문(sanitizeBlockData·sanitizeThemeCustom)을 다시 태운다 —
  이 화면은 그리기만 하고, 믿는 것은 서버다.
*/

/* ── 사진 → 팔레트 (클라이언트, 결정적·무비용) ── */
function extractPalette(src: string): Promise<AiPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const N = 40;
        const c = document.createElement("canvas");
        c.width = N;
        c.height = N;
        const x = c.getContext("2d");
        if (!x) return resolve(null);
        x.drawImage(img, 0, 0, N, N);
        const px = x.getImageData(0, 0, N, N).data;
        let rSum = 0,
          gSum = 0,
          bSum = 0,
          lSum = 0,
          n = 0;
        /* 색상환 12칸 — «생생한» 픽셀(채도 높고 너무 밝지도 어둡지도 않은)의 가중 평균 */
        const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i],
            g = px[i + 1],
            b = px[i + 2];
          const max = Math.max(r, g, b),
            min = Math.min(r, g, b);
          const l = (max + min) / 510;
          const s = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
          rSum += r;
          gSum += g;
          bSum += b;
          lSum += l;
          n++;
          const w = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.6);
          if (w > 0.02) {
            let h = 0;
            const d = max - min;
            if (d > 0) {
              if (max === r) h = ((g - b) / d + 6) % 6;
              else if (max === g) h = (b - r) / d + 2;
              else h = (r - g) / d + 4;
            }
            const bin = bins[Math.min(11, Math.floor(h * 2))];
            bin.w += w;
            bin.r += r * w;
            bin.g += g * w;
            bin.b += b * w;
          }
        }
        if (!n) return resolve(null);
        const hex = (r: number, g: number, b: number) =>
          `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
        const main = hex(rSum / n, gSum / n, bSum / n);
        const top = bins.reduce((a, b) => (b.w > a.w ? b : a), bins[0]);
        const vivid = top.w > 0.5 ? hex(top.r / top.w, top.g / top.w, top.b / top.w) : main;
        resolve({ main, vivid, dark: lSum / n < 0.42 });
      } catch {
        /* 크로스오리진 캔버스 오염 등 — 팔레트 없이도 시안은 나온다 */
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 업로드 파일 → 정사각 축소 dataURL(≤800px) — 아바타 업로드 관문과 팔레트 공용 */
function fileToSquareDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const out = Math.min(800, side);
        const c = document.createElement("canvas");
        c.width = out;
        c.height = out;
        const x = c.getContext("2d");
        if (!x) return resolve(null);
        x.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function AiDesignModal({
  page,
  isDemo,
  onClose,
  onApplied,
}: {
  page: LinkPageView;
  isDemo: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [step, setStep] = useState<"photo" | "brief" | "pick">("photo");
  /* 새로 올린 사진(dataURL) — 없으면 «지금 사진 그대로»(page.avatarPath) */
  const [photo, setPhoto] = useState<string | null>(null);
  const [palette, setPalette] = useState<AiPalette | null>(null);
  const [field, setField] = useState<AiField>("creator");
  const [goal, setGoal] = useState<AiGoal>("follow");
  const [mood, setMood] = useState<AiMood>("calm");
  const [intro, setIntro] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copy, setCopy] = useState<AiCopy | null>(null);
  const [designs, setDesigns] = useState<AiDesign[] | null>(null);
  const [picked, setPicked] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shownPhoto = photo ?? page.avatarPath ?? null;

  async function onPickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    const dataUrl = await fileToSquareDataUrl(f);
    if (!dataUrl) {
      setError("사진을 읽지 못했어요. 다른 파일로 시도해 주세요.");
      return;
    }
    setPhoto(dataUrl);
    setPalette(await extractPalette(dataUrl));
  }

  async function onGenerate() {
    setGenerating(true);
    setError(null);
    /* 현재 아바타를 쓰는 경우 팔레트가 아직 없으면 지금 뽑는다(원격 URL — 오염되면 null) */
    let pal = palette;
    if (!pal && shownPhoto) pal = await extractPalette(shownPhoto);
    const brief: AiBrief = { field, goal, mood, intro: intro.trim(), palette: pal, hasPhoto: !!shownPhoto };
    /* 서버가 reject 로 끝나도(네트워크·배포 교체) 로더에 갇히지 않는다 — 엔진 카피로 이어간다 */
    let res: Awaited<ReturnType<typeof generateAiLinkCopy>>;
    try {
      [res] = await Promise.all([
        generateAiLinkCopy(brief),
        new Promise((r) => setTimeout(r, 1100)) /* 로더가 깜빡하고 끝나면 오히려 불안하다 */,
      ]);
    } catch {
      res = { ok: false, fallback: true };
    }
    const nextCopy = res.ok ? res.copy : fallbackCopy(brief);
    /* 한도 소진 등 — 시안은 엔진 카피로 계속 나가되, 무엇으로 만들었는지 분명히 말한다(쏘넷 점검) */
    if (!res.ok && !res.fallback) setError(`${res.error} 이번 시안은 기본 카피로 만들었어요.`);
    setPalette(pal);
    setCopy(nextCopy);
    setDesigns(buildDesigns(brief, nextCopy));
    setPicked(0);
    setGenerating(false);
    setStep("pick");
  }

  async function onApply() {
    const d = designs?.[picked];
    if (!d || applying) return;
    setApplying(true);
    setError(null);
    /* reject 되면 applying 이 true 로 박제 → ModalShell busy 가 모든 닫기 경로를 막는다(쏘넷 점검) */
    try {
      const res = await applyAiDesign(
        { theme: d.theme, custom: d.custom, blocks: d.blocks, avatarDataUrl: photo ?? undefined, bio: copy?.intro },
        page.id,
      );
      if (res.ok) onApplied();
      else setError(res.error ?? "적용하지 못했어요.");
    } catch {
      setError("연결이 잠시 끊겼어요. 다시 시도해 주세요.");
    } finally {
      setApplying(false);
    }
  }

  const previewDesign = designs?.[picked] ?? null;
  const previewBlocks: LinkBlock[] = previewDesign
    ? previewDesign.blocks.map((b, i) => ({ id: `ai-${i}`, type: b.type, data: b.data, sortOrder: i, active: true }))
    : [];

  return (
    <ModalShell
      label="AI 디자인"
      title={
        <span className="flex items-center gap-2">
          <WandSparkles className="size-4 text-primary" aria-hidden />
          AI 디자인
        </span>
      }
      description={
        step === "photo"
          ? "사진 한 장이면 페이지 전체 색을 사진에 맞춰드려요."
          : step === "brief"
            ? "몇 가지만 답해 주세요 — 답이 곧 카피가 됩니다."
            : "시안을 고르면 적용 전 모습 그대로 미리 보여드려요."
      }
      onClose={onClose}
      busy={applying}
      size={step === "pick" ? "xl" : "md"}
    >
      {generating ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <FinchLoader label="사진과 답을 읽고 시안을 만드는 중…" />
        </div>
      ) : step === "photo" ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-2">
            <span className="flex size-28 items-center justify-center overflow-hidden rounded-full border border-line bg-plate">
              {shownPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element -- 로컬 dataURL·Storage URL
                <img src={shownPhoto} alt="프로필 사진 미리보기" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-8 text-fg-faint" aria-hidden />
              )}
            </span>
            {palette ? (
              <span className="flex items-center gap-1.5" aria-hidden>
                {[palette.main, palette.vivid].map((c, i) => (
                  <span key={i} className="size-4 rounded-full border border-line" style={{ backgroundColor: c }} />
                ))}
                <span className="text-[11px] text-fg-sub">사진에서 뽑은 색</span>
              </span>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" aria-hidden />
              {shownPhoto ? "다른 사진 올리기" : "프로필 사진 올리기"}
            </Button>
            <p className="text-center text-[12px] text-fg-sub">
              {page.avatarPath && !photo
                ? "지금 프로필 사진을 그대로 써도 돼요 — 바로 다음으로 넘어가세요."
                : "사진의 색을 읽어 배경·버튼 색을 맞춰드려요. 없이도 진행할 수 있어요."}
            </p>
          </div>
          {error ? <p role="alert" className="text-[12px] text-negative-strong">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
            <Button onClick={() => setStep("brief")}>다음</Button>
          </div>
        </div>
      ) : step === "brief" ? (
        <div className="space-y-4">
          <div>
            <p className="text-[12px] font-semibold text-fg-sub">어떤 페이지인가요?</p>
            <PickChips value={field} onChange={(v) => setField(v as AiField)} options={[...AI_FIELDS]} ariaLabel="분야" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-fg-sub">방문자가 무엇을 하면 성공인가요?</p>
            <PickChips value={goal} onChange={(v) => setGoal(v as AiGoal)} options={[...AI_GOALS]} ariaLabel="목적" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-fg-sub">어떤 분위기가 좋으세요?</p>
            <PickChips value={mood} onChange={(v) => setMood(v as AiMood)} options={[...AI_MOODS]} ariaLabel="무드" />
          </div>
          <label className="block text-[12px] font-semibold text-fg-sub">
            나를 한 줄로 소개한다면? <span className="font-normal text-fg-faint">(선택 — 이 말투가 카피에 스며들어요)</span>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="예: 매주 금요일, 카메라 하나로 떠나는 브이로그를 올립니다"
              className="trans-state mt-1.5 w-full rounded-card border border-line bg-body px-3 py-2 text-[14px] font-normal text-fg outline-none placeholder:text-fg-faint focus:border-primary"
            />
          </label>
          {error ? <p role="alert" className="text-[12px] text-negative-strong">{error}</p> : null}
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <Button variant="ghost" onClick={() => setStep("photo")}>
              <ArrowLeft className="size-4" aria-hidden />
              사진
            </Button>
            {/* 데모도 생성·미리보기는 된다(엔진 폴백 — 서버 호출 없음). 잠그는 건 적용뿐 */}
            <div className="flex flex-col items-end gap-1">
              <Button onClick={() => void onGenerate()}>
                <Sparkles className="size-4" aria-hidden />
                시안 만들기
              </Button>
              {!isDemo ? <p className="text-[11px] text-fg-faint">매달 3번은 무료, 그 뒤엔 크레딧을 써요</p> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            {(designs ?? []).map((d, i) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setPicked(i)}
                aria-pressed={picked === i}
                className={cn(
                  "trans-state w-full rounded-card border border-line bg-body px-3 py-2.5 text-left hover:border-primary",
                  picked === i && "border-primary ring-2 ring-primary/40",
                )}
              >
                <span className="flex items-center gap-1.5" aria-hidden>
                  {d.swatch.map((c, j) => (
                    <span key={j} className="size-3.5 rounded-full border border-line" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="mt-1.5 block text-[14px] font-semibold">{d.name}</span>
                <span className="mt-0.5 block text-[12px] leading-[1.5] text-fg-sub">{d.note}</span>
              </button>
            ))}
            {/* 답을 바꾸는 경로는 아래 «질문 바꾸기» — 이 버튼은 같은 답 재생성이고 생성 1회로 계산된다 */}
            <button
              type="button"
              onClick={() => void onGenerate()}
              className="trans-state w-full rounded-card border border-dashed border-line px-3 py-2 text-[12px] text-fg-sub hover:border-primary hover:text-fg"
            >
              같은 답으로 다시 뽑기
              <span className="mt-0.5 block text-[11px] text-fg-faint">다시 뽑기도 생성 1회로 계산돼요</span>
            </button>
            {error ? <p role="alert" className="text-[12px] text-negative-strong">{error}</p> : null}
          </div>
          <div className="min-h-0 rounded-card bg-plate p-4 md:max-h-[62dvh] md:overflow-y-auto">
            {previewDesign ? (
              <PhonePreview
                page={{
                  ...page,
                  avatarPath: shownPhoto ?? page.avatarPath,
                  /* AI 소개는 bio 로 들어간다 — 적용 결과와 같은 자리에서 미리 보여준다 */
                  bio: copy?.intro ?? page.bio,
                  theme: previewDesign.theme,
                  themeCustom: sanitizeThemeCustom(previewDesign.custom),
                }}
                blocks={previewBlocks}
                selectedId={null}
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3 md:col-span-2">
            <Button variant="ghost" onClick={() => setStep("brief")}>
              <ArrowLeft className="size-4" aria-hidden />
              질문 바꾸기
            </Button>
            <div className="flex items-center gap-3">
              <p className="text-[12px] text-fg-sub">
                {isDemo ? "예시 페이지라 적용은 안 돼요 — 로그인하면 내 페이지에 적용됩니다." : "적용하면 지금 블록이 이 구성으로 바뀌어요."}
              </p>
              <Button onClick={() => void onApply()} disabled={applying || isDemo} title={isDemo ? "예시 페이지에서는 적용할 수 없어요" : undefined}>
                {applying ? "적용 중…" : "이 디자인 적용"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
