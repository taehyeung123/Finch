/**
 * 발행 미디어 규칙 검증 — 게시 면 판정·개수·길이·해상도·프레임·코덱·소리, «null 은 막지 않는다».
 * 실행: node scripts/test-publish-rules.ts  (Node 24 타입 스트리핑)
 */
import {
  hasBlockingIssue,
  mediaRules,
  resolveIgSurface,
  validateMediaSet,
  validatePostText,
  type MediaItemFacts,
} from "../lib/publish-rules.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

const img = (o: Partial<MediaItemFacts> = {}): MediaItemFacts => ({
  kind: "image",
  bytes: 800_000,
  width: 1080,
  height: 1350,
  durationMs: null,
  fps: null,
  videoCodec: null,
  audioCodec: null,
  audioChannels: null,
  audioSampleRate: null,
  ...o,
});
const vid = (o: Partial<MediaItemFacts> = {}): MediaItemFacts => ({
  kind: "video",
  bytes: 20_000_000,
  width: 1080,
  height: 1920,
  durationMs: 30_000,
  fps: 30,
  videoCodec: "avc1",
  audioCodec: "mp4a",
  audioChannels: 2,
  audioSampleRate: 48_000,
  ...o,
});
const unknownVid = (): MediaItemFacts => ({
  kind: "video",
  bytes: null,
  width: null,
  height: null,
  durationMs: null,
  fps: null,
  videoCodec: null,
  audioCodec: null,
  audioChannels: null,
  audioSampleRate: null,
});
const codes = (issues: ReturnType<typeof validateMediaSet>) => issues.filter((i) => i.severity === "error").map((i) => i.code);
const errs = (ch: string, s: Parameters<typeof validateMediaSet>[1], items: MediaItemFacts[]) => codes(validateMediaSet(ch, s, items));

console.log("resolveIgSurface");
check("영상 1개 → 릴스", resolveIgSurface({ count: 1, firstKind: "video", story: false }) === "reels");
check("사진 1개 → 피드", resolveIgSurface({ count: 1, firstKind: "image", story: false }) === "feed");
check("1개 + 스토리 → 스토리", resolveIgSurface({ count: 1, firstKind: "video", story: true }) === "story");
check("사진 1개 + 스토리 → 스토리", resolveIgSurface({ count: 1, firstKind: "image", story: true }) === "story");
check("2개 + 스토리 → 피드(캐러셀)", resolveIgSurface({ count: 2, firstKind: "image", story: true }) === "feed");
check("영상으로 시작하는 3개 → 피드(캐러셀)", resolveIgSurface({ count: 3, firstKind: "video", story: false }) === "feed");

console.log("개수");
check("인스타 피드 0개 → count_low", errs("instagram", "feed", []).includes("count_low"));
check("인스타 캐러셀 10개 통과", errs("instagram", "feed", Array.from({ length: 10 }, () => img())).length === 0);
check("인스타 캐러셀 11개 → count_high", errs("instagram", "feed", Array.from({ length: 11 }, () => img())).includes("count_high"));
check(
  "인스타 섞은 캐러셀(사진+영상) 통과",
  errs("instagram", "feed", [img(), vid({ durationMs: 20_000 }), img()]).length === 0,
);
check("스레드 0개(글만) 미디어 규칙 통과", errs("threads", null, []).length === 0);
check("스레드 20개 통과", errs("threads", null, Array.from({ length: 20 }, () => img())).length === 0);
check("스레드 21개 → count_high", errs("threads", null, Array.from({ length: 21 }, () => img())).includes("count_high"));
check("스토리 2개 → story_single", errs("instagram", "story", [img(), img()]).includes("story_single"));
check("스토리 1개 통과", errs("instagram", "story", [img()]).length === 0);
check("피드인데 영상 1개 → video_single_feed", errs("instagram", "feed", [vid()]).includes("video_single_feed"));
check("릴스인데 사진 → reels_video_only", errs("instagram", "reels", [img()]).includes("reels_video_only"));
check(
  "개수 초과 문구에 채널 이름과 조사",
  validateMediaSet("instagram", "feed", Array.from({ length: 11 }, () => img())).some((i) => i.message === "인스타그램은 사진·영상을 10개까지 올릴 수 있어요."),
);
check(
  "스레드 초과 문구 조사(는)",
  validateMediaSet("threads", null, Array.from({ length: 21 }, () => img())).some((i) => i.message.startsWith("스레드는 ")),
);

console.log("길이");
check("릴스 2.9초 → too_short", errs("instagram", "reels", [vid({ durationMs: 2_900 })]).includes("too_short"));
check("릴스 3초 통과", errs("instagram", "reels", [vid({ durationMs: 3_000 })]).length === 0);
check("릴스 15:00 통과", errs("instagram", "reels", [vid({ durationMs: 15 * 60_000 })]).length === 0);
check("릴스 15:01 → too_long", errs("instagram", "reels", [vid({ durationMs: 15 * 60_000 + 1_000 })]).includes("too_long"));
check("스토리 영상 61초 → too_long", errs("instagram", "story", [vid({ durationMs: 61_000 })]).includes("too_long"));
check("스토리 영상 60초 통과", errs("instagram", "story", [vid({ durationMs: 60_000 })]).length === 0);
check("캐러셀 영상 61초 → too_long(보수적 한도)", errs("instagram", "feed", [img(), vid({ durationMs: 61_000 })]).includes("too_long"));
check("스레드 영상 5:01 → too_long", errs("threads", null, [vid({ durationMs: 301_000 })]).includes("too_long"));
check("스레드 영상 1초 통과(하한 없음)", errs("threads", null, [vid({ durationMs: 1_000, bytes: 1_000_000 })]).length === 0);
check(
  "길이 문구 «15분까지»",
  validateMediaSet("instagram", "reels", [vid({ durationMs: 16 * 60_000 })]).some((i) => i.message === "1번째 영상 — 15분까지 올릴 수 있어요."),
);

