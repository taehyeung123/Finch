"use client";

import { Bird, ChevronRight, Image as ImageIcon } from "lucide-react";
import { CTA_LABELS, type CtaType } from "@/lib/ads/creative-rules";

/*
  자체 폰 목업 — 마법사 ②(소재)에서 타이핑을 즉시 반영하는 **입력 확인용** 미리보기(스펙 §1.3).
  메타가 그리는 정본(③ 의 generatepreviews iframe)과는 다른 렌더러다 — 그래서 라벨이 «대략적인 모습이에요»다.
  데모 마법사의 IG 피드 목업(demo-wizard.tsx)을 떼어 실데이터 props 로 바꿨다. 프레임 라운드는 chip 토큰(32px),
  스크린 24px 은 프레임 곡률 추종용 예외(데모와 같다). 베젤은 bg-fg 라 라이트/다크에서 자동 반전된다.
*/

export function AdPreview({
  pageName,
  imageUrl,
  headline,
  message,
  cta,
  linkHost,
}: {
  pageName: string | null;
  imageUrl: string | null;
  headline: string;
  message: string;
  cta: CtaType;
  linkHost: string;
}) {
  const body = message.trim();
  const shownBody = body.length > 125 ? body.slice(0, 125) : body;
  return (
    <div>
      <div className="mx-auto w-full max-w-[300px]">
        <div className="rounded-chip bg-fg p-2 shadow-pop">
          <div className="overflow-hidden rounded-[24px] bg-body">
            <div className="flex items-center justify-between px-4 pb-1 pt-2.5" aria-hidden>
              <span className="tnum text-[11px] font-semibold">12:30</span>
              <span className="size-2 rounded-chip bg-fg" />
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-chip bg-fg/60" />
                <span className="size-1.5 rounded-chip bg-fg/40" />
                <span className="h-2.5 w-5 rounded-[3px] border border-fg/40 bg-positive/70" />
              </span>
            </div>

            <div className="flex items-center gap-2.5 p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-primary">
                <Bird className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{pageName ?? "페이지 이름"}</p>
                <p className="text-[12px] text-fg-sub">광고</p>
              </div>
            </div>

            <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-plate">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 업로드 직후 로컬 미리보기(object URL) 또는 메타 썸네일
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-fg-faint">
                  <ImageIcon className="size-8" aria-hidden />
                  <p className="text-[12px] text-fg-sub">이미지를 올리면 여기에 보여요</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-y border-line px-3 py-2.5">
              <div className="min-w-0">
                {linkHost ? <p className="truncate text-[11px] uppercase text-fg-sub">{linkHost}</p> : null}
                <span className="text-[14px] font-semibold text-primary-ink">
                  {cta === "NO_BUTTON" ? "" : CTA_LABELS[cta]}
                </span>
              </div>
              {cta !== "NO_BUTTON" ? <ChevronRight className="size-4 shrink-0 text-primary-ink" aria-hidden /> : null}
            </div>

            <div className="space-y-1.5 p-3">
              {headline.trim() ? (
                <p className="break-words text-[15px] font-semibold">{headline.trim()}</p>
              ) : (
                <span className="block h-3.5 w-2/3 rounded-chip bg-plate" aria-hidden />
              )}
              {shownBody ? (
                <p className="break-words text-[14px] leading-relaxed text-fg-sub">
                  {shownBody}
                  {body.length > 125 ? <span className="text-fg-faint">… 더보기</span> : null}
                </p>
              ) : (
                <>
                  <span className="block h-3 w-full rounded-chip bg-plate" aria-hidden />
                  <span className="block h-3 w-4/5 rounded-chip bg-plate" aria-hidden />
                </>
              )}
            </div>

            <div className="flex justify-center pb-2 pt-1" aria-hidden>
              <span className="h-1 w-20 rounded-chip bg-fg/30" />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-fg-sub">대략적인 모습이에요 — 실제 모습은 다음 단계에서 메타가 그려 줘요.</p>
    </div>
  );
}
