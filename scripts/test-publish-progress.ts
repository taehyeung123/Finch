/**
 * 발행 목록의 진행 상황 판단 검증 — 비동기 「지금 발행」(2026-09-12). 무엇을 따라 보고, 얼마나 자주 묻고,
 * 무엇을 «방금 끝났다»고 알리는지(lib/publish/progress.ts) + 목록 한 줄의 진행 칸(lib/publish/list-item.ts).
 * 실행: node scripts/test-publish-progress.ts  (Node 24 타입 스트리핑)
 */
import {
  DUE_WATCH_MS,
  MAX_WATCH,
  PROGRESS_FAST_MS,
  PROGRESS_SLOW_MS,
  STALLED_AFTER_MS,
  dueNow,
  elapsedLabel,
  inProgress,
  markPublishing,
  mergeProgress,
  nextWatchAt,
  pinInProgress,
  pollDelayMs,
  settledPosts,
  stalled,
  watchIds,
} from "../lib/publish/progress.ts";
import { toListItem, type ListPostRow } from "../lib/publish/list-item.ts";
import type { PublishListItem } from "../lib/types.ts";

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

const NOW = Date.parse("2026-09-12T05:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const item = (o: Partial<PublishListItem> & { id: string }): PublishListItem => ({
  caption: "글",
  channel: "instagram",
  status: "scheduled",
  display_status: o.status ?? "scheduled",
  scheduled_at: iso(NOW + 3600_000),
  published_at: null,
  display_at: o.scheduled_at ?? iso(NOW + 3600_000),
  error: null,
  permalink: null,
  thumb_url: null,
  media_count: 1,
  has_video: false,
  ig_surface: "feed",
  media_purged: false,
  can_cancel: true,
  publish_attempted: false,
  account_handle: "@shop",
  account_previous: false,
  progress_since: null,
  run_started_at: null,
  ...o,
});

console.log("진행 중으로 보이는가·예약 시각이 막 지났는가");
{
  check("올리는 중 → 진행 중", inProgress(item({ id: "a", status: "publishing" })));
  check("처리 중 → 진행 중", inProgress(item({ id: "a", status: "processing" })));
  check(
    "미리 준비 중인 예약 영상(processing, 보이는 건 예약됨) → 진행 중 아님",
    !inProgress(item({ id: "a", status: "processing", display_status: "scheduled" })),
  );
  check("예약됨 → 진행 중 아님", !inProgress(item({ id: "a" })));
  check("예약 시각이 3분 지남 → 막 지남", dueNow(item({ id: "a", scheduled_at: iso(NOW - 3 * 60_000) }), NOW));
  check("예약 시각 30초 전 → 막 지남(1분 앞부터 본다)", dueNow(item({ id: "a", scheduled_at: iso(NOW + 30_000) }), NOW));
  check("예약 시각이 한 시간 뒤 → 아님", !dueNow(item({ id: "a", scheduled_at: iso(NOW + 3600_000) }), NOW));
  check("예약 시각이 창보다 오래 지남 → 아님(끝없이 묻지 않는다)", !dueNow(item({ id: "a", scheduled_at: iso(NOW - DUE_WATCH_MS - 60_000) }), NOW));
  check("실패 글 → 아님", !dueNow(item({ id: "a", status: "failed", display_status: "failed", scheduled_at: iso(NOW - 60_000) }), NOW));
}

console.log("무엇을 따라 보나(watchIds)");
{
  const list = [
    item({ id: "due", scheduled_at: iso(NOW - 60_000) }),
    item({ id: "future" }),
    item({ id: "pub", status: "publishing" }),
    item({ id: "proc", status: "processing" }),
    item({ id: "done", status: "published", display_status: "published" }),
    item({ id: "draft", status: "draft", display_status: "draft", scheduled_at: iso(NOW - 60_000) }),
  ];
  const ids = watchIds(list, NOW);
  check("진행 중이 먼저, 그다음 막 지난 예약", JSON.stringify(ids) === JSON.stringify(["pub", "proc", "due"]), ids);
  check("빼 둔 글(gone)은 묻지 않는다", !watchIds(list, NOW, new Set(["pub"])).includes("pub"));
  const many = Array.from({ length: MAX_WATCH + 5 }, (_, i) => item({ id: `p${i}`, status: "publishing" }));
  check(`상한 ${MAX_WATCH}개`, watchIds(many, NOW).length === MAX_WATCH);
  check("따라 볼 것 없음 → 빈 목록", watchIds([item({ id: "x" })], NOW).length === 0);
}

