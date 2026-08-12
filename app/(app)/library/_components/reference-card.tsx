"use client";

import { Bookmark, Eye, Megaphone, Play } from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import type { ReferenceAd, ReferenceItem } from "@/lib/types";

/*
  결과 카드 — 미디어 우선 구조 (2026-08-10 Solari 실측 이식).

  이전 구조는 이미지 아래에 제목·요약·지표 4행이 세로로 붙어 카드 높이가 컸고
  1400px 화면에 4장밖에 안 들어갔다. Solari는 카드를 미디어 그 자체로 만들고
  정보를 오버레이로 올려 같은 폭에 훨씬 많이, 훨씬 꽉 차 보이게 한다
  (실측: 329x584 9:16 프레임, object-cover, gap 8px, 정보 전부 오버레이).

  핀치 조정 2가지:
  ① 프레임을 9:16이 아니라 3:4로 잡는다 — 우리 그리드에는 세로 릴스와 가로형
     메타광고가 섞이므로 9:16 고정은 광고를 심하게 자른다.
  ② 하단 정보 바(44px)는 항상 보인다 — 이 제품은 갤러리가 아니라 "왜 이게
     잘됐는지"를 읽는 도구다. 채널·핸들·핵심 지표는 스캔 가능해야 하고,
     제목·요약만 호버 오버레이로 올린다.
*/

const CHANNEL_GLYPH = {
  instagram: InstagramGlyph,
  tiktok: TiktokGlyph,
  threads: ThreadsGlyph,
} as const;

function SaveToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "저장 해제" : "저장"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "trans-state absolute right-2 top-2 z-10 inline-flex size-7 cursor-pointer items-center justify-center rounded-chip bg-black/45 text-white",
        on && "text-primary",
      )}
    >
      <Bookmark className="size-3.5" fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

/** 하단 정보 바 — 두 카드가 픽셀 단위로 같은 높이를 쓰게 44px 고정 */
function InfoBar({
  glyph,
  label,
  metric,
}: {
  glyph: React.ReactNode;
  label: string;
  metric: React.ReactNode;
}) {
  return (
    <div className="flex h-11 items-center gap-1.5 px-2.5">
      <span className="shrink-0" aria-hidden>
        {glyph}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-fg-sub">{label}</span>
      {metric}
    </div>
  );
}

export function ReferenceCard({
  item,
  favorite,
  onToggleFavorite,
  overAvgMultiple,
  onOpen,
}: {
  item: ReferenceItem;
  favorite: boolean;
  onToggleFavorite: () => void;
  /** 같은 기준 평균 대비 반응 배수 — 1.5배 이상일 때만 전달됨 */
  overAvgMultiple?: number;
  onOpen: () => void;
}) {
  const Glyph = CHANNEL_GLYPH[item.channel];
  const isVideo = item.channel === "tiktok" || item.views > 0;

  return (
    <Card hover className="group card-defer relative flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.title} 상세 보기`}
        className="media-frame block cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL이라 최적화 프록시를 거치지 않는다
          <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="flex size-full items-center justify-center" aria-hidden>
            <Glyph className="size-8 text-fg-faint" />
          </span>
        )}

        {/* 성과 배지 — 같은 수집 기준 평균 대비 배수 */}
        {overAvgMultiple ? (
          <span className="tnum absolute left-2 top-2 rounded-chip bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">
            {overAvgMultiple.toFixed(1)}배
          </span>
        ) : null}

        {isVideo && item.thumbnailUrl ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="flex size-9 items-center justify-center rounded-chip bg-black/30">
              <Play className="size-4 text-white" fill="currentColor" />
            </span>
          </span>
        ) : null}

        {/* 호버 오버레이 — 제목 + AI 요약 */}
        <span className="media-veil pointer-events-none block">
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{item.title}</span>
          {item.summary ? (
            <span className="mt-1 line-clamp-3 block text-[12px] leading-relaxed text-white/80">{item.summary}</span>
          ) : null}
        </span>
      </button>

      <SaveToggle on={favorite} onClick={onToggleFavorite} />

      <InfoBar
        glyph={<Glyph className={cn("size-3.5", item.channel === "instagram" ? "text-ig" : "text-fg")} />}
        label={item.creatorHandle}
        metric={
          item.views > 0 ? (
            <span className="tnum inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-fg">
              <Eye className="size-3.5 text-fg-faint" aria-hidden />
              {formatCompact(item.views)}
            </span>
          ) : null
        }
      />
    </Card>
  );
}

/** 게재 일수 — 오래 도는 광고는 성과 신호다. startDate가 없으면 null */
function runningDays(ad: ReferenceAd): number | null {
  if (!ad.startDate) return null;
  const start = new Date(ad.startDate).getTime();
  const end = ad.endDate ? new Date(ad.endDate).getTime() : Date.now();
  const days = Math.floor((end - start) / 86_400_000);
  return days >= 0 ? days : null;
}

export function AdCard({
  ad,
  favorite,
  onToggleFavorite,
  onOpen,
}: {
  ad: ReferenceAd;
  favorite: boolean;
  onToggleFavorite: () => void;
  /** 상세 모달 열기 — 외부(메타 라이브러리)로 곧장 나가지 않는다.
      보던 화면을 떠나는 데다 우리가 가진 정보(집행 기간·유사 광고)를 하나도 못 준다.
      외부 링크는 모달 안 [원본 보기]로만. */
  onOpen: () => void;
}) {
  const days = runningDays(ad);

  return (
    <Card hover className="group card-defer relative flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${ad.pageName} 광고 상세 보기`}
        className="media-frame block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        {ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 공급사 원본 썸네일 URL, 최적화 프록시 미대상
          <img src={ad.thumbnailUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="flex size-full items-center justify-center" aria-hidden>
            <Megaphone className="size-8 text-fg-faint" />
          </span>
        )}

        {/* 좌상단 종류 표식 — 오가닉 카드에는 없다. 광고를 구분하는 유일한 신호 */}
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-chip bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white">
          <Megaphone className="size-3" aria-hidden />
          광고
        </span>

        <span className="media-veil pointer-events-none block">
          <span className="line-clamp-3 text-[13px] font-semibold leading-snug text-white">
            {ad.body || "문구 없는 이미지·영상 소재"}
          </span>
          {ad.ctaText ? (
            <span className="mt-1.5 inline-block rounded-chip bg-white/90 px-2 py-0.5 text-[11px] font-bold text-black">
              {ad.ctaText}
            </span>
          ) : null}
        </span>
      </button>

      <SaveToggle on={favorite} onClick={onToggleFavorite} />

      <InfoBar
        glyph={<Megaphone className="size-3.5 text-fg-faint" />}
        label={ad.pageName}
        metric={
          days !== null ? (
            <span
              className={cn(
                "tnum inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold",
                ad.isActive ? "text-positive" : "text-fg-faint",
              )}
              title={ad.isActive ? "게재 중" : "게재 종료"}
            >
              <span
                className={cn("size-1.5 rounded-full", ad.isActive ? "bg-positive" : "bg-fg-faint")}
                aria-hidden
              />
              {days}일
            </span>
          ) : null
        }
      />
    </Card>
  );
}
