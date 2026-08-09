"use client";

import { Bookmark, Eye, Megaphone } from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import type { ReferenceAd, ReferenceItem } from "@/lib/types";

/*
  결과 카드 — 오가닉·메타광고 공통 셸.
  현행 카드가 정보 블록 13개를 담아 그리드 리듬을 끊었다. 7개로 줄이고 나머지는
  상세 오버레이로 미룬다(후킹 태그·해시태그·AI 코멘트·개별 지표·원본 링크·카드뉴스 CTA).

  두 종류의 **외곽 치수는 완전히 동일하다** — 같은 aspect-[4/5] 썸네일 + 같은 푸터.
  담기는 정보만 다르다. 그래야 한 그리드에 섞여도 리듬이 안 깨진다.

  썸네일은 object-cover가 아니라 object-contain이다. 9:16 릴스의 상단 후킹 문구와
  하단 자막이 크롭에 잘려나가는데, 레퍼런스 도구에서 잘린 그 부분이 바로 사용자가
  보러 온 것이다. contain은 카드 높이를 픽셀 단위로 균일하게 유지하면서 크리에이티브를
  통째로 보존하는 유일한 절충안이다.
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
      aria-label={on ? "즐겨찾기 해제" : "즐겨찾기"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute right-2 top-2 inline-flex size-8 cursor-pointer items-center justify-center rounded-chip bg-overlay/90 backdrop-blur-sm transition-colors",
        on ? "text-primary" : "text-fg-faint hover:text-fg",
      )}
    >
      <Bookmark className="size-4" fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
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

  /* 지표는 최대 2개. 팔로워 대비 배수가 산출되면 그걸 우선한다 —
     /discover의 '도달 스코어'를 실측 가능한 형태로 대체하는 값이다. */
  const reachMultiple = item.followerCount > 0 && item.views > 0 ? item.views / item.followerCount : null;
  const engageRate =
    item.views > 0 ? ((item.likes + (item.comments ?? 0)) / item.views) * 100 : null;

  return (
    <Card hover className="group flex flex-col overflow-hidden" title={`'${item.matchedSource}' 기준으로 수집`}>
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${item.title} 상세 보기`}
          className="block w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL이라 최적화 프록시를 거치지 않는다
            <img
              src={item.thumbnailUrl}
              alt=""
              loading="lazy"
              className="aspect-[4/5] w-full border-b border-line bg-surface object-contain"
            />
          ) : (
            <span className="flex aspect-[4/5] items-center justify-center border-b border-line bg-surface" aria-hidden>
              <Glyph className="size-9 text-fg-faint" />
            </span>
          )}
        </button>
        <SaveToggle on={favorite} onClick={onToggleFavorite} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {/* 메타 행 — 채널 글리프 + 핸들 + (우) 기준 대비 배수 */}
        <div className="flex h-[18px] items-center gap-1.5">
          <Glyph className={cn("size-3.5 shrink-0", item.channel === "instagram" ? "text-ig" : "text-fg")} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[12px] text-fg-sub">{item.creatorHandle}</span>
          {overAvgMultiple ? (
            <Badge tone="positive" className="shrink-0" title="같은 수집 기준의 평균 반응 대비 — 핀치 자체 계산">
              기준 대비 {overAvgMultiple.toFixed(1)}배
            </Badge>
          ) : null}
        </div>

        <button type="button" onClick={onOpen} className="cursor-pointer text-left">
          <p className="line-clamp-1 text-[15px] font-semibold leading-snug text-fg transition-colors group-hover:text-primary">
            {item.title}
          </p>
        </button>

        {/* AI 요약 — 카드가 영상 재생을 대체해야 한다는 게 이 제품의 핵심 가치라 반드시 남긴다 */}
        <p className="line-clamp-2 text-[13px] leading-relaxed text-fg-sub">{item.summary}</p>

        {/* 지표 행 — 산출 불가면 행 자체를 렌더하지 않는다(0을 지어내지 않는다) */}
        {item.views > 0 || reachMultiple !== null ? (
          <div className="mt-auto flex items-center gap-3 pt-1 text-[12px] text-fg-sub">
            {item.views > 0 ? (
              <span className="inline-flex items-center gap-1" title="조회수">
                <Eye className="size-3.5 text-fg-faint" aria-hidden />
                <span className="tnum font-semibold text-fg">{formatCompact(item.views)}</span>
              </span>
            ) : null}
            {reachMultiple !== null ? (
              <span className="tnum" title="조회수 ÷ 팔로워 수 — 핀치 자체 계산">
                팔로워 대비 <span className="font-semibold text-fg">{reachMultiple.toFixed(1)}배</span>
              </span>
            ) : engageRate !== null ? (
              <span className="tnum" title="(좋아요+댓글) ÷ 조회수 — 핀치 자체 계산">
                공감률 <span className="font-semibold text-fg">{engageRate.toFixed(2)}%</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

const PLATFORM_LABEL: Record<string, string> = {
  FACEBOOK: "페이스북",
  INSTAGRAM: "인스타그램",
  AUDIENCE_NETWORK: "오디언스 네트워크",
  MESSENGER: "메신저",
};

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
}: {
  ad: ReferenceAd;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const days = runningDays(ad);
  const href = `https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`;

  return (
    <Card hover className="group flex flex-col overflow-hidden" title={`'${ad.matchedSource}' 검색으로 수집`}>
      <div className="relative">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${ad.pageName} 광고를 광고 라이브러리에서 보기`}
          className="block w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {ad.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 공급사 원본 썸네일 URL, 최적화 프록시 미대상
            <img
              src={ad.thumbnailUrl}
              alt=""
              loading="lazy"
              className="aspect-[4/5] w-full border-b border-line bg-surface object-contain"
            />
          ) : (
            <span className="flex aspect-[4/5] items-center justify-center border-b border-line bg-surface" aria-hidden>
              <Megaphone className="size-9 text-fg-faint" />
            </span>
          )}
        </a>
        {/* 좌상단 종류 오버레이 — 오가닉 카드에는 없다. 이게 유일한 종류 구분 표식 */}
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-chip bg-overlay/90 px-2 py-0.5 text-[11px] font-semibold text-fg-sub backdrop-blur-sm">
          <Megaphone className="size-3" aria-hidden />
          메타광고
        </span>
        <SaveToggle on={favorite} onClick={onToggleFavorite} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex h-[18px] items-center gap-1.5">
          <Megaphone className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[12px] text-fg-sub">{ad.pageName}</span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold",
              ad.isActive ? "text-positive" : "text-fg-faint",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", ad.isActive ? "bg-positive" : "bg-fg-faint")}
              aria-hidden
            />
            {ad.isActive ? "게재 중" : "종료"}
          </span>
        </div>

        <a href={href} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
          <p className="line-clamp-1 text-[15px] font-semibold leading-snug text-fg transition-colors group-hover:text-primary">
            {ad.body || "문구 없는 이미지·영상 소재"}
          </p>
        </a>

        <p className="line-clamp-2 text-[13px] leading-relaxed text-fg-sub">
          {ad.aiComment || (ad.platforms.length > 0 ? ad.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(" · ") : "")}
        </p>

        {days !== null || ad.ctaText ? (
          <div className="mt-auto flex items-center gap-2 pt-1 text-[12px] text-fg-sub">
            {days !== null ? (
              <span className="tnum">
                <span className="font-semibold text-fg">{days}</span>일간 게재
              </span>
            ) : null}
            {days !== null && ad.ctaText ? <span className="text-fg-faint">·</span> : null}
            {ad.ctaText ? <span className="truncate">{ad.ctaText}</span> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
