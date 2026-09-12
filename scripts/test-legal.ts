/**
 * 약관·방침 동의 규칙 검증 — 날짜 불변식·게이트 일정·루프 없음·즉시 삭제 창·댓글 가림·일할 환불 계산.
 * 실행: node scripts/test-legal.ts  (Node 24 타입 스트리핑)
 *
 * 2026-09-12 점검 반영(docs/LEGAL_REVIEW_2026-09.md): 날짜를 잘못 바꾸면 전원이 동의 화면 루프에 갇히는 경로,
 * 0079 전 가입자의 한 번 클릭 삭제, 이메일 반쪽 가림, 환불정책 계산 예시와 실제 환불 계산의 일치.
 */
import {
  CURRENT_VERSIONS,
  FIRST_RECORDED_PRIVACY_VERSION,
  PREVIOUS_TERMS_VERSION,
  PRIVACY_MIN_ACCEPTED,
  PRIVACY_VERSION,
  TERMS_ANNOUNCED,
  TERMS_MIN_ACCEPTED,
  TERMS_VERSION,
  evaluateConsent,
  kstMidnightMs,
  todayKst,
  versionInvariantProblems,
} from "../lib/legal/versions.ts";
import { QUICK_DECLINE_WINDOW_MS, canQuickDecline } from "../lib/legal/quick-decline.ts";
import { maskCommentForAi } from "../lib/ai/mask-comment.ts";
import { proratedRemaining } from "../lib/billing/prorate.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => todayKst(new Date(kstMidnightMs(iso) + n * DAY + 12 * 3_600_000));

console.log("\n날짜 (2026-09-12 사장님 지시: 게시 9/12, 방침 시행 9/12, 약관 시행 9/22)");
check("약관 공고일 = 2026-09-12", TERMS_ANNOUNCED === "2026-09-12");
check("방침 시행일 = 2026-09-12", PRIVACY_VERSION === "2026-09-12");
check("약관 시행일 = 2026-09-22", TERMS_VERSION === "2026-09-22");
check("게이트 날짜 = 약관 시행일", TERMS_MIN_ACCEPTED === TERMS_VERSION);
check("공고 기간 10일(≥ 7일)", Math.round((kstMidnightMs(TERMS_VERSION) - kstMidnightMs(TERMS_ANNOUNCED)) / DAY) === 10);

console.log("\n불변식");
check("현재 값은 불변식을 모두 지킨다", versionInvariantProblems().length === 0, versionInvariantProblems());
check(
  "게이트 기준이 동의 화면이 적는 값보다 크면 잡는다(루프)",
  versionInvariantProblems({ ...CURRENT_VERSIONS, TERMS_VERSION: "2026-09-20", TERMS_ANNOUNCED: "2026-09-12", TERMS_MIN_ACCEPTED: "2026-09-22" }).length > 0,
);
check(
  "방침 기준을 최초 기록 버전보다 올리면 잡는다(재동의 화면은 방침을 안 적는다)",
  versionInvariantProblems({ ...CURRENT_VERSIONS, PRIVACY_MIN_ACCEPTED: "2026-09-12" }).length > 0,
);
check(
  "방침 기준이 현행 방침보다 크면 잡는다",
  versionInvariantProblems({ ...CURRENT_VERSIONS, PRIVACY_VERSION: "2026-07-10", PREVIOUS_PRIVACY_VERSION: "2026-07-01" }).length > 0,
);
check(
  "공고 기간 7일 미만이면 잡는다",
  versionInvariantProblems({ ...CURRENT_VERSIONS, TERMS_ANNOUNCED: "2026-09-16" }).length > 0,
);
check("공고 기간 정확히 7일은 통과", versionInvariantProblems({ ...CURRENT_VERSIONS, TERMS_ANNOUNCED: "2026-09-15" }).length === 0);
check("날짜 모양이 틀리면 잡는다", versionInvariantProblems({ ...CURRENT_VERSIONS, TERMS_VERSION: "2026-9-22" }).length > 0);

