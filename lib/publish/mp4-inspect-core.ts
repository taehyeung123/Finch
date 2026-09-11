/**
 * MP4·MOV(ISO BMFF) 머리 읽기 — 영상 코덱·길이·해상도·회전·프레임 수·소리 형식 (2026-09-11 영상 발행).
 *
 * 왜 직접 읽나: 메타는 H.264/HEVC + AAC, 60fps 이하, 가로 1920px 이하만 받는다. 브라우저 <video> 는 길이·크기만 알려 주고
 * 코덱·프레임 수·소리 형식은 모른다 — 모르고 올리면 300MB 를 다 올린 뒤(또는 예약 시각에) 메타가 거절한다.
 * 파일 전체가 아니라 상자 머리(16바이트씩)와 moov 상자 하나만 읽는다(File.slice — 300MB 영상도 몇 ms).
 *
 * ⚠️ 이 파일은 **아무것도 import 하지 않는다** — 브라우저(컴포저)와 Node 검사(scripts/test-mp4-inspect.ts, 타입 스트리핑)가
 * 같은 파일을 그대로 읽는다. 형식 판별(첫 바이트)은 lib/publish/sniff.ts 의 sniffContainer 하나뿐이다 — 여기서 다시 만들지 않는다
 * (서버 확인 단계와 같은 함수를 써야 «화면은 통과, 서버는 거절»이 안 생긴다).
 *
 * 판정은 하지 않는다 — 읽은 사실만 돌려준다. 막을지는 lib/publish-rules.ts(validateMediaSet)가 정한다(모르는 값은 null, null 은 막지 않는다).
 */

export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<ArrayBuffer>;
}

export interface Mp4Info {
  /** 'isom' | 'mp42' | 'qt  ' … */
  majorBrand: string | null;
  /** 최상위 상자 순서(최대 32) — 'ftyp','wide','mdat','moov'… */
  topLevel: string[];
  /** moov 가 첫 mdat 보다 앞인가(기록만 — 메타가 거절하는지는 실측 전) */
  faststart: boolean | null;
  /** mvhd 기준 길이 */
  durationMs: number | null;
  video: {
    /** 표본 설명의 fourcc — 'avc1'·'hvc1'·'hev1'·'apch'(ProRes)… */
    codec: string;
    codedWidth: number;
    codedHeight: number;
    /** 표시 회전(시계 방향) — 90·270 이면 표시 가로·세로가 바뀐다 */
    rotation: 0 | 90 | 180 | 270;
    displayWidth: number;
    displayHeight: number;
    /** 평균 프레임 수(표본 수 ÷ 길이) */
    fps: number | null;
    /** 편집 목록(edts/elst)이 있나 — 기록만(ffmpeg·아이폰 파일 대부분이 갖는다) */
    hasEditList: boolean;
  } | null;
  audio: { codec: string; channels: number | null; sampleRate: number | null } | null;
}

/** moov 가 이보다 크면 읽지 않는다(판정 보류) — 몇 시간짜리 영상의 표본 표도 보통 수 MB 다 */
export const MP4_MAX_MOOV_BYTES = 32 * 1024 * 1024;
const MAX_TOP_BOXES = 32;

interface Box {
  type: string;
  /** 상자 시작(머리 포함) */
  start: number;
  /** 내용 시작 */
  content: number;
  /** 상자 끝(배타) */
  end: number;
}

function fourcc(v: DataView, at: number): string {
  return String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
}

/** 64비트 부호 없는 정수 — BigInt 없이(대상이 ES2017). 2^53 안이면 정확하다 */
function u64(v: DataView, at: number): number {
  return v.getUint32(at) * 4294967296 + v.getUint32(at + 4);
}

/** [start, end) 안의 자식 상자들. 틀린 크기를 만나면 거기서 멈춘다(그때까지 읽은 것만) */
function children(v: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = v.getUint32(at);
    const type = fourcc(v, at + 4);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) break;
      size = u64(v, at + 8);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) break;
    out.push({ type, start: at, content: at + header, end: at + size });
    at += size;
  }
  return out;
}

function child(v: DataView, box: Box, type: string): Box | null {
  return children(v, box.content, box.end).find((b) => b.type === type) ?? null;
}

interface TrackFacts {
  handler: string | null;
  enabled: boolean;
  rotation: 0 | 90 | 180 | 270;
  tkhdWidth: number;
  tkhdHeight: number;
  hasEditList: boolean;
  timescale: number | null;
  duration: number | null;
  codec: string | null;
  codedWidth: number | null;
  codedHeight: number | null;
  channels: number | null;
  sampleRate: number | null;
  sampleCount: number | null;
}