console.log("해상도·프레임·코덱·소리·크기");
check("가로 2160 → too_wide", errs("instagram", "reels", [vid({ width: 2160, height: 3840 })]).includes("too_wide"));
check("가로 1920(가로 영상) 통과", errs("instagram", "reels", [vid({ width: 1920, height: 1080 })]).length === 0);
check("120fps → fps_high", errs("instagram", "reels", [vid({ fps: 120 })]).includes("fps_high"));
check("60fps 통과", errs("instagram", "reels", [vid({ fps: 60 })]).length === 0);
check("59.94fps 통과", errs("instagram", "reels", [vid({ fps: 59.94 })]).length === 0);
const lowFps = validateMediaSet("instagram", "reels", [vid({ fps: 15 })]);
check("15fps → 경고만(막지 않음)", !hasBlockingIssue(lowFps) && lowFps.some((i) => i.code === "fps_low" && i.severity === "warning"));
for (const c of ["vp09", "apch", "av01", "mp4v"]) {
  check(`영상 코덱 ${c} → video_codec`, errs("instagram", "reels", [vid({ videoCodec: c })]).includes("video_codec"));
}
for (const c of ["avc1", "avc3", "hvc1", "hev1"]) {
  check(`영상 코덱 ${c} 통과`, errs("instagram", "reels", [vid({ videoCodec: c })]).length === 0);
}
check("소리 lpcm → audio_codec", errs("instagram", "reels", [vid({ audioCodec: "lpcm" })]).includes("audio_codec"));
check("소리 sowt(ffmpeg PCM) → audio_codec", errs("threads", null, [vid({ audioCodec: "sowt" })]).includes("audio_codec"));
check("소리 없음(null) 통과", errs("instagram", "reels", [vid({ audioCodec: null, audioChannels: null, audioSampleRate: null })]).length === 0);
check("소리 6채널 → audio_channels", errs("instagram", "reels", [vid({ audioChannels: 6 })]).includes("audio_channels"));
check("소리 96kHz → audio_rate", errs("instagram", "reels", [vid({ audioSampleRate: 96_000 })]).includes("audio_rate"));
check("릴스 301MB → too_large", errs("instagram", "reels", [vid({ bytes: 301 * 1024 * 1024, durationMs: 15 * 60_000 })]).includes("too_large"));
check("스토리 영상 101MB → too_large", errs("instagram", "story", [vid({ bytes: 101 * 1024 * 1024, durationMs: 59_000 })]).includes("too_large"));
check("사진 9MB → too_large", errs("instagram", "feed", [img({ bytes: 9 * 1024 * 1024 })]).includes("too_large"));
const hot = validateMediaSet("instagram", "reels", [vid({ bytes: 120 * 1024 * 1024, durationMs: 30_000 })]);
check("인스타 32Mbps → 경고만", !hasBlockingIssue(hot) && hot.some((i) => i.code === "bitrate_high" && i.severity === "warning"));
check("스레드 120Mbps → bitrate_high 오류", errs("threads", null, [vid({ bytes: 450 * 1024 * 1024 / 1.5, durationMs: 20_000 })]).includes("bitrate_high"));

console.log("모르는 값(null)은 막지 않는다");
check("인스타 릴스 — 전부 모름 통과", errs("instagram", "reels", [unknownVid()]).length === 0);
check("스레드 — 전부 모름 통과", errs("threads", null, [unknownVid(), unknownVid()]).length === 0);
check("스토리 — 전부 모름 통과", errs("instagram", "story", [unknownVid()]).length === 0);

console.log("글");
check("인스타 캡션 없음 → 막음", validatePostText("instagram", "feed", "  ", 1) !== null);
check("인스타 스토리는 캡션 없어도 통과", validatePostText("instagram", "story", "", 1) === null);
check("스레드 글만 통과", validatePostText("threads", null, "안녕", 0) === null);
check("스레드 글도 미디어도 없음 → 막음", validatePostText("threads", null, "", 0) === "내용을 입력해 주세요.");
check("스레드 501자 → 막음", validatePostText("threads", null, "가".repeat(501), 0) !== null);
check("인스타 캡션 문구 조사(을)", validatePostText("instagram", "feed", "", 1) === "캡션을 입력해 주세요.");

console.log("규칙 표");
check("인스타 피드 이미지 비율 4:5~1.91", mediaRules("instagram", "feed").image.minRatio === 0.8 && mediaRules("instagram", "feed").image.maxRatio === 1.91);
check("스레드 사진은 자르지 않는다(10:1)", mediaRules("threads", null).image.maxRatio === 10);
check("스토리 사진은 자르지 않는다", mediaRules("instagram", "story").image.minRatio <= 0.1);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
