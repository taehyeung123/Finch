/**
 * 발행 엔진 판단부(nextStep) 표 검증 — 특히 «두 번 올리지 않기».
 * 실행: node scripts/test-publish-engine.ts  (Node 24 타입 스트리핑)
 */
import {
  ATTEMPT_GIVE_UP_MS,
  CONTAINER_MAX_AGE_MS,
  LOOKUP_GRACE_MS,
  PUBLISH_MIN_REMAINING_MS,
  captionKey,
  containerWindow,
  matchRecentMedia,
  nextStep,
  processingDeadlineFor,
  type EngineFacts,
  type EngineStep,
} from "../lib/publish/engine-core.ts";

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

const NOW = Date.parse("2026-09-11T12:00:00Z");
const base = (o: Partial<EngineFacts> = {}): EngineFacts => ({
  source: "due",
  nowMs: NOW,
  publishAfterMs: NOW - 60_000,
  carousel: false,
  childIds: null,
  childStates: null,
  containerId: null,
  containerState: null,
  containerCreatedAtMs: null,
  deadlineMs: null,
  publishAttemptedAtMs: null,
  publishCalls: 0,
  lookup: null,
  ownerMismatch: false,
  remainingMs: 60_000,
  ...o,
});
const is = (s: EngineStep, d: EngineStep["do"]) => s.do === d;
const neverPublish = (f: EngineFacts) => nextStep(f).do !== "publish";

console.log("새 글 흐름");
check("단일 — 준비물 없음 → 만들기", is(nextStep(base()), "create_container"));
check("단일 — 만든 뒤 → 상태 읽기", is(nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW })), "check_container"));
check(
  "단일 — FINISHED → 발행",
  is(nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW, containerState: "FINISHED" })), "publish"),
);
{
  const s = nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW, containerState: "IN_PROGRESS", deadlineMs: NOW + 60_000 }));
  check("단일 — IN_PROGRESS → 기다림(processing)", s.do === "wait" && s.reason === "processing", s);
}
check("캐러셀 — 아이템 없음 → 아이템 만들기", is(nextStep(base({ carousel: true })), "create_children"));
check("캐러셀 — 아이템 있음 → 아이템 상태 읽기", is(nextStep(base({ carousel: true, childIds: ["a", "b"], containerCreatedAtMs: NOW })), "check_children"));
check(
  "캐러셀 — 아이템 전부 FINISHED → 부모 만들기",
  is(nextStep(base({ carousel: true, childIds: ["a", "b"], childStates: ["FINISHED", "FINISHED"], containerCreatedAtMs: NOW })), "create_container"),
);
{
  const s = nextStep(
    base({ carousel: true, childIds: ["a", "b"], childStates: ["FINISHED", "IN_PROGRESS"], containerCreatedAtMs: NOW, deadlineMs: NOW + 1 }),
  );
  check("캐러셀 — 아이템 하나 IN_PROGRESS → 기다림(부모를 먼저 만들지 않는다)", s.do === "wait", s);
}
{
  const s = nextStep(base({ carousel: true, childIds: ["a", "b"], childStates: ["FINISHED", "ERROR"], containerCreatedAtMs: NOW }));
  check("(g) 아이템 하나 ERROR → 실패(새로 만들기)", s.do === "fail" && s.code === "CONTAINER_ERROR" && s.recreate === true, s);
}
check(
  "캐러셀 — 부모 있음 → 부모 상태 읽기",
  is(nextStep(base({ carousel: true, childIds: ["a", "b"], containerId: "p", containerCreatedAtMs: NOW })), "check_container"),
);
check("스레드 글 전용도 단일과 같다(준비물 없음 → 만들기)", is(nextStep(base({ source: "now" })), "create_container"));

