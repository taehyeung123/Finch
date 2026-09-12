/**
 * 발행 엔진 판단부(nextStep) 표 검증 — 특히 «두 번 올리지 않기».
 * 실행: node scripts/test-publish-engine.ts  (Node 24 타입 스트리핑)
 */
import {
  ATTEMPT_GIVE_UP_MS,
  CONTAINER_MAX_AGE_MS,
  LOOKUP_GRACE_MS,
  PUBLISH_MIN_REMAINING_MS,
  PUBLISH_RETRY_MS,
  captionKey,
  containerWindow,
  isExtendedDeadline,
  matchRecentMedia,
  nextStep,
  processingDeadlineFor,
  publishRetryEndMs,
  type EngineFacts,
  type EngineStep,
} from "../lib/publish/engine-core.ts";
import { PREVIOUS_ACCOUNT_MARKER, targetAccountMismatch } from "../lib/publish/account-core.ts";

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
  deadlineExtended: false,
  publishAttemptedAtMs: null,
  publishCalls: 0,
  lookup: null,
  ownerMismatch: false,
  targetMismatch: false,
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

console.log("처리 창 — 마감을 넘긴 글의 «다시 시도»(2026-09-12 점검)");
{
  /* 15분 릴스: 첫 창 = 만든 시각 + 50분. 55분째에 끝나는 경우 */
  const reel = [{ kind: "video", durationMs: 15 * 60_000 }];
  const created = NOW - 51 * 60_000;
  const first = processingDeadlineFor(created, reel);
  check("첫 창은 «늘린 창»이 아니다", !isExtendedDeadline(created, first, reel));
  const timedOut = nextStep(base({ source: "check", containerId: "c1", containerCreatedAtMs: created, containerState: "IN_PROGRESS", deadlineMs: first }));
  check("51분째 IN_PROGRESS → 처리 시간 초과(준비물 유지)", timedOut.do === "fail" && timedOut.code === "PROCESSING_TIMEOUT" && !timedOut.recreate, timedOut);

  /* 다시 시도 — run.ts 는 비워 둔 마감 대신 지금부터 새 창을 연다 */
  const reopened = processingDeadlineFor(NOW, reel);
  check("다시 연 창은 «늘린 창»이다", isExtendedDeadline(created, reopened, reel));
  const retry = base({
    source: "now",
    publishAfterMs: NOW,
    containerId: "c1",
    containerCreatedAtMs: created,
    containerState: "IN_PROGRESS",
    deadlineMs: reopened,
    deadlineExtended: true,
  });
  const s1 = nextStep(retry);
  check("다시 시도 + 아직 IN_PROGRESS → 곧바로 또 실패하지 않고 기다린다", s1.do === "wait" && s1.reason === "processing", s1);
  check("다시 시도 + 그사이 FINISHED → 같은 준비물로 발행(새로 만들지 않는다)", is(nextStep({ ...retry, containerState: "FINISHED" }), "publish"));
  const s2 = nextStep({ ...retry, nowMs: reopened + 1 });
  check("다시 연 창마저 넘김 → 실패 + 준비물 버림(다음 시도가 새로 만든다)", s2.do === "fail" && s2.code === "PROCESSING_TIMEOUT" && s2.recreate === true, s2);
  const s3 = nextStep(
    base({ carousel: true, childIds: ["a", "b"], childStates: ["FINISHED", "IN_PROGRESS"], containerCreatedAtMs: created, deadlineMs: NOW - 1, deadlineExtended: true }),
  );
  check("캐러셀 아이템도 같다 — 다시 연 창을 넘기면 버림", s3.do === "fail" && s3.code === "PROCESSING_TIMEOUT" && s3.recreate === true, s3);
  check("마감을 모르면 «늘린 창»으로 보지 않는다", !isExtendedDeadline(created, null, reel) && !isExtendedDeadline(null, reopened, reel));
}
{
  /* 준비가 끝났는데 발행이 «잠시 뒤에»로 거절될 때의 끝 */
  check("발행 재시도 끝 — 마감이 늦으면 마감 + 15분", publishRetryEndMs(NOW + 60_000, NOW) === NOW + 60_000 + PUBLISH_RETRY_MS);
  check("발행 재시도 끝 — 미리 만든 예약 영상(마감이 예약 시각보다 이르다)은 예약 시각 + 15분", publishRetryEndMs(NOW - 60_000, NOW) === NOW + PUBLISH_RETRY_MS);
  check("발행 재시도 끝 — 마감을 모르면 발행 시각 + 15분", publishRetryEndMs(null, NOW) === NOW + PUBLISH_RETRY_MS);
}

