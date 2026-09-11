"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Film, ImageIcon, ImagePlus, LoaderCircle, Play, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MediaTile } from "./use-media-tiles";

/*
  발행 작성기의 사진·영상 격자 — 타일 한 칸 = 게시물 항목 하나 (2026-09-11 영상 발행).

  한 칸에 겹치는 것(좁은 화면에서 한 칸이 약 83px 이다):
   · 왼쪽 위 순서 번호(캐러셀일 때만) · 오른쪽 위 빼기(✕) · 왼쪽 아래 종류 칩(사진 / ▶ 길이, 넓은 칸이면 용량까지)
   · 가운데 양옆 ◀ ▶ 순서 바꾸기 — 마우스는 올렸을 때·키보드는 초점이 왔을 때, 손가락 화면은 늘 보인다(호버가 없다)
   · 아래 가는 진행 막대 — .busy-veil-in 이라 0.2초 안에 끝나는 작은 사진엔 번쩍이지 않는다(«반응 기준» ②)
  ⚠️ busy-veil-in 을 **칸 전체**에 걸지 않는다 — 끝나면 막이 클릭을 받아(pointer-events:auto) 빼기·순서 버튼이 먹통이 된다.
     진행 막대·«준비 중» 표시에만 걸고, 그것도 pointer-events-none! 으로 클릭을 통과시킨다.
  버튼 표적은 36px — 보이는 크기는 작게 두고 after 의사요소로 넓힌다(mobile-baseline).
*/