console.log("얼마나 자주(pollDelayMs)·멈춘 것 같은가(stalled)");
{
  const fresh = item({ id: "a", status: "publishing", run_started_at: iso(NOW - 20_000), progress_since: iso(NOW - 20_000) });
  const old = item({ id: "b", status: "publishing", run_started_at: iso(NOW - STALLED_AFTER_MS - 1000), progress_since: iso(NOW - 3600_000) });
  const proc = item({ id: "c", status: "processing", progress_since: iso(NOW - 10 * 60_000) });
  check("서버가 지금 올리는 중 → 4초", pollDelayMs([fresh], NOW) === PROGRESS_FAST_MS);
  check("처리 중 → 4초(크론이 끝내는 순간을 곧바로)", pollDelayMs([proc], NOW) === PROGRESS_FAST_MS);
  check("멈춘 것 같은 실행만 → 10초(빨리 물어도 소용없다)", pollDelayMs([old], NOW) === PROGRESS_SLOW_MS);
  check(
    "예약 시각이 막 지난 글만 → 10초",
    pollDelayMs([item({ id: "due", scheduled_at: iso(NOW - 60_000) })], NOW) === PROGRESS_SLOW_MS,
  );
  check(
    "미리 준비 중인 예약 영상(processing 이지만 예약됨으로 보임)은 빠르게 묻지 않는다",
    pollDelayMs([item({ id: "prep", status: "processing", display_status: "scheduled" })], NOW) === PROGRESS_SLOW_MS,
  );
  check("선점한 지 3분 넘은 publishing → 멈춤", stalled(old, NOW));
  check("20초 된 publishing → 멈춤 아님", !stalled(fresh, NOW));
  check("처리 중은 멈춤으로 보지 않는다(크론이 이어 본다)", !stalled(proc, NOW));
  check(
    "선점 시각을 모르면 발행 시각으로 본다",
    stalled(item({ id: "d", status: "publishing", run_started_at: null, progress_since: iso(NOW - 10 * 60_000) }), NOW),
  );
}

console.log("합치기(mergeProgress)");
{
  const prev = [item({ id: "a", status: "publishing", thumb_url: "https://x/t.jpg" }), item({ id: "b" })];
  const fresh = [item({ id: "a", status: "published", display_status: "published", thumb_url: null, permalink: "https://www.instagram.com/p/1/" })];
  const next = mergeProgress(prev, fresh);
  check("상태가 바뀐다", next[0].status === "published" && next[0].permalink === "https://www.instagram.com/p/1/");
  check("조회가 서명하지 않은 썸네일은 원래 것을 둔다", next[0].thumb_url === "https://x/t.jpg");
  check("안 물어본 글은 그대로", next[1] === prev[1]);
  check("목록에 없는 글은 더하지 않는다", mergeProgress(prev, [item({ id: "zzz" })]).length === 2);
  const same = mergeProgress(prev, [{ ...prev[0], thumb_url: null }]);
  check("바뀐 게 없으면 같은 배열(다시 그리지 않는다)", same === prev);
  check("빈 결과 → 같은 배열", mergeProgress(prev, []) === prev);
}

console.log("방금 끝났나(settledPosts)");
{
  const pub = item({ id: "a", status: "publishing" });
  const proc = item({ id: "b", status: "processing" });
  const due = item({ id: "c", scheduled_at: iso(NOW - 60_000) });
  const future = item({ id: "d" });
  const prev = [pub, proc, due, future];
  const s1 = settledPosts(prev, [{ ...pub, status: "published", display_status: "published" }], NOW);
  check("올리는 중 → 발행 완료 = 올라갔다", s1.length === 1 && s1[0].outcome === "published", s1);
  const s2 = settledPosts(prev, [{ ...proc, status: "failed", display_status: "failed", error: "거절" }], NOW);
  check("처리 중 → 실패 = 못 올렸다", s2.length === 1 && s2[0].outcome === "failed");
  const s3 = settledPosts(prev, [{ ...pub, status: "scheduled", display_status: "scheduled" }], NOW);
  check("올리는 중 → 다시 예약됨 = 곧 다시(엔진 released)", s3.length === 1 && s3[0].outcome === "released");
  const s4 = settledPosts(prev, [{ ...pub, status: "processing", display_status: "processing" }], NOW);
  check("올리는 중 → 처리 중 = 아직 진행 중(알리지 않는다)", s4.length === 0);
  const s5 = settledPosts(prev, [{ ...proc, status: "canceled", display_status: "canceled" }], NOW);
  check("취소는 사람이 한 일 — 알리지 않는다", s5.length === 0);
  const s6 = settledPosts(prev, [{ ...due, status: "published", display_status: "published" }], NOW);
  check("예약 시각이 막 지난 글 → 발행 완료 = 올라갔다", s6.length === 1 && s6[0].outcome === "published");
  const s7 = settledPosts(prev, [{ ...future, status: "published", display_status: "published" }], NOW);
  check("따라 보지 않던 글은 알리지 않는다", s7.length === 0);
  const s8 = settledPosts(prev, [{ ...due }], NOW);
  check("막 지난 예약이 그대로 예약됨 → 아무 일 없음(released 아님)", s8.length === 0);
  const s9 = settledPosts([{ ...pub, status: "published", display_status: "published" }], [{ ...pub, status: "published", display_status: "published" }], NOW);
  check("이미 끝난 글은 다시 알리지 않는다", s9.length === 0);
}

