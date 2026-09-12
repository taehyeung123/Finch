/**
 * 브라우저 영상 검사 — 고르는 즉시(올리기 전에) 길이·크기·코덱·프레임 수·소리를 읽고, 커버로 쓸 장면을 JPEG 로 뜬다 (2026-09-11 영상 발행).
 *
 * 두 갈래를 나란히 돌려 합친다:
 *  · <video> — 이 브라우저가 그릴 수 있나(커버 고르기 가능 여부)·길이·표시 크기(회전 반영).
 *  · 상자 파서(mp4-inspect-core) — 코덱·프레임 수·소리 형식. <video> 가 못 여는 HEVC(윈도 크롬 등)도 여기선 읽힌다.
 * 형식 판별(첫 바이트)은 서버 확인 단계와 같은 sniffContainer 를 쓴다 — 이름만 .mp4 인 WebM 을 300MB 다 올린 뒤 거절하지 않게.
 *
 * 브라우저 전용(document·URL.createObjectURL). 서버에서 부르지 않는다.
 */
import { inspectMp4 } from "./mp4-inspect-core";
import { sniffContainer } from "./sniff";

export interface VideoInspection {
  /** 확장자 기준(서버와 같은 판정) */
  container: "mp4" | "mov";
  durationMs: number | null;
  /** 표시 기준(회전 반영) */
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: number | null;
  audioSampleRate: number | null;
  /** 기록만(차단하지 않는다 — 메타가 거절하는지는 실측 전) */
  faststart: boolean | null;
  hasEditList: boolean | null;
  /** 이 브라우저가 그릴 수 있나 — 커버 고르기(장면 미리보기) 가능 여부 */
  decodable: boolean;
}

export type InspectResult =
  | { ok: true; info: VideoInspection }
  /** not_video = MP4·MOV 가 아니다 / no_video = 소리만 있다 / unreadable = 길이·크기를 끝내 모른다 */
  | { ok: false; reason: "not_video" | "no_video" | "unreadable" };

const METADATA_TIMEOUT_MS = 8_000;
const SEEK_TIMEOUT_MS = 5_000;

interface ElementProbe {
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

function once(el: HTMLMediaElement, ok: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener("error", onErr);
      resolve(v);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    el.addEventListener(ok, onOk);
    el.addEventListener("error", onErr);
  });
}

function makeVideo(url: string, preload: "metadata" | "auto"): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = preload;
  v.src = url;
  v.load();
  return v;
}

function release(v: HTMLVideoElement, url: string) {
  v.removeAttribute("src");
  try {
    v.load();
  } catch {
    /* 이미 떼어졌다 */
  }
  URL.revokeObjectURL(url);
}

async function probeElement(file: File): Promise<ElementProbe | null> {
  const url = URL.createObjectURL(file);
  const v = makeVideo(url, "metadata");
  try {
    if (!(await once(v, "loadedmetadata", METADATA_TIMEOUT_MS))) return null;
    const d = Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration * 1000) : null;
    return { durationMs: d, width: v.videoWidth || null, height: v.videoHeight || null };
  } finally {
    release(v, url);
  }
}

/**
 * 영상 파일 검사. 예외를 던지지 않는다.
 * container 는 호출측이 확장자(없으면 MIME)로 정한 값 — 서버 발급(createPublishUploads)과 같은 판정이어야 한다.
 */