console.log("두 번 올리지 않기");
check(
  "(a) PUBLISHED → 기록만, 발행 안 함",
  is(nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW, containerState: "PUBLISHED" })), "record_published"),
);
check(
  "(a') 시도 후 PUBLISHED → 기록만",
  is(nextStep(base({ containerId: "c1", containerState: "PUBLISHED", publishAttemptedAtMs: NOW - 10_000, publishCalls: 1 })), "record_published"),
);
check(
  "(b) 시도 후 FINISHED → 먼저 찾아본다(lookup)",
  is(nextStep(base({ containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - 10_000, publishCalls: 1 })), "lookup"),
);
check(
  "(b') 시도 후 상태 모름 → 먼저 상태 읽기",
  is(nextStep(base({ containerId: "c1", publishAttemptedAtMs: NOW - 10_000, publishCalls: 1 })), "check_container"),
);
check(
  "시도 후 목록에서 찾음 → 기록만",
  is(nextStep(base({ containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - 10_000, publishCalls: 1, lookup: "found" })), "record_published"),
);
{
  const s = nextStep(base({ containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - 60_000, publishCalls: 1, lookup: "not_found" }));
  check("(c) 못 찾음 + 5분 안 → 기다림(lookup_grace)", s.do === "wait" && s.reason === "lookup_grace", s);
}
check(
  "(c') 못 찾음 + 5분 지남 + 1번 호출 + FINISHED → 두 번째 발행",
  is(
    nextStep(
      base({ containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - LOOKUP_GRACE_MS - 1, publishCalls: 1, lookup: "not_found" }),
    ),
    "publish",
  ),
);
{
  const s = nextStep(
    base({ containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - LOOKUP_GRACE_MS - 1, publishCalls: 2, lookup: "not_found" }),
  );
  check("(d) 호출 2번 → 모름으로 멈춤(fail ambiguous, 준비물 유지)", s.do === "fail" && s.code === "PUBLISH_AMBIGUOUS" && !s.recreate, s);
}
{
  const s = nextStep(base({ containerId: "c1", containerState: "ERROR", publishAttemptedAtMs: NOW - LOOKUP_GRACE_MS - 1, publishCalls: 1, lookup: "not_found" }));
  check("시도 후 ERROR → 모름(새로 만들지 않는다)", s.do === "fail" && s.code === "PUBLISH_AMBIGUOUS" && !s.recreate, s);
}
{
  const s = nextStep(base({ containerId: "c1", containerState: "UNKNOWN", publishAttemptedAtMs: NOW - LOOKUP_GRACE_MS - 1, publishCalls: 1, lookup: "not_found" }));
  check("시도 후 상태 못 읽음 → 조금 더 기다림", s.do === "wait" && s.reason === "processing", s);
}
{
  const s = nextStep(
    base({ containerId: "c1", containerState: "UNKNOWN", publishAttemptedAtMs: NOW - ATTEMPT_GIVE_UP_MS - 1, publishCalls: 1, lookup: "not_found" }),
  );
  check("시도 후 30분 넘게 못 읽음 → 모름으로 멈춤", s.do === "fail" && s.code === "PUBLISH_AMBIGUOUS", s);
}
check(
  "시도 기록 + 계정 바뀜 → reset 하지 않는다(찾아본다)",
  is(
    nextStep(base({ containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - 10_000, publishCalls: 1, ownerMismatch: true })),
    "lookup",
  ),
);
check(
  "시도 기록 + 준비물 23시간 넘음 → reset 하지 않는다",
  neverPublish(
    base({ containerId: "c1", containerCreatedAtMs: NOW - CONTAINER_MAX_AGE_MS - 1, publishAttemptedAtMs: NOW - 10_000, publishCalls: 1 }),
  ) && nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW - CONTAINER_MAX_AGE_MS - 1, publishAttemptedAtMs: NOW - 10_000, publishCalls: 1 })).do !== "reset",
);
{
  /* 낡은 사본 문제(2026-09-11 점검): 크론이 조회한 사본엔 시도 기록이 없어도, 엔진은 선점이 돌려준 DB 값을 받는다.
     DB 값(시도함)으로 판단하면 lookup 으로 가야 한다 — 절대 publish 가 아니다. */
  const fromDb = base({ source: "check", containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - 30_000, publishCalls: 1 });
  check("낡은 사본 대신 선점 값(시도함) → lookup, 발행 아님", nextStep(fromDb).do === "lookup");
}
{
  const s = nextStep(base({ containerId: null, publishAttemptedAtMs: NOW - 10_000, publishCalls: 1 }));
  check("시도 기록인데 준비물 id 없음 → 모름", s.do === "fail" && s.code === "PUBLISH_AMBIGUOUS", s);
}

console.log("발행 시각(publish_after)");
{
  const s = nextStep(base({ source: "prepare", publishAfterMs: NOW + 15 * 60_000, containerId: "c1", containerCreatedAtMs: NOW, containerState: "FINISHED" }));
  check("(e) 미리 만들기 + FINISHED → 예약 시각까지 기다림", s.do === "wait" && s.reason === "not_before" && s.untilMs === NOW + 15 * 60_000, s);
}
check(
  "(e') 미리 만들기는 예약 시각이 지나도 발행하지 않는다",
  neverPublish(base({ source: "prepare", publishAfterMs: NOW - 1, containerId: "c1", containerCreatedAtMs: NOW, containerState: "FINISHED" })),
);
{
  const s = nextStep(base({ source: "check", publishAfterMs: NOW + 5 * 60_000, containerId: "c1", containerCreatedAtMs: NOW, containerState: "FINISHED" }));
  check("매분 확인도 예약 시각 전엔 발행하지 않는다", s.do === "wait" && s.reason === "not_before", s);
}
check(
  "「지금 발행」이 준비된 행의 발행 시각을 지금으로 당기면 바로 발행",
  is(nextStep(base({ source: "now", publishAfterMs: NOW, containerId: "c1", containerCreatedAtMs: NOW - 600_000, containerState: "FINISHED" })), "publish"),
);
{
  const s = nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW, containerState: "FINISHED", remainingMs: PUBLISH_MIN_REMAINING_MS - 1 }));
  check("시간이 15초 미만 → 발행 호출을 시작하지 않는다(budget)", s.do === "wait" && s.reason === "budget", s);
}

