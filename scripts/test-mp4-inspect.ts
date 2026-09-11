/**
 * MP4·MOV 머리 읽기 검증 — lib/publish/mp4-inspect-core.ts (2026-09-11 영상 발행).
 * 실행: node scripts/test-mp4-inspect.ts [픽스처 폴더]  (Node 24 타입 스트리핑)
 *
 * 1) 손으로 조립한 상자(합성 파일)로 파서 자체를 본다 — 64비트 크기·v1 상자·회전 행렬·QuickTime 소리 v2·잘린 파일.
 * 2) 픽스처 폴더를 주면 ffmpeg 로 만든 실파일로 본다(없는 파일은 건너뛴다). 만드는 법(스크래치패드에서, Vercel 아님):
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine=frequency=440 -t 8 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart ok_h264_fast.mp4
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine -t 8 -c:v libx264 -pix_fmt yuv420p -c:a aac moov_end.mp4
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine -t 8 -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p -c:a aac hevc.mov
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=120 -t 4 -c:v libx264 -pix_fmt yuv420p fps120.mp4
 *    ffmpeg -f lavfi -i testsrc2=size=2160x3840:rate=30 -t 4 -c:v libx264 -pix_fmt yuv420p w2160.mp4
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -t 2 -c:v libx264 -pix_fmt yuv420p short2s.mp4
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -t 4 -c:v prores_ks prores.mov
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine -t 4 -c:v libx264 -pix_fmt yuv420p -c:a pcm_s16le pcm.mov
 *    ffmpeg -display_rotation 90 -i ok_h264_fast.mp4 -c copy rot90.mp4
 *    ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine -t 5 -c:v libx264 -pix_fmt yuv420p -c:a aac -ac 6 surround.mp4
 *    ffmpeg -f lavfi -i testsrc2=size=640x360:rate=30 -t 3 -c:v libvpx-vp9 vp9.webm
 * 3) 읽은 사실을 규칙(validateMediaSet)에 넣어 «고르는 즉시 거절»이 실제로 나오는지 본다.
 */
import { existsSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { inspectMp4, type ByteSource, type Mp4Info } from "../lib/publish/mp4-inspect-core.ts";
import { sniffContainer } from "../lib/publish/sniff.ts";
import { validateMediaSet, type MediaItemFacts } from "../lib/publish-rules.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${got !== undefined ? ` — got ${JSON.stringify(got)}` : ""}`);
  }
}

