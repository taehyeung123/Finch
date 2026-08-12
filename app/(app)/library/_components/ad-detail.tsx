"use client";

import { useEffect, useState } from "react";
import {
  Bookmark,
  Calendar,
  Download,
  ExternalLink,
  Megaphone,
  Share2,
  X,
} from "lucide-react";
import type { ReferenceAd } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/*
  광고 상세 모달 — 스니핏 상세를 크롬에서 실측해 구조 그대로 (2026-08-12, 3차).

  실측 구조 (1920 뷰포트, 모달 1728×851 = 화면 90%):
    [왼쪽 480px]                     [오른쪽 1248px]
    · 플랫폼 칩 (Meta 광고 ↗)        · "유사한 미디어" 제목 + 닫기 X
    · 미디어 (contain)               · 유사 카드 **그리드가 열 전체** (스크롤)
    · [이미지] [공유하기] [보드에 저장]     각 카드: 이미지 + [Meta 광고↗ 칩]
    · 광고주 이름 · 날짜                    + [보드에 저장] + 이름 + 날짜
    · 게재 상태 · N일간 게재                + ●게재상태 · N일간 게재
    · 본문 전문

  2차에서 틀린 것: 광고 정보를 오른쪽 열에 넣고 유사 광고를 그 아래 구겨 넣었다.
  스니핏은 **광고의 모든 정보가 왼쪽**이고 오른쪽은 유사 미디어 전용 면이다 —
  그래서 유사 카드가 시원하게 3~4열로 펼쳐진다.

  광고에는 좋아요·댓글·인스타 핸들이 없다 — 메타 광고 라이브러리가 안 준다.
  스니핏도 광고 상세에는 그 줄이 없다(실측: 케어놀로지 예시 = 이름·날짜·게재일수·
  게재상태·본문뿐). 좋아요·댓글·핸들은 오가닉 게시물 상세(ReferenceDetailModal)의 몫이다.
*/

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "페이스북",
  INSTAGRAM: "인스타그램",
  AUDIENCE_NETWORK: "오디언스 네트워크",
  MESSENGER: "메신저",
  THREADS: "스레드",
};

function runningDays(ad: ReferenceAd): number | null {
  if (!ad.startDate) return null;
  const start = new Date(ad.startDate).getTime();
  const end = ad.endDate ? new Date(ad.endDate).getTime() : Date.now();
  const days = Math.floor((end - start) / 86_400_000);
  return days >= 0 ? days : null;
}

function libraryHrefOf(ad: ReferenceAd): string {
  return `https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`;
}

/** 게재 상태 + 기간 한 줄 — 본 카드·유사 카드 공용 */
function RunRow({ ad, size = "md" }: { ad: ReferenceAd; size?: "md" | "sm" }) {
  const days = runningDays(ad);
  return (
    <span
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1",
        size === "md" ? "text-[13px]" : "text-[12px]",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium",
          ad.isActive ? "text-positive" : "text-fg-faint",
        )}
      >
        <span
          className={cn("size-1.5 rounded-full", ad.isActive ? "bg-positive" : "bg-fg-faint")}
          aria-hidden
        />
        {ad.isActive ? "게재 중" : "게재 종료"}
      </span>
      {days !== null ? (
        <span className="tnum inline-flex items-center gap-1 text-fg-sub">
          <Calendar className={cn("text-fg-faint", size === "md" ? "size-3.5" : "size-3")} aria-hidden />
          {days}일간 게재
        </span>
      ) : null}
    </span>
  );
}