console.log("준비물 수명·계정·마감");
check(
  "(f) 준비물 23시간 넘음(시도 전) → reset",
  is(nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW - CONTAINER_MAX_AGE_MS - 1 })), "reset"),
);
check("준비물 EXPIRED(시도 전) → reset", is(nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW, containerState: "EXPIRED" })), "reset"));
check("다른 계정으로 다시 연결(시도 전) → reset", is(nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW, ownerMismatch: true })), "reset"));
{
  const s = nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW - 3_600_000, containerState: "IN_PROGRESS", deadlineMs: NOW - 1 }));
  check("(h) 마감 지남 + IN_PROGRESS → 실패(준비물 유지)", s.do === "fail" && s.code === "PROCESSING_TIMEOUT" && s.recreate === false, s);
}
{
  const s = nextStep(base({ containerId: "c1", containerCreatedAtMs: NOW, containerState: "ERROR" }));
  check("준비물 ERROR(시도 전) → 실패(새로 만들기)", s.do === "fail" && s.code === "CONTAINER_ERROR" && s.recreate, s);
}
{
  const s = nextStep(base({ source: "check" }));
  check("(i) 매분 확인인데 준비물 없음 → 실패(lost)", s.do === "fail" && s.code === "LOST", s);
}

console.log("도우미");
check("처리 마감 — 사진만 10분", processingDeadlineFor(NOW, [{ kind: "image", durationMs: null }]) === NOW + 10 * 60_000);
check("처리 마감 — 30초 영상 21분", processingDeadlineFor(NOW, [{ kind: "video", durationMs: 30_000 }]) === NOW + 21 * 60_000);
check("처리 마감 — 15분 영상 50분", processingDeadlineFor(NOW, [{ kind: "video", durationMs: 15 * 60_000 }]) === NOW + 50 * 60_000);
check("처리 마감 — 상한 60분", processingDeadlineFor(NOW, [{ kind: "video", durationMs: 15 * 60_000 }, { kind: "video", durationMs: 15 * 60_000 }]) === NOW + 60 * 60_000);
{
  let w = containerWindow(NOW, null, 0);
  check("준비물 예산 — 첫 묶음 허용", w.allowed && w.count === 1);
  w = containerWindow(NOW + 1000, w.windowAtMs, w.count);
  w = containerWindow(NOW + 2000, w.windowAtMs, w.count);
  check("준비물 예산 — 세 번째까지 허용", w.allowed && w.count === 3);
  const fourth = containerWindow(NOW + 3000, w.windowAtMs, w.count);
  check("준비물 예산 — 네 번째 거절", !fourth.allowed);
  const nextDay = containerWindow(NOW + 24 * 3600_000, w.windowAtMs, w.count);
  check("준비물 예산 — 24시간 뒤 새 창", nextDay.allowed && nextDay.count === 1);
}
{
  const recent = [
    { id: "old", caption: "가을 신상", timestamp: new Date(NOW - 3_600_000).toISOString() },
    { id: "other", caption: "다른 글", timestamp: new Date(NOW - 30_000).toISOString() },
    { id: "mine", caption: "가을  신상\n공구 오픈", timestamp: new Date(NOW - 20_000).toISOString() },
  ];
  check("최근 게시물 — 글·시각이 맞는 것만 찾는다", matchRecentMedia(recent, { sinceMs: NOW - 60_000, caption: "가을 신상 공구 오픈" })?.id === "mine");
  check("최근 게시물 — 시도 전 것은 무시", matchRecentMedia(recent, { sinceMs: NOW - 60_000, caption: "가을 신상" }) === null);
  check("최근 게시물 — 글이 비면 판정하지 않는다(null)", matchRecentMedia(recent, { sinceMs: NOW - 60_000, caption: "" }) === null);
  check("글 정규화 — 공백 한 칸", captionKey("  a \n\t b ") === "a b");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
