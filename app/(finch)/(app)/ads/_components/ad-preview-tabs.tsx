"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { adsWriteMessage, type AdsWriteFailCode, type CreatableObjective } from "@/lib/ads/campaign-rules";
import type { CreativeInput } from "@/lib/ads/creative-rules";
import { AD_PREVIEW_FORMAT_KEYS, AD_PREVIEW_FORMATS, type AdPreviewFormat } from "@/lib/ads/preview-formats";
import { generateAdPreviewAction, type AdPreviewResult } from "../ad-tree-actions";

/*
  메타가 그린 미리보기 — 마법사 ③. 탭(피드·스토리·릴스·FB 피드)을 열 때 generatepreviews 를 한 번 부르고
  세션 동안 재사용한다(§5.1). 소재 입력이 바뀌면(서명이 달라지면) 전부 무효화된다.
  iframe 은 **우리가** 만든다 — 서버가 준 src 만 넣고 referrerPolicy=no-referrer(§13-18). dangerouslySetInnerHTML 금지.
  이 화면이 «정본»이다(②의 목업은 입력 확인용) — 라벨이 그렇게 말한다.
*/

type Slot = { status: "loading" } | { status: "ok"; src: string; width: number; height: number } | { status: "error"; code: AdsWriteFailCode };

/* 세션 캐시 — 서명(소재 입력) + 포맷 → 결과. 24시간 유효(문서)지만 탭을 닫으면 사라진다 */
const cache = new Map<string, Extract<Slot, { status: "ok" }>>();

export function AdPreviewTabs({
  campaignName,
  objective,
  creative,
}: {
  campaignName: string;
  objective: CreatableObjective;
  creative: CreativeInput;
}) {
  const signature = JSON.stringify([objective, creative.message, creative.headline, creative.description, creative.link, creative.cta, creative.imageHash]);
  const [format, setFormat] = useState<AdPreviewFormat>("INSTAGRAM_STANDARD");
  const [slots, setSlots] = useState<{ signature: string; byFormat: Partial<Record<AdPreviewFormat, Slot>> }>({ signature, byFormat: {} });
  const [retry, setRetry] = useState(0);

  const current = slots.signature === signature ? slots.byFormat[format] : undefined;

  useEffect(() => {
    if (current && current.status !== "error") return;
    if (current?.status === "error" && retry === 0) return; // 자동 재시도 금지 — 사람이 «다시 시도»를 누른다
    const key = `${signature}|${format}`;
    const hit = cache.get(key);
    let cancelled = false;
    const run = async () => {
      if (hit) {
        setSlots((prev) => ({ signature, byFormat: { ...(prev.signature === signature ? prev.byFormat : {}), [format]: hit } }));
        return;
      }
      setSlots((prev) => ({ signature, byFormat: { ...(prev.signature === signature ? prev.byFormat : {}), [format]: { status: "loading" } } }));
      let res: AdPreviewResult;
      try {
        res = await generateAdPreviewAction({ campaignName, objective, format, creative });
      } catch {
        res = { ok: false, code: "preview_failed" };
      }
      if (cancelled) return;
      const slot: Slot = res.ok ? { status: "ok", src: res.src, width: res.width, height: res.height } : { status: "error", code: res.code };
      if (slot.status === "ok") cache.set(key, slot);
      setSlots((prev) => ({ signature, byFormat: { ...(prev.signature === signature ? prev.byFormat : {}), [format]: slot } }));
    };
    /* 마이크로태스크로 미룬다 — effect 본문에서 동기 setState 를 하지 않는다 */
    const t = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- creative 는 signature 로 대표된다(객체 identity 로 재요청하지 않는다)
  }, [signature, format, retry, campaignName, objective]);

  const tall = format === "INSTAGRAM_STORY" || format === "INSTAGRAM_REELS";

  return (
    <div>
      <div role="tablist" aria-label="미리보기 노출 위치" className="flex flex-wrap gap-1.5">
        {AD_PREVIEW_FORMAT_KEYS.map((f) => {
          const on = f === format;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setRetry(0);
                setFormat(f);
              }}
              className={cn(
                "rounded-chip border px-3.5 py-1.5 text-[14px] font-semibold trans-state",
                on ? "border-primary bg-primary text-on-primary" : "border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg",
              )}
            >
              {AD_PREVIEW_FORMATS[f]}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex justify-center">
        {/* 폰 프레임 — 링크 편집기의 클래스 레시피만 가져왔다(§5.2). 안폭 ≈ 357px, 메타 iframe 은 자기 폭대로 그린다 */}
        <div
          className={cn(
            "phone-frame relative flex w-full max-w-[375px] flex-col overflow-hidden rounded-[42px] border-[9px] border-fg/15 bg-body",
            tall ? "aspect-[375/812]" : "min-h-[560px]",
          )}
        >
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-plate">
            {!current || current.status === "loading" ? (
              <p className="self-center px-6 text-center text-[14px] text-fg-sub">메타에서 미리보기를 만드는 중…</p>
            ) : current.status === "error" ? (
              <div className="flex flex-col items-center gap-3 self-center px-6 text-center">
                <p role="alert" className="text-[14px] text-fg-sub">
                  {adsWriteMessage(current.code)}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)}>
                  다시 시도
                </Button>
              </div>
            ) : (
              <iframe
                key={current.src}
                title={`${AD_PREVIEW_FORMATS[format]} 미리보기`}
                src={current.src}
                width={current.width}
                height={current.height}
                referrerPolicy="no-referrer"
                scrolling="no"
                className="block max-w-full border-0"
              />
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-fg-sub">
        메타가 그린 실제 게재 모습이에요 — 이 미리보기가 정본이에요. 게재 전까지 언제든 다시 만들 수 있어요.
      </p>
    </div>
  );
}