/** 유사한 미디어 카드 — 스니핏 실측: 이미지 + [Meta 광고↗][보드에 저장] + 이름 + 날짜 + 게재정보 */
function SimilarCard({
  ad,
  saved,
  onToggleSave,
  onSelect,
}: {
  ad: ReferenceAd;
  saved: boolean;
  onToggleSave: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-body">
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${ad.pageName} 광고 보기`}
        className="block aspect-[4/5] w-full cursor-pointer overflow-hidden bg-plate"
      >
        {ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL
          <img src={ad.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center" aria-hidden>
            <Megaphone className="size-6 text-fg-faint" />
          </span>
        )}
      </button>
      <div className="space-y-1 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <a
            href={libraryHrefOf(ad)}
            target="_blank"
            rel="noopener noreferrer"
            className="trans-state inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-card border border-line px-1.5 text-[11px] font-medium text-fg-sub hover:border-line-strong hover:text-fg"
          >
            <Megaphone className="size-3 text-meta" aria-hidden />
            Meta 광고
            <ExternalLink className="size-2.5" aria-hidden />
          </a>
          <button
            type="button"
            onClick={onToggleSave}
            className={cn(
              "trans-state inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-card px-2 text-[11px] font-bold",
              saved ? "bg-primary-weak text-primary" : "bg-primary text-on-primary hover:bg-primary-hover",
            )}
          >
            <Bookmark className="size-3" fill={saved ? "currentColor" : "none"} aria-hidden />
            {saved ? "저장됨" : "보드에 저장"}
          </button>
        </div>
        <p className="truncate text-[13px] font-semibold text-fg">{ad.pageName}</p>
        {ad.startDate ? (
          <p className="tnum text-[12px] text-fg-faint">
            {new Date(ad.startDate).toLocaleDateString("ko-KR")}
          </p>
        ) : null}
        <RunRow ad={ad} size="sm" />
      </div>
    </div>
  );
}

export function AdDetailModal({
  ad,
  similar,
  favorite,
  savedIds,
  onToggleFavorite,
  onToggleSave,
  onSelect,
  onClose,
}: {
  ad: ReferenceAd;
  /** 유사한 미디어 — 같은 광고주 우선, 다음 같은 업종 */
  similar: ReferenceAd[];
  favorite: boolean;
  /** 유사 카드의 저장 상태 표시용 */
  savedIds: Set<string>;
  onToggleFavorite: () => void;
  onToggleSave: (id: string) => void;
  onSelect: (ad: ReferenceAd) => void;
  onClose: () => void;
}) {
  /* 안내 문구는 광고 id 와 묶는다 — 유사 광고로 넘어가면 자동으로 사라진다.
     effect 로 지우면 set-state-in-effect 린트에 걸리고 렌더도 한 번 더 돈다. */
  const [msgState, setMsgState] = useState<{ id: string; text: string } | null>(null);
  const msg = msgState && msgState.id === ad.id ? msgState.text : null;
  const setMsg = (text: string) => setMsgState({ id: ad.id, text });
  const libraryHref = libraryHrefOf(ad);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 이미지 저장 — Storage 가 교차 출처라 a[download] 만으로는 이동해 버린다. blob 으로 받는다 */
  async function downloadImage() {
    if (!ad.thumbnailUrl) {
      setMsg("이 광고는 저장할 이미지가 없어요.");
      return;
    }
    try {
      const res = await fetch(ad.thumbnailUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finch-${ad.pageName.replace(/[\\/:*?"<>|\s]+/g, "_")}-${ad.adArchiveId}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg("이미지를 저장했어요.");
    } catch {
      setMsg("이미지 저장에 실패했어요 — [Meta 광고↗]에서 직접 저장해 주세요.");
    }
  }

  /** 공유 — 기기 공유 시트, 없으면 링크 복사 */
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${ad.pageName} 광고 레퍼런스`, url: libraryHref });
        return;
      }
      await navigator.clipboard.writeText(libraryHref);
      setMsg("링크를 복사했어요.");
    } catch {
      // 공유 시트를 닫은 경우 — 조용히
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${ad.pageName} 광고 상세`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="shadow-pop grid h-[92dvh] w-full grid-rows-[minmax(0,1fr)] overflow-hidden rounded-t-card border border-line bg-overlay sm:h-[90dvh] sm:w-[90vw] sm:max-w-[1728px] sm:rounded-card md:grid-cols-[minmax(320px,480px)_minmax(0,1fr)]">
        {/* ══ 왼쪽 480px — 이 광고의 모든 것 ══ */}
        <div className="flex min-h-0 flex-col overflow-y-auto border-b border-line md:border-b-0 md:border-r">
          {/* 플랫폼 칩 — 스니핏의 [Instagram ↗] 자리 */}
          <div className="flex items-center justify-between px-4 pt-4">
            <a
              href={libraryHref}
              target="_blank"
              rel="noopener noreferrer"
              className="trans-state inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-card border border-line px-2.5 text-[12px] font-semibold text-fg-sub hover:border-line-strong hover:text-fg"
            >
              <Megaphone className="size-3.5 text-meta" aria-hidden />
              Meta 광고
              <ExternalLink className="size-3" aria-hidden />
            </a>
            {/* 모바일에서는 오른쪽 열 상단의 X 가 안 보이므로 여기에도 닫기 */}
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="trans-state cursor-pointer rounded-card p-1.5 text-fg-faint hover:bg-body hover:text-fg md:hidden"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {/* 미디어 */}
          <div className="flex min-h-[16rem] items-center justify-center p-4">
            {ad.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL, 최적화 프록시 미대상
              <img
                src={ad.thumbnailUrl}
                alt={`${ad.pageName} 광고 소재`}
                className="max-h-[46dvh] w-auto max-w-full rounded-card object-contain"
              />
            ) : (
              <Megaphone className="size-12 text-fg-faint" aria-hidden />
            )}
          </div>

          {/* 행동 줄 — 스니핏 배치: [이미지] 왼쪽, [공유하기][보드에 저장] 오른쪽 */}
          <div className="flex items-center justify-between gap-2 px-4">
            <Button size="sm" variant="secondary" onClick={downloadImage}>
              <Download className="size-4" aria-hidden />
              이미지
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={share}>
                <Share2 className="size-4" aria-hidden />
                공유하기
              </Button>
              <Button size="sm" variant={favorite ? "secondary" : "primary"} onClick={onToggleFavorite}>
                <Bookmark className="size-4" fill={favorite ? "currentColor" : "none"} aria-hidden />
                {favorite ? "저장됨" : "보드에 저장"}
              </Button>
            </div>
          </div>
          {msg ? (
            <p role="status" className="px-4 pt-2 text-[12.5px] text-fg-sub">
              {msg}
            </p>
          ) : null}

          {/* 광고주 블록 — 스니핏 순서: 이름 → 날짜 → 게재정보 → 본문 */}
          <div className="space-y-2.5 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-fg">{ad.pageName}</p>
                <p className="mt-0.5 text-[12px] text-fg-faint">메타광고 레퍼런스</p>
              </div>
              {ad.startDate ? (
                <span className="tnum shrink-0 text-[12.5px] text-fg-faint">
                  {new Date(ad.startDate).toLocaleDateString("ko-KR")}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <RunRow ad={ad} />
              <Badge>{ad.category}</Badge>
            </div>

            {ad.platforms.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {ad.platforms.map((p) => (
                  <span
                    key={p}
                    className="rounded-chip border border-line bg-body px-2.5 py-0.5 text-[12px] font-medium text-fg-sub"
                  >
                    {PLATFORM_LABELS[p] ?? p}
                  </span>
                ))}
              </div>
            ) : null}

            {ad.ctaText ? (
              <p className="text-[13px] text-fg-sub">
                행동 유도 버튼 · <span className="font-semibold text-fg">{ad.ctaText}</span>
              </p>
            ) : null}

            {/* 광고 문구 전문 — 스니핏처럼 왼쪽 열 본문으로. 열 스크롤에 함께 흐른다 */}
            {ad.body ? (
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{ad.body}</p>
            ) : (
              <p className="text-[13px] text-fg-faint">문구 없는 이미지·영상 소재예요.</p>
            )}
          </div>
        </div>

        {/* ══ 오른쪽 — 유사한 미디어 전용 면 ══ */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <p className="text-[15px] font-bold text-fg underline decoration-2 underline-offset-8">
              유사한 미디어
            </p>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="trans-state hidden cursor-pointer rounded-card p-1.5 text-fg-faint hover:bg-body hover:text-fg md:block"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {similar.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                {similar.map((s) => (
                  <SimilarCard
                    key={s.id}
                    ad={s}
                    saved={savedIds.has(s.id)}
                    onToggleSave={() => onToggleSave(s.id)}
                    onSelect={() => onSelect(s)}
                  />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-[13px] text-fg-faint">
                아직 비슷한 광고가 모이지 않았어요 — 수집이 쌓이면 여기서 함께 보여드려요.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
