import { useEffect, useRef, useState } from "react";
import { nextPaint } from "@/lib/next-paint";
import { eunNeun } from "@/lib/josa";
import { bakeJpeg } from "@/lib/publish/image-bake";
import { uploadToTicket } from "@/lib/publish/upload-client";
import { captureFrameJpeg, defaultCoverOffsetMs, inspectVideoFile, type VideoInspection } from "@/lib/publish/video-inspect";
import type { PublishUploadRequest, PublishUploadTicket } from "@/lib/publish/upload-types";
import {
  channelLabel,
  channelRules,
  mediaRules,
  resolveIgSurface,
  validateMediaSet,
  type IgSurface,
  type ImageLimits,
  type MediaItemFacts,
  type MediaKind,
} from "@/lib/publish-rules";
import { createPublishUploads, discardPublishUploads, finalizePublishUploads, type PostMediaInput } from "../actions";

/*
  발행 작성기의 사진·영상 타일 — 고르기 → 굽기·검사 → 올리기(직접) → 확인까지의 상태 기계 (2026-09-11 영상 발행).

  한 타일 = 게시물 항목 하나(사진 또는 영상). 영상 타일은 목록 썸네일로 쓸 커버 JPEG 를 따로 하나 더 올린다.
    preparing → (held) → queued → uploading → ready        실패하면 error(다시 올리기 가능 여부를 함께)
  · preparing: 사진은 채널 규칙대로 굽고(가운데 자르기·줄이기·JPEG), 영상은 코덱·길이·해상도를 읽고 커버 장면을 뜬다.
  · held: 지금 채널·방식으로는 못 올리는 영상(길이·해상도·코덱…) — **올리지 않는다.** 300MB 를 다 올린 뒤에 거절하지 않게.
          규칙이 바뀌어(채널·스토리·항목 수) 통과하면 그때 자동으로 올린다.
  · 동시에 올리는 파일은 둘까지. 서버 액션(발급·확인)은 Next 가 클라이언트마다 차례로 돌린다(actions.ts 머리말).

  진실은 ref(core)에 있고 화면은 그 사본(state)을 그린다 — 비동기 흐름(굽기·올리기)이 «지금» 목록을 읽어야 해서다.
  렌더 클로저의 목록은 한 박자 늦다(옛 컴포저의 channelRef 와 같은 이유). setState 는 값으로만 넘긴다(갱신 함수를 두 번 부르는 개발 모드와 무관하게).

  세대(gen): 타일의 본체가 바뀌거나(다시 굽기) 올리기를 새로 시작하면 올린다. 늦게 끝난 옛 세대의 결과는 버리고, 그 세대가 받은 경로는 지운다.
  지우기(discardPublishUploads)는 서버가 «아직 글에 안 붙은 것»만 지운다 — 저장 뒤에 불려도 글의 파일은 안전하다.
*/

export type TileState =
  | { phase: "preparing" }
  /** 지금 규칙으로는 못 올리는 영상 — 올리지 않고 기다린다(이유는 검사 문구가 말한다) */
  | { phase: "held" }
  /** 올릴 차례를 기다린다 */
  | { phase: "queued" }
  | { phase: "uploading"; loaded: number; total: number }
  | { phase: "ready"; path: string }
  | { phase: "error"; message: string; retryable: boolean };

/** 사진을 어떤 규칙으로 구웠나 — 인스타 피드(4:5~1.91:1 로 자름) / 나머지(자르지 않음) */
export type ImageProfile = "ig-feed" | "open";

export interface MediaTile {
  key: string;
  kind: MediaKind;
  /** 원본 — 규칙이 바뀌면 사진을 여기서 다시 굽는다(구운 JPEG 를 또 굽지 않는다) */
  file: File;
  /** 영상 — 확장자(없으면 형식)로 정한 컨테이너. 서버 발급과 같은 판정 */
  container: "mp4" | "mov" | null;
  /** object URL — 사진은 구운 JPEG, 영상은 커버 JPEG. 교체·제거·언마운트 때 revoke */
  previewUrl: string | null;
  /** 표시 기준(영상은 회전 반영, 사진은 구운 크기) */
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** 올릴 바이트 수(사진=구운 JPEG, 영상=원본) */
  bytes: number | null;
  inspect: VideoInspection | null;
  bakedFor: ImageProfile | null;
  /** 비율 때문에 실제로 잘랐나 — 안내 문구의 장수 */
  cropped: boolean;
  /** 영상 — 인스타 커버 장면(ms). null = 서버 기본(1초, 짧으면 가운데) */
  thumbOffsetMs: number | null;
  /** 영상 — 목록 썸네일용 커버 JPEG. 실패해도 저장은 막지 않는다(목록에 필름 아이콘) */
  cover: { path: string | null; state: "uploading" | "ready" | "failed" } | null;
  state: TileState;
}