/** 표시 행렬 → 시계 방향 회전. 가장 가까운 직각으로 맞춘다(비직각 행렬은 폰 파일에 없다) */
function rotationOf(a: number, b: number): 0 | 90 | 180 | 270 {
  if (a === 0 && b === 0) return 0;
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  const snapped = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return snapped as 0 | 90 | 180 | 270;
}

function readTkhd(v: DataView, box: Box, t: TrackFacts) {
  const c = box.content;
  if (c + 4 > box.end) return;
  const version = v.getUint8(c);
  const flags = v.getUint32(c) & 0xffffff;
  t.enabled = (flags & 1) === 1;
  /* v1: 만든·고친 시각 8+8, 트랙 id 4, 예비 4, 길이 8 / v0: 4+4, 4, 4, 4 — 그 뒤 예비 8, 층 2, 대체 묶음 2, 음량 2, 예비 2 */
  const matrix = c + 4 + (version === 1 ? 32 : 20) + 16;
  if (matrix + 36 + 8 > box.end) return;
  const a = v.getInt32(matrix) / 65536;
  const b = v.getInt32(matrix + 4) / 65536;
  t.rotation = rotationOf(a, b);
  t.tkhdWidth = v.getUint32(matrix + 36) / 65536;
  t.tkhdHeight = v.getUint32(matrix + 40) / 65536;
}

function readMdhd(v: DataView, box: Box, t: TrackFacts) {
  const c = box.content;
  if (c + 4 > box.end) return;
  const version = v.getUint8(c);
  if (version === 1) {
    if (c + 32 > box.end) return;
    t.timescale = v.getUint32(c + 20);
    t.duration = u64(v, c + 24);
  } else {
    if (c + 20 > box.end) return;
    t.timescale = v.getUint32(c + 12);
    t.duration = v.getUint32(c + 16);
  }
}

function readStsd(v: DataView, box: Box, t: TrackFacts) {
  const c = box.content;
  /* 판·깃발 4, 항목 수 4, 그다음 첫 항목(크기 4, fourcc 4) */
  if (c + 16 > box.end) return;
  if (v.getUint32(c + 4) < 1) return;
  const entrySize = v.getUint32(c + 8);
  const entryEnd = Math.min(box.end, c + 8 + entrySize);
  t.codec = fourcc(v, c + 12);
  const e = c + 16; // 표본 항목 내용: 예비 6 + 데이터 참조 번호 2
  if (t.handler === "vide") {
    /* 시각 표본 항목: 예비·미정 16 바이트 뒤 가로 2·세로 2 */
    if (e + 28 <= entryEnd) {
      t.codedWidth = v.getUint16(e + 24);
      t.codedHeight = v.getUint16(e + 26);
    }
  } else if (t.handler === "soun") {
    if (e + 28 > entryEnd) return;
    const version = v.getUint16(e + 8);
    if (version === 2) {
      /* QuickTime 소리 설명 v2 — 표본률은 float64, 채널 수는 u32 */
      if (e + 44 <= entryEnd) {
        t.sampleRate = Math.round(v.getFloat64(e + 32));
        t.channels = v.getUint32(e + 40);
      }
    } else {
      t.channels = v.getUint16(e + 16);
      t.sampleRate = v.getUint32(e + 24) / 65536;
    }
  }
}

function readStts(v: DataView, box: Box, t: TrackFacts) {
  const c = box.content;
  if (c + 8 > box.end) return;
  const n = v.getUint32(c + 4);
  if (c + 8 + n * 8 > box.end) return;
  let count = 0;
  for (let i = 0; i < n; i++) count += v.getUint32(c + 8 + i * 8);
  t.sampleCount = count;
}

/** trak → 필요한 사실만. 정해진 경로(tkhd·edts·mdia/hdlr·mdhd·minf/stbl/stsd·stts)만 내려간다 — 임의 재귀가 없다 */
function readTrak(v: DataView, trak: Box): TrackFacts {
  const t: TrackFacts = {
    handler: null,
    enabled: true,
    rotation: 0,
    tkhdWidth: 0,
    tkhdHeight: 0,
    hasEditList: false,
    timescale: null,
    duration: null,
    codec: null,
    codedWidth: null,
    codedHeight: null,
    channels: null,
    sampleRate: null,
    sampleCount: null,
  };
  for (const b of children(v, trak.content, trak.end)) {
    if (b.type === "tkhd") readTkhd(v, b, t);
    else if (b.type === "edts") t.hasEditList = !!child(v, b, "elst");
    else if (b.type === "mdia") {
      const kids = children(v, b.content, b.end);
      const hdlr = kids.find((k) => k.type === "hdlr");
      /* 판·깃발 4, 미정 4 뒤 handler_type */
      if (hdlr && hdlr.content + 12 <= hdlr.end) t.handler = fourcc(v, hdlr.content + 8);
      const mdhd = kids.find((k) => k.type === "mdhd");
      if (mdhd) readMdhd(v, mdhd, t);
      const minf = kids.find((k) => k.type === "minf");
      const stbl = minf ? child(v, minf, "stbl") : null;
      if (stbl) {
        const s = children(v, stbl.content, stbl.end);
        const stsd = s.find((k) => k.type === "stsd");
        if (stsd) readStsd(v, stsd, t);
        const stts = s.find((k) => k.type === "stts");
        if (stts) readStts(v, stts, t);
      }
    }
  }
  return t;
}

