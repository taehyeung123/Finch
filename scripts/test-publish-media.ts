/**
 * 발행 미디어 모델 검증 — 경로 모양·저장 모양·옛 cardnews URL 검증(쿼리 속 표지 우회)·목록 한 줄·첫 바이트 판별.
 * 실행: node scripts/test-publish-media.ts [픽스처 폴더]  (Node 24 타입 스트리핑)
 *   픽스처 폴더(선택)에 ffmpeg 로 만든 x.jpg·*.mp4·*.mov 가 있으면 첫 바이트 판별도 실파일로 본다.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isOwnMediaPath, legacyCardnewsPath, parseStoredMedia, resolvePostItems, thumbSource } from "../lib/publish/media-core.ts";
import { safePermalink, toListItem, type ListPostRow } from "../lib/publish/list-item.ts";
import { sniffContainer } from "../lib/publish/sniff.ts";

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

const U = "0f6b9c2e-1d3a-4c5b-8e7f-9a0b1c2d3e4f";
const OTHER = "11111111-2222-4333-8444-555555555555";
const ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ID2 = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ORIGIN = "https://abcdefgh.supabase.co";

console.log("경로 모양");
check("내 사진 경로", isOwnMediaPath(`${U}/${ID}.jpg`, U, "image"));
check("내 영상 경로(mp4·mov)", isOwnMediaPath(`${U}/${ID}.mp4`, U, "video") && isOwnMediaPath(`${U}/${ID}.mov`, U, "video"));
check("사진 자리에 영상 확장자 거절", !isOwnMediaPath(`${U}/${ID}.mp4`, U, "image"));
check("남의 폴더 거절", !isOwnMediaPath(`${OTHER}/${ID}.jpg`, U));
check("앞부분만 같은 경로 거절(startsWith 우회)", !isOwnMediaPath(`${U}/${ID}.jpg/../../x.jpg`, U));
check("하위 폴더 거절(한 단계만)", !isOwnMediaPath(`${U}/files/${ID}.jpg`, U));
check("대문자 확장자 거절", !isOwnMediaPath(`${U}/${ID}.JPG`, U));
check("사용자 id 가 uuid 가 아니면 거절", !isOwnMediaPath(`x/${ID}.jpg`, "x"));

console.log("저장 모양(media jsonb)");
const good = [
  { kind: "image", path: `${U}/${ID}.jpg`, cover_path: null, thumb_offset_ms: null, duration_ms: null, width: 1080, height: 1350, bytes: 900000 },
  { kind: "video", path: `${U}/${ID2}.mp4`, cover_path: `${U}/c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.jpg`, thumb_offset_ms: 1000, duration_ms: 30000, width: 1080, height: 1920, bytes: 20000000 },
];
check("정상 모양 통과", parseStoredMedia(good, U)?.length === 2);
check("빈 배열 거절(미디어 없는 글은 null)", parseStoredMedia([], U) === null);
check("21개 거절", parseStoredMedia(Array.from({ length: 21 }, (_, i) => ({ kind: "image", path: `${U}/${ID.slice(0, -2)}${String(i).padStart(2, "0")}.jpg` })), U) === null);
check("같은 경로 두 번 거절", parseStoredMedia([good[0], good[0]], U) === null);
check("사진에 커버 거절", parseStoredMedia([{ ...good[0], cover_path: good[1].cover_path }], U) === null);
check("사진에 커버 위치 거절", parseStoredMedia([{ ...good[0], thumb_offset_ms: 10 }], U) === null);
check("남의 커버 거절", parseStoredMedia([{ ...good[1], cover_path: `${OTHER}/${ID}.jpg` }], U) === null);
check("숫자 자리에 문자 거절", parseStoredMedia([{ ...good[1], duration_ms: "30000" }], U) === null);
check("음수 거절", parseStoredMedia([{ ...good[1], thumb_offset_ms: -1 }], U) === null);
check("모르는 종류 거절", parseStoredMedia([{ ...good[0], kind: "gif" }], U) === null);

console.log("옛 cardnews URL");
const legacy = `${ORIGIN}/storage/v1/object/public/cardnews/${U}/${ID}.jpg`;
const studio = `${ORIGIN}/storage/v1/object/public/cardnews/${U}/${ID}/01.jpg`;
check("옛 컴포저 경로 통과", legacyCardnewsPath(legacy, U, ORIGIN) === `${U}/${ID}.jpg`);
check("스튜디오 카드뉴스 경로 통과", legacyCardnewsPath(studio, U, ORIGIN) === `${U}/${ID}/01.jpg`);
check(
  "쿼리 속 표지 우회 거절(2026-09-11 점검)",
  legacyCardnewsPath(`${ORIGIN}/rest/v1/secret?x=/storage/v1/object/public/cardnews/${U}/${ID}.jpg`, U, ORIGIN) === null,
);
check("다른 오리진 거절", legacyCardnewsPath(`https://evil.example/storage/v1/object/public/cardnews/${U}/${ID}.jpg`, U, ORIGIN) === null);
check("쿼리 붙은 URL 거절", legacyCardnewsPath(`${legacy}?t=1`, U, ORIGIN) === null);
check("조각 붙은 URL 거절", legacyCardnewsPath(`${legacy}#x`, U, ORIGIN) === null);
check("다른 버킷 거절", legacyCardnewsPath(`${ORIGIN}/storage/v1/object/public/link-assets/${U}/${ID}.jpg`, U, ORIGIN) === null);
check("남의 폴더 거절", legacyCardnewsPath(`${ORIGIN}/storage/v1/object/public/cardnews/${OTHER}/${ID}.jpg`, U, ORIGIN) === null);
check("상위 경로 거절", legacyCardnewsPath(`${ORIGIN}/storage/v1/object/public/cardnews/${U}/%2E%2E/x.jpg`, U, ORIGIN) === null);
check("인코딩된 슬래시 거절", legacyCardnewsPath(`${ORIGIN}/storage/v1/object/public/cardnews/${U}%2F..%2Fx.jpg`, U, ORIGIN) === null);
check("사진 아닌 확장자 거절", legacyCardnewsPath(`${ORIGIN}/storage/v1/object/public/cardnews/${U}/${ID}.html`, U, ORIGIN) === null);

console.log("게시물 → 항목");
{
  const r = resolvePostItems({ user_id: U, media: good, image_urls: [] }, ORIGIN);
  check("새 글 → publish-media 항목 둘", r.ok && r.items.length === 2 && r.items.every((i) => i.source === "publish-media"));
  const both = resolvePostItems({ user_id: U, media: good, image_urls: [legacy] }, ORIGIN);
  check("media 와 image_urls 가 섞이면 거절", !both.ok);
  const old = resolvePostItems({ user_id: U, media: null, image_urls: [legacy, studio] }, ORIGIN);
  check("옛 글 → legacy 항목(경로만)", old.ok && old.items.length === 2 && old.items.every((i) => i.source === "legacy" && !("url" in i)));
  const bad = resolvePostItems({ user_id: U, media: null, image_urls: [legacy, "https://evil.example/a.jpg"] }, ORIGIN);
  check("옛 글에 남의 URL 하나라도 있으면 전체 거절", !bad.ok);
  const text = resolvePostItems({ user_id: U, media: null, image_urls: [] }, ORIGIN);
  check("글 전용 → 항목 0개", text.ok && text.items.length === 0);
}

console.log("목록 썸네일 재료");
check("첫 항목 사진 → 그 경로", JSON.stringify(thumbSource({ user_id: U, media: good, image_urls: [] })) === JSON.stringify({ path: `${U}/${ID}.jpg` }));
check("첫 항목 영상 → 커버 경로", JSON.stringify(thumbSource({ user_id: U, media: [good[1]], image_urls: [] })) === JSON.stringify({ path: good[1].cover_path }));
check("커버 없는 영상 → null(필름 아이콘)", thumbSource({ user_id: U, media: [{ ...good[1], cover_path: null }], image_urls: [] }) === null);
check("옛 글 → 공개 URL 그대로", JSON.stringify(thumbSource({ user_id: U, media: null, image_urls: [legacy] })) === JSON.stringify({ url: legacy }));

console.log("목록 한 줄");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const row = (o: Partial<ListPostRow>): ListPostRow => ({
  id: "p1",
  user_id: U,
  caption: "글",
  channel: "instagram",
  image_urls: [],
  media: good,
  ig_surface: "feed",
  scheduled_at: "2026-09-11T10:00:00Z",
  published_at: null,
  publish_after: null,
  publish_attempted_at: null,
  status: "scheduled",
  error: null,
  permalink: null,
  media_purged_at: null,
  ...o,
});
{
  const prepared = toListItem(row({ status: "processing", publish_after: "2026-09-11T12:10:00Z", scheduled_at: "2026-09-11T12:10:00Z" }), null, NOW);
  check("미리 준비 중인 예약 영상 → 화면은 «예약됨»", prepared.status === "processing" && prepared.display_status === "scheduled");
  check("미리 준비 중(시도 전) → 취소 가능", prepared.can_cancel);
  const busy = toListItem(row({ status: "processing", publish_after: "2026-09-11T11:59:00Z" }), null, NOW);
  check("처리 중(발행 시각 지남) → «처리 중»", busy.display_status === "processing");
  const attempted = toListItem(row({ status: "processing", publish_attempted_at: "2026-09-11T11:59:30Z" }), null, NOW);
  check("발행을 시도한 처리 중 → 취소 불가", !attempted.can_cancel);
  const pub = toListItem(row({ status: "published", published_at: "2026-09-11T11:00:00Z", permalink: "https://www.instagram.com/p/abc/" }), "t", NOW);
  check("발행 완료 → 달력 기준은 실제 발행 시각", pub.display_at === "2026-09-11T11:00:00Z");
  check("발행 완료 → 링크 통과", pub.permalink === "https://www.instagram.com/p/abc/");
  check("미디어 개수·영상 여부", pub.media_count === 2 && pub.has_video);
  const legacyRow = toListItem(row({ media: null, image_urls: [legacy, legacy], ig_surface: null }), null, NOW);
  check("옛 글 개수 = image_urls", legacyRow.media_count === 2 && !legacyRow.has_video && legacyRow.ig_surface === null);
  const purged = toListItem(row({ status: "failed", media_purged_at: "2026-09-10T00:00:00Z" }), null, NOW);
  check("파일 정리된 글 표시", purged.media_purged);
  const weird = toListItem(row({ status: "exploded" }), null, NOW);
  check("모르는 상태는 실패로 본다(버튼이 잘못 열리지 않게)", weird.status === "failed");
}

console.log("게시물 링크");
check("인스타 통과", safePermalink("https://www.instagram.com/reel/xyz/") !== null);
check("스레드(.net·.com) 통과", safePermalink("https://www.threads.net/@a/post/1") !== null && safePermalink("https://www.threads.com/@a/post/1") !== null);
check("다른 호스트 거절", safePermalink("https://evil.example/p/1") === null);
check("http 거절", safePermalink("http://www.instagram.com/p/1") === null);
check("javascript: 거절", safePermalink("javascript:alert(1)") === null);
check("사용자 정보 붙은 주소 거절", safePermalink("https://www.instagram.com@evil.example/") === null);

console.log("첫 바이트 판별");
check("JPEG 머리", sniffContainer(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])) === "jpeg");
const box = (t: string) => new Uint8Array([0, 0, 0, 0x20, ...[...t].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
check("ftyp → iso-bmff", sniffContainer(box("ftyp")) === "iso-bmff");
check("옛 QuickTime wide·mdat·moov → iso-bmff", ["wide", "mdat", "moov", "free"].every((t) => sniffContainer(box(t)) === "iso-bmff"));
check("WebM(EBML) → 모름", sniffContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])) === null);
check("PNG → 모름(사진은 JPEG 만)", sniffContainer(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === null);
check("너무 짧음 → 모름", sniffContainer(new Uint8Array([0, 0, 0])) === null);
const fx = process.argv[2];
if (fx) {
  for (const name of readdirSync(fx)) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (!ext || !["jpg", "mp4", "mov"].includes(ext)) continue;
    const head = new Uint8Array(readFileSync(join(fx, name)).subarray(0, 64));
    const want = ext === "jpg" ? "jpeg" : "iso-bmff";
    check(`실파일 ${name} → ${want}`, sniffContainer(head) === want, sniffContainer(head));
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