export interface MediaTarget {
  channel: string;
  /** 인스타 «스토리로 올리기» — 항목이 정확히 1개일 때만 효과가 있다(resolveIgSurface) */
  story: boolean;
}

/** 파일을 타일 종류로 — 확장자가 먼저, 확장자가 아예 없을 때만 형식(MIME)을 본다 */
export function classifyFile(f: File): { kind: MediaKind; container: "mp4" | "mov" | null } | null {
  const name = f.name ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext === "mp4") return { kind: "video", container: "mp4" };
  if (ext === "mov") return { kind: "video", container: "mov" };
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp") return { kind: "image", container: null };
  if (dot < 0) {
    if (f.type === "video/mp4") return { kind: "video", container: "mp4" };
    if (f.type === "video/quicktime") return { kind: "video", container: "mov" };
    if (f.type === "image/jpeg" || f.type === "image/png" || f.type === "image/webp") return { kind: "image", container: null };
  }
  return null;
}

export const PICK_ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.mp4,.mov";

/** 인스타 게시 면 — 스레드는 null */
export function surfaceOf(target: MediaTarget, tiles: ReadonlyArray<Pick<MediaTile, "kind">>): IgSurface | null {
  return target.channel === "instagram"
    ? resolveIgSurface({ count: tiles.length, firstKind: tiles[0]?.kind ?? null, story: target.story })
    : null;
}

export function imageProfileOf(target: MediaTarget, surface: IgSurface | null): ImageProfile {
  return target.channel === "instagram" && surface === "feed" ? "ig-feed" : "open";
}

function limitsOf(profile: ImageProfile): ImageLimits {
  return profile === "ig-feed" ? mediaRules("instagram", "feed").image : mediaRules("threads", null).image;
}

/** 검사에 넣을 사실 — 모르는 값은 null(막지 않는다) */
export function tileFacts(t: MediaTile): MediaItemFacts {
  const i = t.inspect;
  return {
    kind: t.kind,
    bytes: t.bytes,
    width: t.width,
    height: t.height,
    durationMs: t.durationMs,
    fps: i?.fps ?? null,
    videoCodec: i?.videoCodec ?? null,
    audioCodec: i?.audioCodec ?? null,
    audioChannels: i?.audioChannels ?? null,
    audioSampleRate: i?.audioSampleRate ?? null,
  };
}

/** 저장(createPost)에 넘길 항목 — ready 타일만 부른다 */
export function toPostMedia(t: MediaTile): PostMediaInput {
  const i = t.inspect;
  return {
    path: t.state.phase === "ready" ? t.state.path : "",
    coverPath: t.kind === "video" && t.cover?.state === "ready" ? t.cover.path : null,
    thumbOffsetMs: t.kind === "video" ? t.thumbOffsetMs : null,
    durationMs: t.durationMs,
    width: t.width,
    height: t.height,
    fps: i?.fps ?? null,
    videoCodec: i?.videoCodec ?? null,
    audioCodec: i?.audioCodec ?? null,
    audioChannels: i?.audioChannels ?? null,
    audioSampleRate: i?.audioSampleRate ?? null,
  };
}

/** 타일이 아직 손이 가는 중인가(저장을 막는다) */
export function tileBusy(t: MediaTile): boolean {
  return t.state.phase === "preparing" || t.state.phase === "queued" || t.state.phase === "uploading" || t.cover?.state === "uploading";
}

/** 지금 규칙에서 **항목 하나의 문제**로 막힌 번호들 — 개수 문제(index null)는 올리기를 막지 않는다 */
function blockedIndexes(target: MediaTarget, tiles: MediaTile[]): Set<number> {
  const issues = validateMediaSet(target.channel, surfaceOf(target, tiles), tiles.map(tileFacts));
  return new Set(issues.flatMap((i) => (i.severity === "error" && i.index !== null ? [i.index] : [])));
}