/* ── 합성 상자 조립 ── */
function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function u16(n: number): number[] {
  return [(n >>> 8) & 255, n & 255];
}
function i32(n: number): number[] {
  return u32(n < 0 ? n + 4294967296 : n);
}
function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}
function box(type: string, ...parts: number[][]): number[] {
  const body = parts.flat();
  return [...u32(body.length + 8), ...ascii(type), ...body];
}
/** 64비트 크기 머리(size=1)로 만든 상자 */
function box64(type: string, ...parts: number[][]): number[] {
  const body = parts.flat();
  const size = body.length + 16;
  return [...u32(1), ...ascii(type), ...u32(0), ...u32(size), ...body];
}
function zeros(n: number): number[] {
  return new Array(n).fill(0);
}
function f64(n: number): number[] {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, n);
  return [...new Uint8Array(b.buffer)];
}
function matrix(a: number, b: number, c: number, d: number): number[] {
  const fx = (x: number) => i32(Math.round(x * 65536));
  return [...fx(a), ...fx(b), ...u32(0), ...fx(c), ...fx(d), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
}
function tkhd(opts: { version?: 0 | 1; rot: [number, number, number, number]; w: number; h: number }): number[] {
  const v1 = opts.version === 1;
  return box(
    "tkhd",
    [v1 ? 1 : 0, 0, 0, 3],
    v1 ? zeros(32) : zeros(20),
    zeros(16),
    matrix(...opts.rot),
    u32(opts.w * 65536),
    u32(opts.h * 65536),
  );
}
function mdhd(timescale: number, duration: number, version: 0 | 1 = 0): number[] {
  return version === 1
    ? box("mdhd", [1, 0, 0, 0], zeros(16), u32(timescale), u32(0), u32(duration), zeros(4))
    : box("mdhd", [0, 0, 0, 0], zeros(8), u32(timescale), u32(duration), zeros(4));
}
function hdlr(kind: string): number[] {
  return box("hdlr", zeros(4), zeros(4), ascii(kind), zeros(12), [0]);
}
function visualEntry(fourcc: string, w: number, h: number): number[] {
  return box(fourcc, zeros(6), u16(1), zeros(16), u16(w), u16(h), zeros(50));
}
function audioEntryV0(fourcc: string, ch: number, rate: number): number[] {
  return box(fourcc, zeros(6), u16(1), u16(0), u16(0), zeros(4), u16(ch), u16(16), u16(0), u16(0), u32(rate * 65536));
}
function audioEntryV2(fourcc: string, ch: number, rate: number): number[] {
  return box(fourcc, zeros(6), u16(1), u16(2), u16(0), zeros(4), u16(3), u16(16), u16(0xfffe), u16(0), u32(65536), u32(72), f64(rate), u32(ch), zeros(20));
}
function stbl(entry: number[], samples: number): number[] {
  return box("stbl", box("stsd", zeros(4), u32(1), entry), box("stts", zeros(4), u32(1), u32(samples), u32(1000)));
}
function trak(parts: { tkhd: number[]; edit?: boolean; mdhd: number[]; hdlr: number[]; stbl: number[] }): number[] {
  return box(
    "trak",
    parts.tkhd,
    parts.edit ? box("edts", box("elst", zeros(4), u32(1), u32(0), u32(0), u32(65536))) : [],
    box("mdia", parts.mdhd, parts.hdlr, box("minf", parts.stbl)),
  );
}
function mvhd(timescale: number, duration: number, version: 0 | 1 = 0): number[] {
  return version === 1
    ? box("mvhd", [1, 0, 0, 0], zeros(16), u32(timescale), u32(0), u32(duration), zeros(80))
    : box("mvhd", [0, 0, 0, 0], zeros(8), u32(timescale), u32(duration), zeros(80));
}
function memSource(bytes: number[] | Uint8Array): ByteSource {
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return {
    size: u8.length,
    read: async (o, l) => u8.slice(o, o + l).buffer,
  };
}

console.log("합성 파일");
{
  const ftyp = box("ftyp", ascii("isom"), u32(512), ascii("isomiso2avc1mp41"));
  /* 30fps·10초(표본 300개, 트랙 시간 단위 30000 → 길이 300000), 아이폰 세로(가로로 찍혀 90° 회전 표시) */
  const video = trak({
    tkhd: tkhd({ rot: [0, 1, -1, 0], w: 1920, h: 1080 }),
    edit: true,
    mdhd: mdhd(30000, 300000),
    hdlr: hdlr("vide"),
    stbl: stbl(visualEntry("hvc1", 1920, 1080), 300),
  });
  const audio = trak({ tkhd: tkhd({ rot: [1, 0, 0, 1], w: 0, h: 0 }), mdhd: mdhd(44100, 441000), hdlr: hdlr("soun"), stbl: stbl(audioEntryV0("mp4a", 2, 44100), 431) });
  const moov = box("moov", mvhd(1000, 10000), video, audio);
  const mdat = box("mdat", zeros(64));
  const info = await inspectMp4(memSource([...ftyp, ...moov, ...mdat]));
  check("읽힌다", info !== null);
  check("상표 isom", info?.majorBrand === "isom", info?.majorBrand);
  check("최상위 순서", JSON.stringify(info?.topLevel) === JSON.stringify(["ftyp", "moov", "mdat"]), info?.topLevel);
  check("moov 앞 → faststart", info?.faststart === true);
  check("길이 10초", info?.durationMs === 10000, info?.durationMs);
  check("코덱 hvc1", info?.video?.codec === "hvc1", info?.video?.codec);
  check("90° 회전", info?.video?.rotation === 90, info?.video?.rotation);
  check("표시 크기 1080×1920(가로·세로 바뀜)", info?.video?.displayWidth === 1080 && info?.video?.displayHeight === 1920, info?.video);
  check("fps 30", info?.video?.fps === 30, info?.video?.fps);
  check("편집 목록 기록", info?.video?.hasEditList === true);
  check("소리 mp4a·2ch·44100", info?.audio?.codec === "mp4a" && info.audio.channels === 2 && info.audio.sampleRate === 44100, info?.audio);

  /* moov 가 뒤 + mdat 64비트 크기 + v1 mvhd/mdhd + 270° */
  const v1video = trak({
    tkhd: tkhd({ version: 1, rot: [0, -1, 1, 0], w: 1280, h: 720 }),
    mdhd: mdhd(600, 3000, 1),
    hdlr: hdlr("vide"),
    stbl: stbl(visualEntry("avc1", 1280, 720), 125),
  });
  const pcm = trak({ tkhd: tkhd({ rot: [1, 0, 0, 1], w: 0, h: 0 }), mdhd: mdhd(48000, 240000), hdlr: hdlr("soun"), stbl: stbl(audioEntryV2("lpcm", 2, 48000), 240000) });
  const file2 = [...box("ftyp", ascii("qt  "), u32(0), ascii("qt  ")), ...box("wide"), ...box64("mdat", zeros(100)), ...box("moov", mvhd(600, 3000, 1), v1video, pcm)];
  const b = await inspectMp4(memSource(file2));
  check("moov 뒤 → faststart false", b?.faststart === false, b?.faststart);
  check("QuickTime 상표", b?.majorBrand === "qt  ", b?.majorBrand);
  check("64비트 mdat 을 건너뛴다", JSON.stringify(b?.topLevel) === JSON.stringify(["ftyp", "wide", "mdat", "moov"]), b?.topLevel);
  check("v1 길이 5초", b?.durationMs === 5000, b?.durationMs);
  check("270° → 720×1280", b?.video?.rotation === 270 && b.video.displayWidth === 720 && b.video.displayHeight === 1280, b?.video);
  check("fps 25", b?.video?.fps === 25, b?.video?.fps);
  check("편집 목록 없음", b?.video?.hasEditList === false);
  check("QuickTime 소리 v2 — lpcm·2ch·48000", b?.audio?.codec === "lpcm" && b.audio.channels === 2 && b.audio.sampleRate === 48000, b?.audio);

  /* 잘린 파일·moov 없음·쓰레기 */
  const cut = [...ftyp, ...moov].slice(0, ftyp.length + 40);
  check("moov 가 잘린 파일 → null", (await inspectMp4(memSource(cut))) === null);
  check("moov 없음 → null", (await inspectMp4(memSource([...ftyp, ...mdat]))) === null);
  check("쓰레기 → null", (await inspectMp4(memSource(ascii("hello world, this is not a movie file at all")))) === null);
  check("빈 파일 → null", (await inspectMp4(memSource([]))) === null);
  /* 크기가 부모를 넘는 자식 상자 — 예외 없이 그때까지 읽은 것만 */
  const badChild = box("moov", mvhd(1000, 4000), [...u32(99999), ...ascii("trak"), ...zeros(8)]);
  const bad = await inspectMp4(memSource([...ftyp, ...badChild]));
  check("부모를 넘는 자식 크기 → 영상 없음(예외 없음)", bad !== null && bad.video === null && bad.durationMs === 4000, bad);
}

/* ── 실파일 ── */
const fx = process.argv[2];
if (fx) {
  console.log(`\n실파일(${fx})`);
  const load = async (name: string): Promise<{ info: Mp4Info | null; head: Uint8Array; size: number } | null> => {
    const p = join(fx, name);
    if (!existsSync(p)) {
      console.log(`  - ${name} 없음(건너뜀)`);
      return null;
    }
    const fh = await open(p, "r");
    const { size } = await fh.stat();
    const src: ByteSource = {
      size,
      read: async (o, l) => {
        const buf = Buffer.alloc(l);
        const { bytesRead } = await fh.read(buf, 0, l, o);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead);
      },
    };
    const head = new Uint8Array(await src.read(0, 12));
    const info = await inspectMp4(src);
    await fh.close();
    return { info, head, size };
  };
  const facts = (info: Mp4Info, bytes: number): MediaItemFacts => ({
    kind: "video",
    bytes,
    width: info.video?.displayWidth ?? null,
    height: info.video?.displayHeight ?? null,
    durationMs: info.durationMs,
    fps: info.video?.fps ?? null,
    videoCodec: info.video?.codec ?? null,
    audioCodec: info.audio?.codec ?? null,
    audioChannels: info.audio?.channels ?? null,
    audioSampleRate: info.audio?.sampleRate ?? null,
  });
  const codes = (f: MediaItemFacts, surface: "reels" | "feed" | "story" = "reels", channel = "instagram") =>
    validateMediaSet(channel, surface, [f]).filter((i) => i.severity === "error").map((i) => i.code);
  const near = (a: number | null | undefined, b: number, tol: number) => typeof a === "number" && Math.abs(a - b) <= tol;

  const ok = await load("ok_h264_fast.mp4");
  if (ok) {
    check("ok — 첫 바이트 iso-bmff", sniffContainer(ok.head) === "iso-bmff");
    check("ok — avc1·30fps·1080×1920", ok.info?.video?.codec === "avc1" && near(ok.info.video.fps, 30, 0.5) && ok.info.video.displayWidth === 1080, ok.info?.video);
    check("ok — faststart", ok.info?.faststart === true, ok.info?.topLevel);
    check("ok — 8초", near(ok.info?.durationMs, 8000, 100), ok.info?.durationMs);
    check("ok — AAC·1ch", ok.info?.audio?.codec === "mp4a" && ok.info.audio.channels === 1, ok.info?.audio);
    check("ok — 릴스 규칙 통과", ok.info ? codes(facts(ok.info, ok.size)).length === 0 : false, ok.info && codes(facts(ok.info, ok.size)));
  }
  const end = await load("moov_end.mp4");
  if (end) {
    check("moov_end — faststart false", end.info?.faststart === false, end.info?.topLevel);
    check("moov_end — 그래도 읽힌다(막지 않는다)", end.info?.video?.codec === "avc1" && end.info ? codes(facts(end.info, end.size)).length === 0 : false);
  }
  const hevc = await load("hevc.mov");
  if (hevc) {
    check("hevc — hvc1", hevc.info?.video?.codec === "hvc1", hevc.info?.video);
    check("hevc — 첫 바이트 iso-bmff", sniffContainer(hevc.head) === "iso-bmff");
    check("hevc — 릴스 규칙 통과", hevc.info ? codes(facts(hevc.info, hevc.size)).length === 0 : false);
  }
  const f120 = await load("fps120.mp4");
  if (f120) {
    check("fps120 — 120fps", near(f120.info?.video?.fps, 120, 0.5), f120.info?.video?.fps);
    check("fps120 — fps_high 로 거절", f120.info ? codes(facts(f120.info, f120.size)).includes("fps_high") : false);
  }
  const w4k = await load("w2160.mp4");
  if (w4k) {
    check("w2160 — 가로 2160", w4k.info?.video?.displayWidth === 2160, w4k.info?.video);
    check("w2160 — too_wide 로 거절", w4k.info ? codes(facts(w4k.info, w4k.size)).includes("too_wide") : false);
  }
  const short = await load("short2s.mp4");
  if (short) {
    check("short2s — 2초", near(short.info?.durationMs, 2000, 100), short.info?.durationMs);
    check("short2s — 인스타 릴스 too_short", short.info ? codes(facts(short.info, short.size)).includes("too_short") : false);
    check("short2s — 스레드는 통과", short.info ? codes(facts(short.info, short.size), "feed", "threads").length === 0 : false);
  }
  const prores = await load("prores.mov");
  if (prores) {
    check("prores — apch 계열 코덱", /^ap(4h|4x|ch|cn|cs|co)$/.test(prores.info?.video?.codec ?? ""), prores.info?.video?.codec);
    check("prores — video_codec 로 거절", prores.info ? codes(facts(prores.info, prores.size)).includes("video_codec") : false);
  }
  const pcm = await load("pcm.mov");
  if (pcm) {
    check("pcm — 소리가 AAC 가 아니다", !!pcm.info?.audio && pcm.info.audio.codec !== "mp4a", pcm.info?.audio);
    check("pcm — audio_codec 로 거절", pcm.info ? codes(facts(pcm.info, pcm.size)).includes("audio_codec") : false);
  }
  const rot = await load("rot90.mp4");
  if (rot) {
    check("rot90 — 90·270 회전", rot.info?.video?.rotation === 90 || rot.info?.video?.rotation === 270, rot.info?.video);
    check("rot90 — 표시 크기 1920×1080", rot.info?.video?.displayWidth === 1920 && rot.info.video.displayHeight === 1080, rot.info?.video);
    check("rot90 — 부호화 크기 1080×1920", rot.info?.video?.codedWidth === 1080 && rot.info.video.codedHeight === 1920, rot.info?.video);
  }
  const sur = await load("surround.mp4");
  if (sur) {
    check("surround — 6ch", sur.info?.audio?.channels === 6, sur.info?.audio);
    check("surround — audio_channels 로 거절", sur.info ? codes(facts(sur.info, sur.size)).includes("audio_channels") : false);
  }
  const webm = await load("vp9.webm");
  if (webm) {
    check("webm — 첫 바이트가 iso-bmff 가 아니다", sniffContainer(webm.head) === null);
    check("webm — 파서는 null", webm.info === null);
  }
}

console.log(`\n${pass} 통과 · ${fail} 실패`);
if (fail > 0) process.exit(1);