export async function inspectVideoFile(file: File, container: "mp4" | "mov"): Promise<InspectResult> {
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (sniffContainer(head) !== "iso-bmff") return { ok: false, reason: "not_video" };

  const [el, parsed] = await Promise.all([
    probeElement(file).catch(() => null),
    inspectMp4({ size: file.size, read: (o, l) => file.slice(o, o + l).arrayBuffer() }).catch(() => null),
  ]);
  const pv = parsed?.video ?? null;
  /* 파서가 moov 를 읽었는데 영상 트랙이 없고, 브라우저도 화면 크기를 못 줬다 → 소리만 있는 파일 */
  if (parsed && !pv && !(el?.width && el.height)) return { ok: false, reason: "no_video" };

  const durationMs = el?.durationMs ?? parsed?.durationMs ?? null;
  const width = el?.width ?? pv?.displayWidth ?? null;
  const height = el?.height ?? pv?.displayHeight ?? null;
  if (durationMs === null && width === null) return { ok: false, reason: "unreadable" };
  return {
    ok: true,
    info: {
      container,
      durationMs,
      width,
      height,
      fps: pv?.fps ?? null,
      videoCodec: pv?.codec ?? null,
      audioCodec: parsed?.audio?.codec ?? null,
      audioChannels: parsed?.audio?.channels ?? null,
      audioSampleRate: parsed?.audio?.sampleRate ?? null,
      faststart: parsed?.faststart ?? null,
      hasEditList: pv?.hasEditList ?? null,
      decodable: !!(el && el.width && el.height),
    },
  };
}

/** 커버 장면 기본값 — 1초, 짧은 영상은 가운데. 서버(엔진)의 기본 thumb_offset 과 같은 식이다 */
export function defaultCoverOffsetMs(durationMs: number | null): number {
  if (!durationMs || durationMs <= 0) return 0;
  return Math.round(Math.min(1000, durationMs / 2));
}

/**
 * 지금 화면에 멈춰 있는 장면을 JPEG 로(긴 변 maxLongSide 이하). 못 그리면 null.
 * 커버 고르기 모달이 보여 주고 있는 <video> 를 그대로 쓴다 — 새로 열어 다시 찾아가지 않는다.
 */
export async function drawVideoFrame(v: HTMLVideoElement, maxLongSide = 1080): Promise<{ blob: Blob; width: number; height: number } | null> {
  const w = v.videoWidth;
  const h = v.videoHeight;
  if (!w || !h || v.readyState < 2) return null;
  const scale = Math.min(1, maxLongSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  /* 캔버스 한도를 넘으면(iOS) 예외 없이 null·빈 Blob 이 온다 — 빈 커버를 올리느니 없는 게 낫다 */
  if (!blob || blob.size === 0 || blob.type !== "image/jpeg") return null;
  return { blob, width: canvas.width, height: canvas.height };
}

/** 영상이 원하는 시각으로 가서 그 장면이 준비될 때까지 */
export async function seekVideo(v: HTMLVideoElement, atMs: number): Promise<boolean> {
  const target = Math.max(0, atMs / 1000);
  if (Math.abs(v.currentTime - target) < 0.001 && v.readyState >= 2 && !v.seeking) return true;
  const seeked = once(v, "seeked", SEEK_TIMEOUT_MS);
  v.currentTime = target;
  if (!(await seeked)) return false;
  if (v.readyState >= 2) return true;
  /* iOS 사파리는 재생을 한 번 거쳐야 장면을 디코드하는 경우가 있다 — 소리 없이 잠깐 틀었다 멈춘다 */
  try {
    await v.play();
    v.pause();
    const again = once(v, "seeked", SEEK_TIMEOUT_MS);
    v.currentTime = target;
    await again;
  } catch {
    /* 재생이 막혔다 — 그릴 수 없으면 아래 판정이 null 로 닫는다 */
  }
  return v.readyState >= 2;
}

/**
 * 파일의 atMs 장면을 JPEG 로 — 고른 직후 타일 미리보기·목록 썸네일(커버)용. 이 브라우저가 못 그리면 null.
 */
export async function captureFrameJpeg(
  file: File,
  atMs: number,
  maxLongSide = 1080,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  const v = makeVideo(url, "auto");
  try {
    /* loadeddata 가 아니라 loadedmetadata — iOS 사파리는 preload 를 무시하고 장면 데이터를 미리 받지 않는다(8초를 헛기다린다).
       찾아가기(seek)가 그 장면의 데이터를 불러온다. */
    if (!(await once(v, "loadedmetadata", METADATA_TIMEOUT_MS))) return null;
    if (!(await seekVideo(v, atMs))) return null;
    return await drawVideoFrame(v, maxLongSide);
  } catch {
    return null;
  } finally {
    release(v, url);
  }
}
