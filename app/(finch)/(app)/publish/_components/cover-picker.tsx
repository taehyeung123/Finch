"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { defaultCoverOffsetMs, drawVideoFrame, seekVideo } from "@/lib/publish/video-inspect";
import { formatClock } from "./media-tiles";
import type { MediaTile } from "./use-media-tiles";

/*
  커버 고르기 — 인스타 영상 1개(릴스·스토리)의 첫 화면 장면을 고른다 (2026-09-11 영상 발행).

  고른 장면은 두 곳에 쓰인다: 인스타의 커버 위치(thumb_offset, ms)와 목록 썸네일(커버 JPEG — 이 모달이 그 장면을 떠서 올린다).
  모달 껍데기는 ModalShell 이다(새로 짜지 않는다 — CLAUDE.md). 작성 모달의 **형제**로 렌더한다(포커스 트랩·Esc 가 얽히지 않게).

  이 브라우저가 영상을 못 그리면(윈도 크롬의 HEVC 등) 장면 미리보기 대신 «몇 초»를 숫자로 받는다 — 인스타 커버 위치만 정해지고
  목록 썸네일은 필름 아이콘 그대로다. 미리보기(<video src="blob:…">)는 proxy.ts CSP media-src 가 앱 화면에만 연다.
*/
export function CoverPicker({
  tile,
  story,
  onClose,
  onPick,
  onPickOffset,
}: {
  tile: MediaTile;
  /** 스토리 영상 — 인스타에 커버가 따로 없다(목록 썸네일로만 쓴다) */
  story: boolean;
  onClose: () => void;
  /** 뜬 장면을 올리고 커버로 — 확인까지 끝나야 ok */
  onPick: (blob: Blob, offsetMs: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** 못 그리는 영상 — 위치만 */
  onPickOffset: (offsetMs: number) => void;
}) {
  const duration = tile.durationMs ?? 0;
  /* 메타는 커버 위치가 길이 **미만**이어야 받는다 — 끝 프레임 한 칸 앞까지 */
  const maxMs = Math.max(0, duration - 100);
  const [pos, setPos] = useState(() => Math.min(maxMs, tile.thumbOffsetMs ?? defaultCoverOffsetMs(tile.durationMs)));
  const [canDraw, setCanDraw] = useState(tile.inspect?.decodable !== false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(() => String(Math.round(pos / 100) / 10));
  const videoRef = useRef<HTMLVideoElement>(null);

  /* 원본 파일의 object URL — 모달이 열려 있는 동안만 <video> 에 직접 꽂는다(렌더에서 만들면 렌더마다 URL 이 샌다). 닫히면 놓는다 */
  useEffect(() => {
    const v = videoRef.current;
    if (!canDraw || !v) return;
    const url = URL.createObjectURL(tile.file);
    v.src = url;
    return () => {
      v.removeAttribute("src");
      try {
        v.load();
      } catch {
        /* 이미 떼어졌다 */
      }
      URL.revokeObjectURL(url);
    };
  }, [tile.file, canDraw]);

  /* 막대를 움직이면 그 장면으로 — 연속 입력은 마지막 값만(찾아가는 중엔 기다렸다가 한 번 더) */
  const seekingRef = useRef(false);
  const wantRef = useRef<number | null>(null);
  async function seekTo(ms: number) {
    const v = videoRef.current;
    if (!v) return;
    wantRef.current = ms;
    if (seekingRef.current) return;
    seekingRef.current = true;
    try {
      while (wantRef.current !== null) {
        const target = wantRef.current;
        wantRef.current = null;
        await seekVideo(v, target);
      }
    } finally {
      seekingRef.current = false;
    }
  }

  async function pick() {
    const v = videoRef.current;
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    try {
      /* 막대를 놓자마자 누르면 아직 찾아가는 중일 수 있다 — 그 장면에 도착한 뒤 뜬다 */
      await seekVideo(v, pos);
      const shot = await drawVideoFrame(v);
      if (!shot) {
        setError("이 장면을 가져오지 못했어요 — 조금 옆 장면으로 다시 골라 주세요.");
        return;
      }
      const r = await onPick(shot.blob, pos);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function pickSeconds() {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) {
      setError("0 이상의 숫자로 적어 주세요.");
      return;
    }
    const ms = Math.round(n * 1000);
    if (duration > 0 && ms >= duration) {
      setError(`영상 길이(${formatClock(duration)})보다 앞 시점으로 적어 주세요.`);
      return;
    }
    onPickOffset(ms);
    onClose();
  }

  return (
    <ModalShell
      label="커버 고르기"
      title="커버 고르기"
      description={story ? "발행 목록에 보일 썸네일이에요." : "릴스 탭과 프로필에 보일 첫 화면이에요."}
      size="md"
      busy={busy}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            취소
          </Button>
          {canDraw ? (
            <Button size="sm" onClick={() => void pick()} disabled={busy || !ready}>
              {busy ? "올리는 중…" : "이 장면으로"}
            </Button>
          ) : (
            <Button size="sm" onClick={pickSeconds}>
              이 시점으로
            </Button>
          )}
        </div>
      }
    >
      {canDraw ? (
        <div className="space-y-3">
          <div className="flex justify-center overflow-hidden rounded-card border border-line bg-plate">
            <video
              ref={videoRef}
              muted
              playsInline
              preload="auto"
              className="max-h-[50dvh] w-auto max-w-full"
              onLoadedMetadata={(e) => {
                void seekVideo(e.currentTarget, pos).then((ok) => setReady(ok));
              }}
              onError={() => {
                /* 목록 검사에선 됐는데 여기선 못 연다 — 숫자로 받는 쪽으로 */
                setCanDraw(false);
              }}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-[12px] text-fg-sub">
              <label htmlFor="cover-pos">장면 위치</label>
              <span className="tnum">
                {formatClock(pos)} / {formatClock(duration)}
              </span>
            </div>
            <input
              id="cover-pos"
              type="range"
              min={0}
              max={maxMs}
              step={100}
              value={pos}
              aria-label="장면 위치"
              disabled={busy || maxMs <= 0}
              onChange={(e) => {
                const ms = Number(e.target.value);
                setPos(ms);
                void seekTo(ms);
              }}
              className="mt-2 h-9 w-full accent-[var(--color-primary)]"
            />
          </div>
          {error ? (
            <p role="alert" className="text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[14px] leading-relaxed text-fg-sub">
            이 브라우저에서는 영상 미리보기가 안 돼요 — 커버로 쓸 시점(초)을 숫자로 적어 주세요.
          </p>
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={duration > 0 ? Math.floor(duration / 100) / 10 : undefined}
              step={0.1}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              aria-label="커버로 쓸 시점(초)"
              className="tnum h-10 w-28 rounded-card border border-line bg-body px-3 text-[15px] text-fg focus:border-primary focus:outline-none"
            />
            <span className="text-fg-sub">초{duration > 0 ? ` (길이 ${formatClock(duration)})` : ""}</span>
          </label>
          {error ? (
            <p role="alert" className="text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </ModalShell>
  );
}