const MAX_PARALLEL_UPLOADS = 2;
const PROGRESS_EVERY_MS = 120;
/** 비율 비교 여유 — 구운 크기는 반올림돼 4:5 가 0.7998 이 되기도 한다 */
const RATIO_EPS = 0.01;

const TEXT = {
  bakeFailed: "사진을 읽지 못했어요 — 다른 파일로 시도해 주세요.",
  notVideo: "MP4·MOV 영상이 아니에요 — 휴대폰 기본 카메라나 편집 앱에서 내보낸 영상을 골라 주세요.",
  noVideo: "소리만 있는 파일이에요 — 영상 파일을 골라 주세요.",
  unreadable: "영상 정보를 읽지 못했어요 — 다른 파일로 시도해 주세요.",
  network: "올리지 못했어요 — 연결을 확인하고 다시 올려 주세요.",
  confirmFailed: "확인하지 못했어요 — 잠시 후 다시 시도해 주세요.",
  badType: "MP4·MOV 영상이나 JPG·PNG·WEBP 사진만 올릴 수 있어요.",
} as const;

interface Job {
  /** 본체 세대 — 다시 굽기·다시 올리기·제거 때 올린다 */
  gen: number;
  coverGen: number;
  /** 올릴 바이트 — 구운 JPEG 또는 원본 영상 */
  body: Blob | null;
  abort: (() => void) | null;
  coverAbort: (() => void) | null;
  /** 이 타일이 받은 본체 경로들 — 제거·닫기·다시 굽기 때 지운다 */
  main: Set<string>;
  covers: Set<string>;
  /** 올렸는데 확인만 실패한 경로 — «다시 올리기»가 바이트를 다시 보내지 않고 확인만 다시 한다 */
  unconfirmed: string | null;
  lastProgressAt: number;
}

interface Core {
  tiles: MediaTile[];
  jobs: Map<string, Job>;
  target: MediaTarget;
  alive: boolean;
  saved: boolean;
  prepQueue: string[];
  prepBusy: boolean;
  active: number;
  waiters: Array<() => void>;
  seq: number;
}

type TicketsResult = { ok: true; tickets: PublishUploadTicket[] } | { ok: false; error: string; retryable: boolean };
type ConfirmResult = { ok: true; bytes: number } | { ok: false; error: string; retryable: boolean };

