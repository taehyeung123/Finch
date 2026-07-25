"use client";

import { useState } from "react";
import { Palette, ImagePlus, Trash2, Check, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveBrandKit, deleteBrandKit, type BrandKit, type LogoPlacement } from "../brand-kit-actions";

/**
 * 나만의 디자인(브랜드 킷) 패널 — 커스텀 색 4종 + 로고 업로드/위치.
 * 저장하면 부모(page.tsx)의 brandKit 상태를 갱신하고, 템플릿 갤러리에 '내 브랜드'로 노출된다.
 */
const COLOR_FIELDS = [
  { key: "accent", label: "강조색" },
  { key: "ink", label: "어두운 배경" },
  { key: "paper", label: "밝은 배경" },
  { key: "onAccent", label: "강조 위 글자" },
] as const;

const PLACEMENTS: { value: LogoPlacement; label: string }[] = [
  { value: "closing", label: "마무리 장" },
  { value: "cover", label: "표지" },
  { value: "all", label: "모든 장" },
  { value: "none", label: "안 넣음" },
];

export function BrandKitPanel({ kit, onChange }: { kit: BrandKit | null; onChange: (k: BrandKit | null) => void }) {
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState({
    accent: kit?.accent ?? "#FF6B4A",
    ink: kit?.ink ?? "#0C0C11",
    paper: kit?.paper ?? "#FAF8F4",
    onAccent: kit?.onAccent ?? "#FAF8F4",
  });
  const [logoDataUrl, setLogoDataUrl] = useState<string | null | undefined>(undefined); // undefined=변경없음, null=제거
  const [logoPreview, setLogoPreview] = useState<string | null>(kit?.logoUrl ?? null);
  const [placement, setPlacement] = useState<LogoPlacement>(kit?.logoPlacement ?? "closing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setError("로고는 2MB 이하만 올릴 수 있어요.");
      return;
    }
    setError(null);
    const r = new FileReader();
    r.onload = () => {
      setLogoDataUrl(String(r.result));
      setLogoPreview(String(r.result));
    };
    r.readAsDataURL(f);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveBrandKit({ ...colors, logoPlacement: placement, logoDataUrl });
    setBusy(false);
    if (r.ok) {
      onChange(r.kit);
      setLogoDataUrl(undefined);
      setOpen(false);
    } else {
      setError(r.error);
    }
  }

  async function remove() {
    setBusy(true);
    await deleteBrandKit();
    setBusy(false);
    onChange(null);
    setLogoPreview(null);
    setLogoDataUrl(undefined);
    setOpen(false);
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-card bg-primary-weak text-primary">
              <Palette className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-bold leading-tight">나만의 디자인</p>
              <p className="text-[12px] text-fg-sub">
                {kit ? "내 브랜드 색·로고가 적용돼요." : "브랜드 색과 로고를 저장해 모든 카드에 넣어요."}
              </p>
            </div>
          </div>
          <Button size="sm" variant={kit ? "secondary" : "primary"} onClick={() => setOpen((v) => !v)}>
            {kit ? "수정" : "만들기"}
          </Button>
        </div>

        {open ? (
          <div className="space-y-4 rounded-card bg-overlay p-3">
            {/* 색 4종 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {COLOR_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5 text-[12px] font-medium text-fg-sub">
                  {f.label}
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colors[f.key]}
                      onChange={(e) => setColors((c) => ({ ...c, [f.key]: e.target.value }))}
                      className="size-8 cursor-pointer rounded-card border border-line bg-transparent p-0"
                      aria-label={f.label}
                    />
                    <span className="tnum text-[11px] text-fg-faint">{colors[f.key].toUpperCase()}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* 로고 */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-card border border-line bg-body">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 로고 data URL/스토리지 미리보기
                  <img src={logoPreview} alt="로고 미리보기" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-fg-faint">로고</span>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-card border border-line px-2.5 py-1.5 text-[13px] font-medium text-fg-sub hover:border-primary hover:text-primary">
                  <ImagePlus className="size-4" aria-hidden />
                  로고 업로드
                  <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden onChange={pickLogo} />
                </label>
                {logoPreview ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoDataUrl(null);
                      setLogoPreview(null);
                    }}
                    className="ml-2 text-[12px] text-negative underline underline-offset-2"
                  >
                    로고 제거
                  </button>
                ) : null}
                <p className="text-[11px] text-fg-faint">PNG 권장 · 2MB 이하</p>
              </div>
              <label className="ml-auto flex flex-col gap-1 text-[12px] font-medium text-fg-sub">
                로고 위치
                <select
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as LogoPlacement)}
                  className="h-8 rounded-card border border-line bg-body px-2 text-[13px] text-fg focus:border-primary focus:outline-none"
                >
                  {PLACEMENTS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <p className="text-[13px] text-negative">{error}</p> : null}

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={busy}>
                <Check className="size-4" aria-hidden />
                {busy ? "저장 중…" : "저장하고 적용"}
              </Button>
              {kit ? (
                <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
                  <Trash2 className="size-4" aria-hidden />
                  삭제
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                <X className="size-4" aria-hidden />
                닫기
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
