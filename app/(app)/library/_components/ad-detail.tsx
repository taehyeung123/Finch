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
  광고 상세 모달 — 카드 클릭 시. (2026-08-12, 스니핏 상세 구성 이식)

  전에는 카드를 누르면 곧장 메타 광고 라이브러리 외부 링크로 나갔다.
  보던 화면을 떠나는 데다, 우리가 가진 정보(집행 기간·업종·유사 광고)를
  하나도 못 보여준다 — 상세는 우리 안에서 열고, 외부는 [원본 보기]로만 나간다.

  구성: 왼쪽 미디어 / 오른쪽 광고 정보 + 행동 줄 + 유사 광고.
  유사 광고는 서버 호출 없이 이미 받아 둔 목록에서 같은 광고주 → 같은 업종 순으로
  고른다 — 모달 안에서 옆 광고로 계속 넘어가며 탐색하는 동선(스니핏과 동일)이다.
*/

/** 게재 플랫폼 코드 → 한국어 라벨 */
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

export function AdDetailModal({
  ad,
  similar,
  favorite,
  onToggleFavorite,
  onSelect,
  onClose,
}: {
  ad: ReferenceAd;
  /** 유사 광고 — 같은 광고주 우선, 다음 같은 업종. 클릭하면 모달이 그 광고로 바뀐다 */
  similar: ReferenceAd[];
  favorite: boolean;
  onToggleFavorite: () => void;
  onSelect: (ad: ReferenceAd) => void;
  onClose: () => void;
}) {
  /* 안내 문구에 광고 id 를 같이 묶는다 — 유사 광고로 넘어가면 이전 광고의
     "이미지를 저장했어요"가 자동으로 안 보인다. effect 로 지우는 방식은
     react-hooks/set-state-in-effect 에 걸리고, 굳이 렌더를 한 번 더 돌릴 이유도 없다. */
  const [msgState, setMsgState] = useState<{ id: string; text: string } | null>(null);
  const msg = msgState && msgState.id === ad.id ? msgState.text : null;
  const setMsg = (text: string) => setMsgState({ id: ad.id, text });
  const days = runningDays(ad);
  const libraryHref = `https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 이미지 저장 — 썸네일은 우리 Storage(공개 버킷)라 blob 으로 받아 내려준다.
   *  a[download] 만으로는 교차 출처에서 다운로드가 안 되고 그냥 이동해 버린다. */
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
      setMsg("이미지 저장에 실패했어요 — [원본 보기]에서 직접 저장해 주세요.");
    }
  }

  /** 공유 — 기기 공유 시트가 있으면 그걸, 없으면 링크 복사 */
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${ad.pageName} 광고 레퍼런스`, url: libraryHref });
        return;
      }
      await navigator.clipboard.writeText(libraryHref);
      setMsg("링크를 복사했어요.");
    } catch {
      // 공유 시트를 사용자가 닫은 경우 — 아무것도 안 한 것이므로 조용히
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
      <div className="shadow-pop flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-card border border-line bg-overlay sm:rounded-card">
        {/* 머리 줄 */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-chip bg-primary-weak">
              <Megaphone className="size-4 text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-fg">{ad.pageName}</p>
              <p className="text-[12px] text-fg-faint">메타광고 레퍼런스</p>
            </div>
            <Badge>{ad.category}</Badge>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="trans-state shrink-0 cursor-pointer rounded-card p-1.5 text-fg-faint hover:bg-body hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] md:overflow-hidden">
          {/* ── 왼쪽: 미디어 ── */}
          <div className="flex items-center justify-center bg-plate p-4 md:overflow-hidden">
            {ad.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL, 최적화 프록시 미대상
              <img
                src={ad.thumbnailUrl}
                alt={`${ad.pageName} 광고 소재`}
                className="max-h-[70dvh] w-auto max-w-full rounded-card object-contain"
              />
            ) : (
              <div className="flex aspect-[4/5] w-full items-center justify-center">
                <Megaphone className="size-12 text-fg-faint" aria-hidden />
              </div>
            )}
          </div>

          {/* ── 오른쪽: 정보 + 행동 + 유사 광고 ── */}
          <div className="flex min-h-0 flex-col gap-4 p-5 md:overflow-y-auto">
            {/* 광고 정보 */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 font-semibold",
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
                  <span className="tnum font-semibold text-fg">{days}일 집행</span>
                ) : null}
                {ad.startDate ? (
                  <span className="inline-flex items-center gap-1 text-fg-sub">
                    <Calendar className="size-3.5 text-fg-faint" aria-hidden />
                    {new Date(ad.startDate).toLocaleDateString("ko-KR")} 시작
                  </span>
                ) : null}
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
            </div>

            {/* 광고 문구 전문 */}
            {ad.body ? (
              <div className="min-h-0">
                <p className="text-[13px] font-bold text-fg">광고 문구</p>
                <div className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-body px-3 py-2.5 text-[13px] leading-relaxed text-fg-sub">
                  {ad.body}
                </div>
              </div>
            ) : null}

            {/* 행동 줄 — 보드에 저장이 주 행동이다 */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={favorite ? "secondary" : "primary"} onClick={onToggleFavorite}>
                <Bookmark className="size-4" fill={favorite ? "currentColor" : "none"} aria-hidden />
                {favorite ? "보드에서 빼기" : "보드에 저장"}
              </Button>
              <Button size="sm" variant="secondary" onClick={downloadImage}>
                <Download className="size-4" aria-hidden />
                이미지 저장
              </Button>
              <Button size="sm" variant="secondary" onClick={share}>
                <Share2 className="size-4" aria-hidden />
                공유
              </Button>
              <a
                href={libraryHref}
                target="_blank"
                rel="noopener noreferrer"
                className="trans-state inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-card px-3 text-[13px] font-semibold text-fg-sub hover:bg-body hover:text-fg"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                원본 보기
              </a>
            </div>
            {msg ? (
              <p role="status" className="text-[12.5px] text-fg-sub">
                {msg}
              </p>
            ) : null}

            {/* 유사 광고 — 같은 광고주 우선, 다음 같은 업종 */}
            {similar.length > 0 ? (
              <div>
                <p className="text-[13px] font-bold text-fg">유사 광고</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {similar.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelect(s)}
                      aria-label={`${s.pageName} 광고 보기`}
                      className="group/sim trans-state cursor-pointer overflow-hidden rounded-card border border-line bg-body text-left hover:border-line-strong"
                    >
                      <span className="block aspect-square w-full overflow-hidden bg-plate">
                        {s.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL
                          <img
                            src={s.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <span className="flex size-full items-center justify-center" aria-hidden>
                            <Megaphone className="size-5 text-fg-faint" />
                          </span>
                        )}
                      </span>
                      <span className="block truncate px-2 py-1.5 text-[11.5px] font-medium text-fg-sub">
                        {s.pageName}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