/** 1:05 · 12:30 · 1:02:03 */
export function formatClock(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** 24MB · 850KB · 1.2GB */
export function formatBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  if (n < 1024 * 1024 * 1024) {
    const mb = n / (1024 * 1024);
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

const TILE_TYPE = "application/x-finch-tile";

export function MediaTiles({
  tiles,
  max,
  badIndexes,
  locked,
  onPick,
  onDropFiles,
  onRemove,
  onMove,
  onMoveTo,
  onRetry,
}: {
  tiles: MediaTile[];
  /** 더 고를 수 있는 상한(채널 최대 개수) — 차면 «추가» 칸을 숨긴다 */
  max: number;
  /** 지금 규칙에서 막힌 항목 번호(0부터) — 빨간 테두리 */
  badIndexes: ReadonlySet<number>;
  /** 저장 중 — 빼기·순서·추가를 막는다(보낸 목록과 화면이 어긋나지 않게) */
  locked: boolean;
  onPick: () => void;
  onDropFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onMoveTo: (key: string, index: number) => void;
  onRetry: (key: string) => void;
}) {
  /* 끌어 옮기기(데스크톱) — 어디에 놓을지 칸 테두리로 보여 준다 */
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const many = tiles.length > 1;

  function dropAt(e: React.DragEvent, index: number) {
    e.preventDefault();
    const key = e.dataTransfer.getData(TILE_TYPE);
    setOverIndex(null);
    setDragKey(null);
    if (locked) return;
    if (key) {
      onMoveTo(key, index);
      return;
    }
    const files = [...(e.dataTransfer.files ?? [])];
    if (files.length > 0) onDropFiles(files);
  }

  return (
    <ul
      className="grid grid-cols-4 gap-1.5"
      aria-label="올릴 사진·영상"
      onDragOver={(e) => {
        /* 파일을 격자 빈자리에 떨어뜨려도 받는다 — 막지 않으면 브라우저가 그 파일로 이동해 버린다 */
        if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(TILE_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => dropAt(e, tiles.length - 1)}
    >
      {tiles.map((t, i) => {
        const n = i + 1;
        const video = t.kind === "video";
        const noun = video ? "영상" : "사진";
        const s = t.state;
        const bad = badIndexes.has(i) || s.phase === "error" || s.phase === "held";
        const pct = s.phase === "uploading" && s.total > 0 ? Math.min(1, s.loaded / s.total) : 0;
        const clock = video ? formatClock(t.durationMs) : "";
        const size = formatBytes(video ? t.bytes : null);
        return (
          <li
            key={t.key}
            draggable={!locked && many}
            onDragStart={(e) => {
              e.dataTransfer.setData(TILE_TYPE, t.key);
              e.dataTransfer.effectAllowed = "move";
              setDragKey(t.key);
            }}
            onDragEnd={() => {
              setDragKey(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(TILE_TYPE) && !e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              e.stopPropagation();
              if (overIndex !== i) setOverIndex(i);
            }}
            onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.stopPropagation();
              dropAt(e, i);
            }}
            className={cn(
              "@container group relative aspect-square min-w-0 rounded-card border bg-plate",
              bad ? "border-negative" : overIndex === i && dragKey !== t.key ? "border-primary" : "border-line",
              dragKey === t.key && "opacity-50",
            )}
          >
            <span className="sr-only">
              {`${n}번째 ${noun}`}
              {clock ? ` · 길이 ${clock}` : ""}
              {size ? ` · ${size}` : ""}
            </span>
            {/* 미리보기만 칸 모양으로 자른다 — 버튼의 넓힌 표적(after)까지 잘리면 36px 이 안 나온다 */}
            <span className="absolute inset-0 overflow-hidden rounded-card">
              {t.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 올리기 전 로컬 미리보기(object URL)
                <img src={t.previewUrl} alt="" className="size-full object-cover" draggable={false} />
              ) : (
                <span className="flex size-full items-center justify-center text-fg-faint">
                  {video ? <Film className="size-6" aria-hidden /> : <ImageIcon className="size-6" aria-hidden />}
                </span>
              )}
            </span>

            {/* 상태 표시가 먼저, 칩·버튼이 나중(= 위) — «준비 중» 막이 빼기 버튼을 덮지 않게 */}
            {s.phase === "preparing" ? (
              <span role="status" className="busy-veil-in pointer-events-none! absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-card bg-scrim text-on-scrim">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                <span className="text-[11px]">준비 중</span>
              </span>
            ) : null}

            {s.phase === "queued" || s.phase === "uploading" ? (
              <span className="busy-veil-in pointer-events-none! absolute inset-x-1 bottom-0.5 h-1 overflow-hidden rounded-chip bg-scrim">
                <span
                  role="progressbar"
                  aria-label={`${n}번째 ${noun} 올리는 중`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct * 100)}
                  className="gauge-fill block bg-primary"
                  style={{ "--meter-fill": pct } as React.CSSProperties}
                />
              </span>
            ) : null}

            {s.phase === "error" || s.phase === "held" ? (
              /* 막(스크림) 자체는 클릭을 통과시킨다 — 양옆 ◀ ▶ 가 같은 높이에 있다. «다시 올리기»만 받는다 */
              <span
                className="pointer-events-none absolute inset-x-1 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 text-center"
                title={s.phase === "error" ? s.message : undefined}
              >
                <span className="rounded-chip bg-scrim p-1 text-on-scrim">
                  <AlertTriangle className="size-3.5" aria-hidden />
                </span>
                {s.phase === "error" && s.retryable ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onRetry(t.key)}
                    className="pointer-events-auto relative inline-flex items-center gap-0.5 rounded-chip bg-scrim px-1.5 text-[11px] font-semibold leading-5 text-on-scrim after:absolute after:-inset-2 after:content-[''] hover:opacity-80 disabled:opacity-50"
                  >
                    <RotateCcw className="size-2.5" aria-hidden />
                    다시 올리기
                  </button>
                ) : null}
              </span>
            ) : null}
            {many ? (
              <span className="tnum pointer-events-none absolute left-1 top-1 rounded-chip bg-scrim px-1.5 text-[11px] font-semibold leading-5 text-on-scrim">
                {n}
              </span>
            ) : null}

            {s.phase !== "preparing" ? (
              <span className="pointer-events-none absolute bottom-1.5 left-1 inline-flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-chip bg-scrim px-1.5 text-[11px] font-semibold leading-5 text-on-scrim">
                {video ? (
                  <>
                    <Play className="size-2.5 shrink-0 fill-current" aria-hidden />
                    <span className="tnum truncate">{clock || "영상"}</span>
                    {size ? <span className="tnum hidden truncate font-normal @[7rem]:inline">· {size}</span> : null}
                  </>
                ) : (
                  "사진"
                )}
              </span>
            ) : null}

            <button
              type="button"
              aria-label={`${n}번째 항목 빼기`}
              disabled={locked}
              onClick={() => onRemove(t.key)}
              className="absolute right-1 top-1 rounded-card bg-scrim p-1 text-on-scrim after:absolute after:-inset-2 after:content-[''] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="size-3" aria-hidden />
            </button>

            {many ? (
              <>
                {i > 0 ? (
                  <button
                    type="button"
                    aria-label={`${n}번째 항목 앞으로 옮기기`}
                    disabled={locked}
                    onClick={() => onMove(t.key, -1)}
                    className="trans-state absolute left-1 top-1/2 -translate-y-1/2 rounded-chip bg-scrim p-0.5 text-on-scrim opacity-0 after:absolute after:-inset-2.5 after:content-[''] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 disabled:hidden pointer-coarse:opacity-100"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                ) : null}
                {i < tiles.length - 1 ? (
                  <button
                    type="button"
                    aria-label={`${n}번째 항목 뒤로 옮기기`}
                    disabled={locked}
                    onClick={() => onMove(t.key, 1)}
                    className="trans-state absolute right-1 top-1/2 -translate-y-1/2 rounded-chip bg-scrim p-0.5 text-on-scrim opacity-0 after:absolute after:-inset-2.5 after:content-[''] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 disabled:hidden pointer-coarse:opacity-100"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                ) : null}
              </>
            ) : null}

          </li>
        );
      })}
      {tiles.length < max ? (
        <li className="min-w-0">
          <button
            type="button"
            disabled={locked}
            onClick={onPick}
            className="trans-state flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line text-fg-sub hover:border-primary hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="size-5" aria-hidden />
            <span className="text-[11px]">추가</span>
          </button>
        </li>
      ) : null}
    </ul>
  );
}