console.log("\n게이트 일정 — 기존 회원(옛 약관·옛 방침)");
const old = { termsVersion: PREVIOUS_TERMS_VERSION, privacyVersion: FIRST_RECORDED_PRIVACY_VERSION };
check("기록 없음 → missing(첫 가입)", evaluateConsent(null, "2026-09-12") === "missing");
check("9/12 배포일 → pending(띠만)", evaluateConsent(old, "2026-09-12") === "pending");
check("9/21 → pending", evaluateConsent(old, "2026-09-21") === "pending");
check("9/22 → missing(동의 화면)", evaluateConsent(old, "2026-09-22") === "missing");
check("9/12 KST 자정 직전(9/11 14:59:59Z) → 2026-09-11", todayKst(new Date("2026-09-11T14:59:59Z")) === "2026-09-11");
check("9/22 KST 자정(9/21 15:00Z) → 2026-09-22", todayKst(new Date("2026-09-21T15:00:00Z")) === "2026-09-22");
check("9/22 KST 자정 직전(9/21 14:59:59Z) → 2026-09-21", todayKst(new Date("2026-09-21T14:59:59Z")) === "2026-09-21");
check("kstMidnightMs(9/22) = 9/21 15:00Z", kstMidnightMs("2026-09-22") === Date.parse("2026-09-21T15:00:00Z"));

console.log("\n루프 없음 — 동의 화면이 적는 값은 어느 날에도 ok 여야 한다");
const signup = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };
const reconsent = { termsVersion: TERMS_VERSION, privacyVersion: FIRST_RECORDED_PRIVACY_VERSION };
let loopFree = true;
const bad: string[] = [];
for (let i = -3; i <= 400; i++) {
  const day = addDays(TERMS_ANNOUNCED, i);
  if (evaluateConsent(signup, day) !== "ok" || evaluateConsent(reconsent, day) !== "ok") {
    loopFree = false;
    bad.push(day);
  }
}
check("가입(약관·방침 현행) 기록은 공고 3일 전~400일 뒤 모두 ok", loopFree, bad.slice(0, 3));
check("재동의(약관만 현행, 방침은 최초 기록) 기록도 ok", evaluateConsent(reconsent, "2026-12-31") === "ok");
check("방침 기준 = 최초 기록 버전", PRIVACY_MIN_ACCEPTED === FIRST_RECORDED_PRIVACY_VERSION);

console.log("\n확인 없는 즉시 삭제 창(24시간)");
const now = Date.parse("2026-09-12T03:00:00Z");
check("방금 가입 → 보인다", canQuickDecline(new Date(now - 60_000).toISOString(), now));
check("23시간 전 가입 → 보인다", canQuickDecline(new Date(now - 23 * 3_600_000).toISOString(), now));
check("25시간 전 가입 → 안 보인다", !canQuickDecline(new Date(now - 25 * 3_600_000).toISOString(), now));
check("0079 전(2026-08-20) 가입 → 안 보인다", !canQuickDecline("2026-08-20T01:02:03.456789Z", now));
check("마이크로초 시각 문자열도 읽는다", canQuickDecline("2026-09-12T02:59:00.123456+00:00", now));
check("만든 시각을 못 읽으면 → 안 보인다", !canQuickDecline(undefined, now) && !canQuickDecline("", now) && !canQuickDecline("not-a-date", now));
check("창 = 24시간", QUICK_DECLINE_WINDOW_MS === DAY);

console.log("\nAI 로 보내는 댓글 가림");
const cases: Array<[string, string]> = [
  ["hong.gildong@naver.com 으로 연락주세요", "[이메일] 으로 연락주세요"],
  ["@friend_1 이거 봐", "@사용자 이거 봐"],
  ["안녕@user", "안녕@사용자"],
  ["@user님 최고", "@사용자님 최고"],
  ["@@user", "@@사용자"],
  ["메일 a.b+c@gmail 로", "메일 [이메일] 로"],
  ["좋아요 👍", "좋아요 👍"],
];
for (const [input, want] of cases) {
  const got = maskCommentForAi(input);
  check(`«${input}» → «${want}»`, got === want, got);
}
check("이메일 앞부분이 남지 않는다", !maskCommentForAi("hong.gildong@naver.com").includes("hong"));

console.log("\n일할 환불 — 환불정책 계산 예시와 같은 식");
const end = new Date("2026-10-01T00:00:00Z");
const tenth = proratedRemaining(9_900, end, new Date("2026-09-10T12:00:00Z"));
check("30일 달 10일째 → 남은 20일", tenth.remainingDays === 20 && tenth.cycleDays === 30, tenth);
check("Creator 9,900원 → 6,600원(예시와 같음)", tenth.refund === 6_600, tenth);
check("기간이 끝났으면 0원", proratedRemaining(9_900, end, new Date("2026-10-02T00:00:00Z")).refund === 0);
check("결제 당일 → 남은 날은 기간을 넘지 않는다", proratedRemaining(29_000, end, new Date("2026-09-01T00:00:00Z")).remainingDays === 30);
check("금액이 이상하면 0원", proratedRemaining(Number.NaN, end, new Date("2026-09-10T00:00:00Z")).refund === 0);

console.log(`\n${pass} 통과 · ${fail} 실패`);
if (fail > 0) process.exit(1);