export function useMediaTiles(opts: { isDemo: boolean; initialTarget: MediaTarget }) {
  const [tiles, setTiles] = useState<MediaTile[]>([]);
  const coreRef = useRef<Core>({
    tiles: [],
    jobs: new Map(),
    target: opts.initialTarget,
    alive: true,
    saved: false,
    prepQueue: [],
    prepBusy: false,
    active: 0,
    waiters: [],
    seq: 0,
  });
  const isDemo = opts.isDemo;

  /* 언마운트 — 올리던 것을 멈추고, 저장하지 않았으면 올린 파일을 지우고, 미리보기 URL 을 놓는다 */
  useEffect(() => {
    const core = coreRef.current;
    core.alive = true;
    return () => {
      core.alive = false;
      const paths: string[] = [];
      for (const job of core.jobs.values()) {
        job.gen++;
        job.coverGen++;
        job.abort?.();
        job.coverAbort?.();
        paths.push(...job.main, ...job.covers);
      }
      for (const t of core.tiles) if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
      if (!core.saved && !isDemo && paths.length > 0) void discardPublishUploads(paths).catch(() => {});
      core.jobs.clear();
      core.tiles = [];
      core.prepQueue = [];
    };
  }, [isDemo]);

  /* ── 목록 쓰기 — ref 가 진실, state 는 사본 ── */
  function commit(next: MediaTile[]) {
    const core = coreRef.current;
    core.tiles = next;
    if (core.alive) setTiles(next);
  }
  function find(key: string): MediaTile | undefined {
    return coreRef.current.tiles.find((t) => t.key === key);
  }
  function patch(key: string, fn: (t: MediaTile) => MediaTile) {
    const list = coreRef.current.tiles;
    const i = list.findIndex((t) => t.key === key);
    if (i < 0) return;
    const next = list.slice();
    next[i] = fn(list[i]);
    commit(next);
  }
  function setPreview(key: string, url: string | null, extra: Partial<MediaTile> = {}) {
    const old = find(key)?.previewUrl ?? null;
    patch(key, (t) => ({ ...t, ...extra, previewUrl: url }));
    if (old && old !== url) URL.revokeObjectURL(old);
  }
  function stale(key: string, gen: number): boolean {
    const core = coreRef.current;
    return !core.alive || core.jobs.get(key)?.gen !== gen || !find(key);
  }
  function discard(key: string | null, paths: string[]) {
    const list = paths.filter(Boolean);
    const job = key ? coreRef.current.jobs.get(key) : undefined;
    for (const p of list) {
      job?.main.delete(p);
      job?.covers.delete(p);
    }
    if (isDemo || list.length === 0) return;
    /* 기다리지 않는다 — 실패해도 정리 크론이 24시간 뒤 치운다 */
    void discardPublishUploads(list).catch(() => {});
  }
  function fail(key: string, message: string, retryable: boolean) {
    patch(key, (t) => ({ ...t, state: { phase: "error", message, retryable } }));
  }

  /* ── 규칙 ── */
  function currentSurface(): IgSurface | null {
    const core = coreRef.current;
    return surfaceOf(core.target, core.tiles);
  }
  function desiredProfile(): ImageProfile {
    return imageProfileOf(coreRef.current.target, currentSurface());
  }
  function heldNow(key: string): boolean {
    const core = coreRef.current;
    const i = core.tiles.findIndex((t) => t.key === key);
    return i >= 0 && core.tiles[i].kind === "video" && blockedIndexes(core.target, core.tiles).has(i);
  }

  /* ── 동시 올리기 자리 ── */
  function acquireSlot(): Promise<void> {
    const core = coreRef.current;
    if (core.active < MAX_PARALLEL_UPLOADS) {
      core.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) =>
      core.waiters.push(() => {
        core.active++;
        resolve();
      }),
    );
  }
  function releaseSlot() {
    const core = coreRef.current;
    core.active = Math.max(0, core.active - 1);
    core.waiters.shift()?.();
  }

  /* ── 서버 액션 감싸기 — 던지면(네트워크·배포 교체) «다시 올리기»로 닫는다 ── */
  async function requestTickets(files: PublishUploadRequest[]): Promise<TicketsResult> {
    try {
      return await createPublishUploads({ channel: coreRef.current.target.channel, files });
    } catch {
      return { ok: false, error: TEXT.network, retryable: true };
    }
  }
  async function confirmPath(path: string): Promise<ConfirmResult> {
    try {
      const r = await finalizePublishUploads([path]);
      if (!r.ok) return r;
      const x = r.results[0];
      if (!x) return { ok: false, error: TEXT.confirmFailed, retryable: true };
      return x.ok ? { ok: true, bytes: x.bytes } : { ok: false, error: x.error, retryable: x.retryable };
    } catch {
      return { ok: false, error: TEXT.confirmFailed, retryable: true };
    }
  }

  /* ── 준비(굽기·검사) — 한 번에 하나. 사진 굽기는 메인 스레드를 통째로 잡는다 ── */
  async function runPrep() {
    const core = coreRef.current;
    if (core.prepBusy) return;
    core.prepBusy = true;
    try {
      while (core.alive && core.prepQueue.length > 0) {
        const key = core.prepQueue.shift()!;
        const tile = find(key);
        const job = core.jobs.get(key);
        if (!tile || !job || tile.state.phase !== "preparing") continue;
        /* «준비 중» 표시가 먼저 칠해지게 한 프레임 양보 — 굽기가 시작되면 칠할 틈이 없다 */
        await nextPaint();
        if (!core.alive) return;
        if (tile.kind === "image") await prepImage(key, job.gen);
        else await prepVideo(key, job.gen);
      }
    } finally {
      core.prepBusy = false;
    }
  }

  async function prepImage(key: string, gen: number) {
    const tile = find(key);
    if (!tile) return;
    /* 채널은 굽는 **지금** 값을 읽는다. 굽는 사이 규칙이 바뀌었으면 원본으로 다시 굽는다 — 마지막 규칙과 맞을 때까지 */
    let profile = desiredProfile();
    let out: Awaited<ReturnType<typeof bakeJpeg>>;
    try {
      out = await bakeJpeg(tile.file, limitsOf(profile));
      while (!stale(key, gen) && profile !== desiredProfile()) {
        profile = desiredProfile();
        out = await bakeJpeg(tile.file, limitsOf(profile));
      }
    } catch {
      if (!stale(key, gen)) fail(key, TEXT.bakeFailed, false);
      return;
    }
    if (stale(key, gen)) return;
    const job = coreRef.current.jobs.get(key)!;
    job.body = out.blob;
    setPreview(key, URL.createObjectURL(out.blob), {
      width: out.width,
      height: out.height,
      bytes: out.blob.size,
      cropped: out.cropped,
      bakedFor: profile,
      state: { phase: "queued" },
    });
    startUpload(key);
  }

  async function prepVideo(key: string, gen: number) {
    const tile = find(key);
    if (!tile || !tile.container) return;
    const res = await inspectVideoFile(tile.file, tile.container);
    if (stale(key, gen)) return;
    if (!res.ok) {
      fail(key, res.reason === "not_video" ? TEXT.notVideo : res.reason === "no_video" ? TEXT.noVideo : TEXT.unreadable, false);
      return;
    }
    const info = res.info;
    const at = defaultCoverOffsetMs(info.durationMs);
    /* 이 브라우저가 그릴 수 없으면(윈도 크롬의 HEVC 등) 커버 없이 간다 — 목록엔 필름 아이콘, 인스타 커버는 서버 기본 장면 */
    const shot = info.decodable ? await captureFrameJpeg(tile.file, at) : null;
    if (stale(key, gen)) return;
    const job = coreRef.current.jobs.get(key)!;
    job.body = tile.file;
    setPreview(key, shot ? URL.createObjectURL(shot.blob) : null, {
      inspect: info,
      width: info.width,
      height: info.height,
      durationMs: info.durationMs,
      bytes: tile.file.size,
      thumbOffsetMs: shot ? at : null,
      cover: shot ? { path: null, state: "uploading" } : null,
      state: { phase: "queued" },
    });
    if (shot) void uploadCover(key, shot.blob);
    startUpload(key);
  }

  /* ── 올리기 ── */
  function startUpload(key: string) {
    const job = coreRef.current.jobs.get(key);
    if (!job || !job.body) return;
    if (heldNow(key)) {
      patch(key, (t) => ({ ...t, state: { phase: "held" } }));
      return;
    }
    if (isDemo) {
      /* 예시 화면 — 파일은 이 브라우저 안에만 있다(저장은 서버가 따로 막는다) */
      patch(key, (t) => ({ ...t, state: { phase: "ready", path: "" }, cover: t.cover ? { path: null, state: "ready" } : null }));
      return;
    }
    patch(key, (t) => ({ ...t, state: { phase: "queued" } }));
    void runUpload(key, job.gen);
  }

  async function runUpload(key: string, gen: number) {
    await acquireSlot();
    try {
      if (stale(key, gen)) return;
      /* 자리를 기다리는 사이 규칙이 바뀌었을 수 있다 — 올리기 직전에 한 번 더 본다 */
      if (heldNow(key)) {
        patch(key, (t) => ({ ...t, state: { phase: "held" } }));
        return;
      }
      const core = coreRef.current;
      const job = core.jobs.get(key)!;
      const tile = find(key)!;
      const body = job.body;
      if (!body) return;
      patch(key, (t) => ({ ...t, state: { phase: "uploading", loaded: 0, total: body.size } }));
      /* 서버에는 원래 파일 이름을 보내지 않는다(이름에 개인정보가 들어 있기도 하다) — 확장자만 필요하다 */
      const req: PublishUploadRequest =
        tile.kind === "video" ? { kind: "video", name: `upload.${tile.container ?? "mp4"}`, size: body.size } : { kind: "image", name: "photo.jpg", size: body.size };
      const issued = await requestTickets([req]);
      const ticket = issued.ok ? issued.tickets[0] : null;
      if (ticket?.ok) job.main.add(ticket.path);
      if (stale(key, gen)) {
        if (ticket?.ok) discard(key, [ticket.path]);
        return;
      }
      if (!issued.ok) return fail(key, issued.error, issued.retryable);
      if (!ticket || !ticket.ok) return fail(key, ticket?.error ?? TEXT.network, true);

      const ctrl = new AbortController();
      job.abort = () => ctrl.abort();
      const put = await uploadToTicket({
        ticket,
        body,
        signal: ctrl.signal,
        onProgress: (loaded, total) => {
          const now = Date.now();
          if (loaded < total && now - job.lastProgressAt < PROGRESS_EVERY_MS) return;
          job.lastProgressAt = now;
          if (!stale(key, gen)) patch(key, (t) => ({ ...t, state: { phase: "uploading", loaded, total } }));
        },
      });
      job.abort = null;
      if (stale(key, gen)) {
        discard(key, [ticket.path]);
        return;
      }
      if (!put.ok) {
        discard(key, [ticket.path]);
        if (!put.aborted) fail(key, put.error, put.retryable);
        return;
      }
      await confirmUpload(key, gen, ticket.path, body.size);
    } finally {
      releaseSlot();
    }
  }

  /** 올린 뒤 확인 — 크기·형식·첫 바이트를 서버가 본다. 틀린 파일은 서버가 이미 지웠다(retryable=false) */
  async function confirmUpload(key: string, gen: number, path: string, total: number) {
    patch(key, (t) => ({ ...t, state: { phase: "uploading", loaded: total, total } }));
    const fin = await confirmPath(path);
    const job = coreRef.current.jobs.get(key);
    if (stale(key, gen)) {
      discard(key, [path]);
      return;
    }
    if (!fin.ok) {
      if (fin.retryable && job) job.unconfirmed = path;
      else discard(key, [path]);
      fail(key, fin.error, fin.retryable);
      return;
    }
    patch(key, (t) => ({ ...t, bytes: t.kind === "video" ? fin.bytes : t.bytes, state: { phase: "ready", path } }));
  }

  /** 커버 JPEG 올리기 — 첫 커버·«커버 고르기» 둘 다. 새 커버가 확인된 뒤에 옛 커버를 지운다 */
  async function uploadCover(key: string, blob: Blob): Promise<{ ok: true } | { ok: false; error: string }> {
    const core = coreRef.current;
    const job = core.jobs.get(key);
    if (!job) return { ok: false, error: TEXT.network };
    const cgen = ++job.coverGen;
    job.coverAbort?.();
    job.coverAbort = null;
    const prevPath = find(key)?.cover?.state === "ready" ? (find(key)?.cover?.path ?? null) : null;
    if (isDemo) {
      patch(key, (t) => ({ ...t, cover: { path: null, state: "ready" } }));
      return { ok: true };
    }
    const lost = () => !core.alive || core.jobs.get(key)?.coverGen !== cgen || !find(key);
    const restore = (error: string) => {
      if (!lost()) patch(key, (t) => ({ ...t, cover: { path: prevPath, state: prevPath ? "ready" : "failed" } }));
      return { ok: false as const, error };
    };
    patch(key, (t) => ({ ...t, cover: { path: prevPath, state: "uploading" } }));

    const issued = await requestTickets([{ kind: "cover", name: "cover.jpg", size: blob.size }]);
    const ticket = issued.ok ? issued.tickets[0] : null;
    if (ticket?.ok) job.covers.add(ticket.path);
    if (lost()) {
      if (ticket?.ok) discard(key, [ticket.path]);
      return { ok: false, error: TEXT.network };
    }
    if (!issued.ok) return restore(issued.error);
    if (!ticket || !ticket.ok) return restore(ticket?.error ?? TEXT.network);

    const ctrl = new AbortController();
    job.coverAbort = () => ctrl.abort();
    const put = await uploadToTicket({ ticket, body: blob, signal: ctrl.signal });
    if (core.jobs.get(key)?.coverGen === cgen) job.coverAbort = null;
    if (lost() || !put.ok) {
      discard(key, [ticket.path]);
      return lost() ? { ok: false, error: TEXT.network } : restore(put.ok ? TEXT.network : put.error);
    }
    const fin = await confirmPath(ticket.path);
    if (lost() || !fin.ok) {
      discard(key, [ticket.path]);
      return lost() ? { ok: false, error: TEXT.network } : restore(fin.ok ? TEXT.network : fin.error);
    }
    patch(key, (t) => ({ ...t, cover: { path: ticket.path, state: "ready" } }));
    if (prevPath && prevPath !== ticket.path) discard(key, [prevPath]);
    return { ok: true };
  }

  /* ── 규칙이 바뀌었을 때(채널·스토리·항목 수) — 사진 다시 굽기, 기다리던 영상 올리기 ── */
  function resync() {
    const core = coreRef.current;
    if (!core.alive) return;
    const want = desiredProfile();
    let queued = false;
    for (const t of core.tiles) {
      if (t.kind !== "image" || t.bakedFor === null || t.bakedFor === want) continue;
      /* 규칙이 바뀌어도 **결과가 같은 사진은 다시 굽지 않는다**(다시 올리면 하루 올리기 횟수만 먹는다):
         · 자르지 않는 쪽으로 → 실제로 잘렸던 사진만 원본 비율로 다시
         · 인스타 피드로 → 지금 비율이 4:5~1.91:1 밖인 사진만 */
      const lim = limitsOf(want);
      const ratio = t.width && t.height ? t.width / t.height : null;
      const needs = want === "open" ? t.cropped : ratio === null || ratio < lim.minRatio - RATIO_EPS || ratio > lim.maxRatio + RATIO_EPS;
      if (!needs) {
        patch(t.key, (x) => ({ ...x, bakedFor: want }));
        continue;
      }
      const job = core.jobs.get(t.key);
      if (!job) continue;
      job.gen++;
      job.abort?.();
      job.abort = null;
      job.body = null;
      job.unconfirmed = null;
      discard(t.key, [...job.main]);
      /* 옛 미리보기는 새 것이 올 때까지 둔다(번쩍이지 않게) */
      patch(t.key, (x) => ({ ...x, bakedFor: null, cropped: false, state: { phase: "preparing" } }));
      core.prepQueue.push(t.key);
      queued = true;
    }
    if (queued) void runPrep();
    const blocked = blockedIndexes(core.target, core.tiles);
    core.tiles.forEach((t, i) => {
      if (t.state.phase === "held" && !blocked.has(i)) startUpload(t.key);
    });
  }

  /* ══════════════ 밖에서 부르는 조작 — 전부 이벤트 핸들러에서만 ══════════════ */

  /** 고른 파일 추가. 돌려주는 문구는 작성기 오류 줄에 보인다(형식·개수) — null 이면 문제없음 */
  function add(files: File[]): string | null {
    const core = coreRef.current;
    const target = core.target;
    const cap = channelRules(target.channel).maxMedia;
    const room = Math.max(0, cap - core.tiles.length);
    const picked: Array<{ file: File; kind: MediaKind; container: "mp4" | "mov" | null }> = [];
    let badType = false;
    for (const f of files) {
      const c = classifyFile(f);
      if (c) picked.push({ file: f, ...c });
      else badType = true;
    }
    const take = picked.slice(0, room);
    let message: string | null = badType ? TEXT.badType : null;
    if (picked.length > take.length) message = `${eunNeun(channelLabel(target.channel))} 사진·영상을 ${cap}개까지 올릴 수 있어요.`;
    if (take.length === 0) return message;
    const fresh: MediaTile[] = take.map((p) => {
      const key = `m${++core.seq}`;
      core.jobs.set(key, {
        gen: 0,
        coverGen: 0,
        body: null,
        abort: null,
        coverAbort: null,
        main: new Set(),
        covers: new Set(),
        unconfirmed: null,
        lastProgressAt: 0,
      });
      return {
        key,
        kind: p.kind,
        file: p.file,
        container: p.container,
        previewUrl: null,
        width: null,
        height: null,
        durationMs: null,
        /* 영상 크기는 고르는 즉시 안다 — 크기 상한 검사가 굽기·검사를 기다리지 않게 */
        bytes: p.kind === "video" ? p.file.size : null,
        inspect: null,
        bakedFor: null,
        cropped: false,
        thumbOffsetMs: null,
        cover: null,
        state: { phase: "preparing" },
      };
    });
    commit([...core.tiles, ...fresh]);
    core.prepQueue.push(...fresh.map((t) => t.key));
    void runPrep();
    resync();
    return message;
  }

  function remove(key: string) {
    const core = coreRef.current;
    const tile = find(key);
    if (!tile) return;
    const job = core.jobs.get(key);
    if (job) {
      job.gen++;
      job.coverGen++;
      job.abort?.();
      job.coverAbort?.();
      discard(key, [...job.main, ...job.covers]);
      core.jobs.delete(key);
    }
    core.prepQueue = core.prepQueue.filter((k) => k !== key);
    commit(core.tiles.filter((t) => t.key !== key));
    if (tile.previewUrl) URL.revokeObjectURL(tile.previewUrl);
    resync();
  }

  function moveTo(key: string, index: number) {
    const list = coreRef.current.tiles;
    const from = list.findIndex((t) => t.key === key);
    const to = Math.max(0, Math.min(list.length - 1, index));
    if (from < 0 || from === to) return;
    const next = list.slice();
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    commit(next);
    resync();
  }

  function move(key: string, delta: -1 | 1) {
    const i = coreRef.current.tiles.findIndex((t) => t.key === key);
    if (i >= 0) moveTo(key, i + delta);
  }

  function retry(key: string) {
    const core = coreRef.current;
    const tile = find(key);
    const job = core.jobs.get(key);
    if (!tile || !job || tile.state.phase !== "error" || !tile.state.retryable) return;
    const gen = ++job.gen;
    if (job.unconfirmed) {
      /* 바이트는 이미 올라갔다 — 확인만 다시 */
      const path = job.unconfirmed;
      job.unconfirmed = null;
      const total = job.body?.size ?? tile.bytes ?? 0;
      void confirmUpload(key, gen, path, total);
      return;
    }
    if (!job.body) return;
    /* 다시 올리기는 새 자리(표)를 받는다 — 옛 표는 만료됐거나 반쯤 올라갔다 */
    discard(key, [...job.main]);
    startUpload(key);
  }

  /** 커버 고르기 모달의 «이 장면으로» — 새 커버가 확인된 뒤에만 미리보기·장면 위치를 바꾼다 */
  async function replaceCover(key: string, blob: Blob, offsetMs: number): Promise<{ ok: true } | { ok: false; error: string }> {
    const r = await uploadCover(key, blob);
    if (!r.ok) return r;
    if (!find(key)) return { ok: false, error: TEXT.network };
    setPreview(key, URL.createObjectURL(blob), { thumbOffsetMs: Math.max(0, Math.round(offsetMs)) });
    return { ok: true };
  }

  /** 그릴 수 없는 영상 — 커버 장면을 숫자로만 정한다(목록 썸네일은 필름 아이콘 그대로) */
  function setThumbOffset(key: string, offsetMs: number) {
    patch(key, (t) => ({ ...t, thumbOffsetMs: Math.max(0, Math.round(offsetMs)) }));
  }

  /** 채널·스토리 스위치가 바뀌었다 — 작성기가 자기 상태를 바꾸는 핸들러에서 같이 부른다 */
  function retarget(target: MediaTarget) {
    coreRef.current.target = target;
    resync();
  }

  /** 작성 취소(확인 뒤) — 올리던 것을 멈추고 올린 파일을 모두 지운다 */
  function discardAll() {
    const core = coreRef.current;
    const paths: string[] = [];
    for (const job of core.jobs.values()) {
      job.gen++;
      job.coverGen++;
      job.abort?.();
      job.coverAbort?.();
      paths.push(...job.main, ...job.covers);
    }
    core.jobs.clear();
    core.prepQueue = [];
    for (const t of core.tiles) if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
    commit([]);
    if (!isDemo && paths.length > 0) void discardPublishUploads(paths).catch(() => {});
  }

  /** 저장이 끝났다 — 이제 파일은 글의 것이다(언마운트가 지우지 않는다) */
  function markSaved() {
    coreRef.current.saved = true;
  }

  /** 지금 항목 수 — 핸들러에서 add·remove 직후에 읽는다(렌더의 tiles 는 한 박자 늦다) */
  function countNow(): number {
    return coreRef.current.tiles.length;
  }

  return { tiles, add, remove, move, moveTo, retry, replaceCover, setThumbOffset, retarget, discardAll, markSaved, countNow };
}
