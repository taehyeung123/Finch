"use client";

import { useEffect, useState } from "react";
import { Wand2, Check, RotateCcw, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBrandProfile, learnBrandProfile, clearBrandProfile, type BrandProfile } from "../actions";

/**
 * 브랜드 톤 학습 패널 — 잘 나온 캡션/설명에서 톤 프로필을 추출해 저장하고,
 * 이후 카드뉴스 생성 프롬프트에 자동 주입한다. "학습"은 프로필+예시 주입이지 모델 학습이 아니다.
 */
export function BrandTone() {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getBrandProfile()
      .then((s) => {
        if (!alive) return;
        setProfile(s?.profile ?? null);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function learn() {
    if (busy || input.trim().length < 20) return;
    setBusy(true);
    setError(null);
    try {
      const r = await learnBrandProfile(input);
      if (r.ok) {
        setProfile(r.profile);
        setOpen(false);
        setInput("");
      } else {
        setError(
          r.fallback
            ? "AI 톤 학습은 현재 준비 중이에요(크레딧/설정 확인 필요)."
            : (r.error ?? "학습에 실패했어요."),
        );
      }
    } catch {
      setError("학습 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    await clearBrandProfile();
    setProfile(null);
    setOpen(false);
  }

  if (!loaded) return null; // 로드 전엔 숨겨 깜빡임 방지

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-card bg-primary-weak text-primary">
              <Wand2 className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-bold leading-tight">브랜드 톤</p>
              <p className="text-[12px] text-fg-sub">
                {profile ? "학습된 내 톤으로 카드뉴스를 생성해요." : "내 톤을 학습시키면 모든 카드가 내 말투로 나와요."}
              </p>
            </div>
          </div>
          {profile ? (
            <div className="flex items-center gap-2">
              <Badge tone="positive">
                <Check className="size-3" aria-hidden />
                학습됨
              </Badge>
              <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
                다시 학습
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} title="톤 초기화">
                <RotateCcw className="size-4" aria-hidden />
              </Button>
            </div>
          ) : !open ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Wand2 className="size-4" aria-hidden />
              톤 학습하기
            </Button>
          ) : null}
        </div>

        {/* 학습된 프로필 요약 */}
        {profile && !open ? (
          <div className="space-y-2 rounded-card bg-overlay p-3 text-[14px]">
            <p className="text-fg-sub">
              <span className="font-semibold text-fg">말투</span> · {profile.tone}
            </p>
            {profile.phrases.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-fg-faint">자주 쓰는 표현</span>
                {profile.phrases.map((p) => (
                  <Badge key={p} tone="neutral">
                    {p}
                  </Badge>
                ))}
              </div>
            ) : null}
            {(profile.target || profile.industry) && (
              <p className="text-fg-faint">
                {profile.industry ? `업종 ${profile.industry}` : ""}
                {profile.industry && profile.target ? " · " : ""}
                {profile.target ? `타깃 ${profile.target}` : ""}
              </p>
            )}
          </div>
        ) : null}

        {/* 입력 폼 */}
        {open ? (
          <div className="space-y-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder="잘 나온 게시물 캡션 2~3개를 붙여넣거나, 브랜드 말투를 설명해 주세요. (예: 20대 여성 타깃, 친근한 반말체, 이모지 없이 담백하게)"
              className="w-full rounded-card border border-line bg-body px-3 py-2.5 text-[15px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
            {error ? <p className="text-[14px] text-negative">{error}</p> : null}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={learn} disabled={busy || input.trim().length < 20}>
                <Wand2 className="size-4" aria-hidden />
                {busy ? "톤 분석 중…" : "톤 학습"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
              >
                <X className="size-4" aria-hidden />
                취소
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