function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/**
 * 파일 → Mp4Info. null = ISO BMFF 로 읽지 못함(판정 보류 — 막지 않는다. <video> 가 읽은 길이·크기만 쓴다).
 * 예외를 던지지 않는다.
 */
export async function inspectMp4(src: ByteSource): Promise<Mp4Info | null> {
  try {
    const topLevel: string[] = [];
    let majorBrand: string | null = null;
    let moov: { start: number; size: number; header: number } | null = null;
    let firstMdat: number | null = null;
    let at = 0;
    for (let i = 0; i < MAX_TOP_BOXES && at + 8 <= src.size; i++) {
      const head = new DataView(await src.read(at, Math.min(16, src.size - at)));
      if (head.byteLength < 8) break;
      let size = head.getUint32(0);
      const type = fourcc(head, 4);
      let header = 8;
      if (size === 1) {
        if (head.byteLength < 16) break;
        size = u64(head, 8);
        header = 16;
      } else if (size === 0) {
        size = src.size - at;
      }
      if (size < header) break;
      topLevel.push(type);
      if (type === "ftyp" && head.byteLength >= 12) majorBrand = fourcc(head, 8);
      if (type === "mdat" && firstMdat === null) firstMdat = at;
      if (type === "moov" && !moov) moov = { start: at, size, header };
      if (at + size > src.size) break; // 잘린 파일 — 여기까지만
      at += size;
      if (moov && firstMdat !== null) break;
    }
    if (!moov || moov.size > MP4_MAX_MOOV_BYTES || moov.start + moov.size > src.size) return null;

    const buf = await src.read(moov.start, moov.size);
    if (buf.byteLength !== moov.size) return null;
    const v = new DataView(buf);
    const root: Box = { type: "moov", start: 0, content: moov.header, end: moov.size };

    let durationMs: number | null = null;
    const tracks: TrackFacts[] = [];
    for (const b of children(v, root.content, root.end)) {
      if (b.type === "mvhd" && b.content + 4 <= b.end) {
        const version = v.getUint8(b.content);
        let timescale = 0;
        let duration = 0;
        if (version === 1 && b.content + 32 <= b.end) {
          timescale = v.getUint32(b.content + 20);
          duration = u64(v, b.content + 24);
        } else if (b.content + 20 <= b.end) {
          timescale = v.getUint32(b.content + 12);
          duration = v.getUint32(b.content + 16);
        }
        if (timescale > 0 && duration > 0 && duration !== 0xffffffff) durationMs = round((duration / timescale) * 1000, 0);
      } else if (b.type === "trak") {
        tracks.push(readTrak(v, b));
      }
    }

    const vids = tracks.filter((t) => t.handler === "vide");
    const vt = vids.find((t) => t.enabled && (t.sampleCount ?? 0) > 0) ?? vids[0] ?? null;
    const sound = tracks.find((t) => t.handler === "soun") ?? null;

    let video: Mp4Info["video"] = null;
    if (vt && vt.codec) {
      const w = vt.codedWidth || Math.round(vt.tkhdWidth);
      const h = vt.codedHeight || Math.round(vt.tkhdHeight);
      const swap = vt.rotation === 90 || vt.rotation === 270;
      const seconds = vt.timescale && vt.duration ? vt.duration / vt.timescale : 0;
      video = {
        codec: vt.codec,
        codedWidth: w,
        codedHeight: h,
        rotation: vt.rotation,
        displayWidth: swap ? h : w,
        displayHeight: swap ? w : h,
        fps: vt.sampleCount && seconds > 0 ? round(vt.sampleCount / seconds, 3) : null,
        hasEditList: vt.hasEditList,
      };
      if (durationMs === null && seconds > 0) durationMs = round(seconds * 1000, 0);
    }
    const audio: Mp4Info["audio"] =
      sound && sound.codec
        ? {
            codec: sound.codec,
            channels: sound.channels && sound.channels > 0 ? sound.channels : null,
            sampleRate: sound.sampleRate && sound.sampleRate > 0 ? Math.round(sound.sampleRate) : null,
          }
        : null;

    return {
      majorBrand,
      topLevel,
      faststart: firstMdat === null ? null : moov.start < firstMdat,
      durationMs,
      video,
      audio,
    };
  } catch {
    return null;
  }
}