console.log("경과(elapsedLabel)");
{
  check("30초 → 방금 시작", elapsedLabel(iso(NOW - 30_000), NOW) === "방금 시작");
  check("3분 → 3분째", elapsedLabel(iso(NOW - 3 * 60_000 - 5_000), NOW) === "3분째");
  check("2시간 → 2시간째", elapsedLabel(iso(NOW - 2 * 3600_000 - 60_000), NOW) === "2시간째");
  check("모름 → 방금 시작", elapsedLabel(null, NOW) === "방금 시작");
  check("시계가 어긋나 미래 → 방금 시작", elapsedLabel(iso(NOW + 60_000), NOW) === "방금 시작");
}

console.log("맨 위로(pinInProgress)·누른 순간(markPublishing)·다음에 깨어날 때(nextWatchAt)");
{
  const list = [item({ id: "f1" }), item({ id: "p1", status: "publishing" }), item({ id: "f2" }), item({ id: "q1", status: "processing" })];
  const pinned = pinInProgress(list);
  check("진행 중이 맨 위, 나머지 순서는 그대로", pinned.map((p) => p.id).join(",") === "p1,q1,f1,f2", pinned.map((p) => p.id));
  const calm = [item({ id: "f1" }), item({ id: "f2" })];
  check("진행 중이 없으면 같은 배열", pinInProgress(calm) === calm);
  const m = markPublishing(item({ id: "x", status: "failed", display_status: "failed", error: "옛 오류", can_cancel: false }), iso(NOW));
  check(
    "누른 순간 → 올리는 중·취소 불가·오류 지움·경과 기준 = 지금",
    m.status === "publishing" && m.display_status === "publishing" && !m.can_cancel && m.error === null && m.progress_since === iso(NOW),
    m,
  );
  const soon = [item({ id: "a", scheduled_at: iso(NOW + 10 * 60_000) }), item({ id: "b", scheduled_at: iso(NOW + 5 * 60_000) })];
  check("가장 이른 예약의 1분 전에 깨어난다", nextWatchAt(soon, NOW) === NOW + 4 * 60_000, nextWatchAt(soon, NOW));
  check("한 시간 넘게 남은 예약뿐 → 깨어나지 않는다", nextWatchAt([item({ id: "a", scheduled_at: iso(NOW + 2 * 3600_000) })], NOW) === null);
  check("이미 창 안(1분 안) → 타이머 필요 없음", nextWatchAt([item({ id: "a", scheduled_at: iso(NOW + 30_000) })], NOW) === null);
}

console.log("목록 한 줄의 진행 칸(toListItem)");
{
  const base: ListPostRow = {
    id: "p1",
    user_id: "u1",
    caption: "글",
    channel: "instagram",
    image_urls: null,
    media: [{ kind: "image", path: "u1/a.jpg" }],
    ig_surface: "feed",
    scheduled_at: "2026-09-12T04:50:00Z",
    published_at: null,
    publish_after: "2026-09-12T04:58:00Z",
    publish_attempted_at: null,
    status: "publishing",
    error: null,
    permalink: null,
    media_purged_at: null,
    claimed_at: "2026-09-12T04:59:30Z",
  };
  const a = toListItem(base, null, NOW);
  check("올리는 중 → 경과 기준 = 발행 시각(누른 시각)", a.progress_since === "2026-09-12T04:58:00Z", a.progress_since);
  check("올리는 중 → 이번 실행 시작 = 선점 시각", a.run_started_at === "2026-09-12T04:59:30Z", a.run_started_at);
  const b = toListItem({ ...base, status: "processing" }, null, NOW);
  check("처리 중 → 경과 기준 있음, 실행 시작은 없음", b.progress_since === "2026-09-12T04:58:00Z" && b.run_started_at === null, b);
  const c = toListItem({ ...base, status: "processing", publish_after: "2026-09-12T06:00:00Z" }, null, NOW);
  check("미리 준비 중인 예약 영상 → 진행 칸 없음(«예약됨»)", c.display_status === "scheduled" && c.progress_since === null, c);
  const d = toListItem({ ...base, status: "scheduled", publish_after: null }, null, NOW);
  check("예약됨 → 진행 칸 없음", d.progress_since === null && d.run_started_at === null);
  const e = toListItem({ ...base, publish_after: null, claimed_at: undefined }, null, NOW);
  check("옛 행(발행 시각·선점 시각 없음) → 예약 시각으로", e.progress_since === "2026-09-12T04:50:00Z" && e.run_started_at === null, e);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