console.log("대상 계정 — 계정을 바꾸면 옛 예약을 새 계정으로 올리지 않는다(2026-09-12)");
{
  const switched = (s: EngineStep) => s.do === "fail" && s.code === "ACCOUNT_SWITCHED" && s.recreate === false;
  check("시도 전·준비물 없음 → 계정 전환 실패(준비물 버리지 않음)", switched(nextStep(base({ targetMismatch: true }))));
  check(
    "시도 전·준비 끝(FINISHED) → 발행하지 않고 계정 전환 실패",
    switched(nextStep(base({ targetMismatch: true, containerId: "c1", containerCreatedAtMs: NOW, containerState: "FINISHED" }))),
  );
  check(
    "미리 만들기도 같다 — 새 계정으로 준비물을 만들지 않는다",
    switched(nextStep(base({ source: "prepare", publishAfterMs: NOW + 600_000, targetMismatch: true }))),
  );
  check(
    "매분 확인·준비물 없음 → «잃었어요»보다 계정 전환이 먼저",
    switched(nextStep(base({ source: "check", targetMismatch: true }))),
  );
  check(
    "시도 뒤·준비 끝 → 찾아보기(lookup)·두 번째 발행 없이 멈춤(run.ts 가 «올라갔는지 모름»으로 적는다)",
    switched(nextStep(base({ targetMismatch: true, containerId: "c1", containerState: "FINISHED", publishAttemptedAtMs: NOW - 10_000, publishCalls: 1 }))),
  );
  check(
    "시도 뒤·유예 지나 두 번째 발행 차례여도 멈춤",
    switched(
      nextStep(
        base({
          targetMismatch: true,
          containerId: "c1",
          containerState: "FINISHED",
          publishAttemptedAtMs: NOW - LOOKUP_GRACE_MS - 1,
          publishCalls: 1,
          lookup: "not_found",
        }),
      ),
    ),
  );
  check(
    "대상이 맞으면(옛 글·다시 예약한 글) 준비물 계정만 다를 때 → 준비물만 새로 만든다(reset)",
    is(nextStep(base({ targetMismatch: false, ownerMismatch: true, containerId: "c1", containerCreatedAtMs: NOW })), "reset"),
  );

  /* 표 전체 — 대상 계정이 다르면 어떤 사실 조합에서도 메타를 부르는 걸음(만들기·읽기·찾아보기·발행)이 나오지 않는다 */
  const sources = ["now", "due", "prepare", "check"] as const;
  const states = [null, "IN_PROGRESS", "FINISHED", "PUBLISHED", "ERROR", "EXPIRED", "UNKNOWN"] as const;
  const attempts = [null, NOW - 10_000, NOW - LOOKUP_GRACE_MS - 1, NOW - ATTEMPT_GIVE_UP_MS - 1];
  const callSteps = new Set(["create_children", "check_children", "create_container", "check_container", "lookup", "publish", "record_published", "reset"]);
  let combos = 0;
  let bad = 0;
  for (const source of sources) {
    for (const containerState of states) {
      for (const attemptedAt of attempts) {
        for (const carousel of [false, true]) {
          for (const withContainer of [false, true]) {
            combos++;
            const f = base({
              source,
              targetMismatch: true,
              carousel,
              containerId: withContainer ? "c1" : null,
              childIds: carousel && withContainer ? ["a", "b"] : null,
              containerState: withContainer ? containerState : null,
              containerCreatedAtMs: withContainer ? NOW - 60_000 : null,
              publishAttemptedAtMs: attemptedAt,
              publishCalls: attemptedAt === null ? 0 : 1,
              lookup: attemptedAt === null ? null : "not_found",
            });
            if (callSteps.has(nextStep(f).do)) bad++;
          }
        }
      }
    }
  }
  check(`대상 계정이 다르면 ${combos}개 조합 모두 메타를 부르지 않는다`, bad === 0, bad);
}
{
  check("판정 — 대상이 비면(옛 글) 다르지 않다", !targetAccountMismatch(null, "B") && !targetAccountMismatch(undefined, "B") && !targetAccountMismatch("  ", "B"));
  check("판정 — 같은 계정이면 다르지 않다", !targetAccountMismatch("A", "A") && !targetAccountMismatch(" A ", "A"));
  check("판정 — 다른 계정이면 다르다", targetAccountMismatch("A", "B"));
  check("판정 — 이전 계정 표식은 지금 계정이 아니다", targetAccountMismatch(PREVIOUS_ACCOUNT_MARKER, "B"));
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
