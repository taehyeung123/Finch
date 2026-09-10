"use client";

import { useEffect, useRef, useState } from "react";
import { Wand2, Check, RotateCcw, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { actionRejectHint } from "@/lib/monitoring/action-reject";
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
  /* 초기화 — 되돌릴 수 없는 삭제라 확인을 받고, 왕복(0.75~2초) 동안 잠근다.
     예전엔 확인도 진행 표시도 없어 눌러도 한동안 아무 일이 없었고, 실패해도 「학습 안 됨」으로 그렸다 */
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const resetLock = useRef(false);
  const [resetError, setResetError] = useState<string | null>(null);

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
    if (resetLock.current) return;
    resetLock.current = true;
    setResetBusy(true);
    setResetError(null);
    try {
      const r = await clearBrandProfile();
      /* 성공일 때만 비운다 — 실패를 «없음»으로 그리면 새로고침 뒤 톤이 되살아난다 */
      if (r.ok) {
        setProfile(null);
        setOpen(false);
      } else {
        setResetError(r.error);
      }
    } catch (e) {
      const hint = actionRejectHint("studio.brand-tone.reset", e);
      if (hint !== null) setResetError(`초기화하지 못했어요. ${hint}`);
    } finally {
      resetLock.current = false;
      setResetBusy(false);
      setConfirmReset(false);
    }
  }

  // 로드 전엔 스켈레톤 카드로 자리를 잡는다 — null 을 반환하면 2열 그리드에서 왼쪽
  // 칸이 비었다가 데이터가 오며 갑자기 밀려 들어와 레이아웃이 튀었다.
  if (!loaded) {
    return (
      <Card>
        <CardBody>
          <div className="anim-pulse h-24 rounded-card bg-plate" aria-hidden />
        </CardBody>
      </Card>
    );
  }

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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResetError(null);
                  setConfirmReset(true);
                }}
                disabled={resetBusy}
                title="톤 초기화"
                aria-label="톤 초기화"
              >
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

        {resetError ? (
          <p role="alert" className="text-[14px] text-negative">
            {resetError}
          </p>
        ) : null}

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
      {confirmReset ? (
        <ConfirmDialog
          title="브랜드 톤을 초기화할까요?"
          description="학습한 말투와 자주 쓰는 표현이 지워지고, 이후 카드뉴스는 기본 톤으로 만들어져요. 지운 내용은 되돌릴 수 없어요 — 다시 쓰려면 톤을 새로 학습시켜야 해요."
          confirmLabel={resetBusy ? "초기화하는 중…" : "초기화"}
          busy={resetBusy}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => void reset()}
        />
      ) : null}
    </Card>
  );
}
