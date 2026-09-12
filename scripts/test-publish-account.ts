/**
 * 발행 글의 계정 규칙 검증 — 계정을 바꾸면 옛 예약이 새 계정으로 새지 않고, 목록이 글마다 계정을 말한다(2026-09-12).
 * 실행: node scripts/test-publish-account.ts  (Node 24 타입 스트리핑)
 */
import {
  BACKFILL_LONG_RETRY_MS,
  BACKFILL_RETRY_MS,
  PREVIOUS_ACCOUNT_MARKER,
  classifyMediaRead,
  handleKey,
  isAccountSwitch,
  postAccountView,
  targetAccountMismatch,
  toHandle,
  type CurrentAccount,
} from "../lib/publish/account-core.ts";
import { accountSwitchedError, publishError } from "../lib/meta/publish-errors.ts";
import { toListItem, type ListPostRow } from "../lib/publish/list-item.ts";

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

const A: CurrentAccount = { platformUserId: "111", handle: "@shop_a" };
const B: CurrentAccount = { platformUserId: "222", handle: "@shop_b" };

console.log("계정 바꾸기 판정(연동 콜백)");
check("같은 계정 재연결 → 바꾸기 아님(아무것도 안 바꾼다)", !isAccountSwitch("111", "111"));
check("숫자·문자 섞여도 같은 id 면 바꾸기 아님", !isAccountSwitch(111, "111"));
check("다른 계정 → 바꾸기", isAccountSwitch("111", "222"));
check("옛 id 를 모르면(첫 연결·빈 값) 바꾸기 아님", !isAccountSwitch(null, "222") && !isAccountSwitch("", "222") && !isAccountSwitch(undefined, "222"));

console.log("발행 시점 판정(엔진)");
check("대상이 빈 옛 글 → 지금 계정으로 나간다", !targetAccountMismatch(null, B.platformUserId));
check("대상 = 지금 계정 → 나간다", !targetAccountMismatch("222", B.platformUserId));
check("A 로 예약 → B 로 바꿈 → 나가지 않는다", targetAccountMismatch("111", B.platformUserId));

console.log("목록의 계정 칩");
{
  const v = (status: string, id: string | null, handle: string | null, cur: CurrentAccount | null | undefined) =>
    postAccountView({ status, account_platform_id: id, account_handle: handle }, cur);
  const same = v("published", "222", "@shop_b_old_name", B);
  check("지금 계정의 글 → 지금 이름(그 사이 바꾼 이름)", same.handle === "@shop_b" && !same.previous, same);
  const prev = v("published", "111", "@shop_a", B);
  check("이전 계정의 글 → «@shop_a · 이전 계정»", prev.handle === "@shop_a" && prev.previous, prev);
  const back = v("published", "111", "@shop_a", A);
  check("A 를 다시 연결하면 같은 글이 «@shop_a»(이전 표시 없음)로 돌아온다", back.handle === "@shop_a" && !back.previous, back);
  const prevSched = v("scheduled", "111", "@shop_a", B);
  check("이전 계정으로 잡힌 예약(정리가 늦은 것) → 이전 계정으로 보인다", prevSched.previous && prevSched.handle === "@shop_a", prevSched);
  const marker = v("published", PREVIOUS_ACCOUNT_MARKER, null, B);
  check("표식(누구 것인지 못 밝힘) → «이전 계정»만", marker.handle === null && marker.previous, marker);
  const markerNamed = v("published", PREVIOUS_ACCOUNT_MARKER, "@old", B);
  check("표식 + 아이디를 앎 → «@old · 이전 계정»", markerNamed.handle === "@old" && markerNamed.previous, markerNamed);
  const legacyPending = v("scheduled", null, null, B);
  check("대상이 빈 옛 예약 → 지금 계정(거기로 간다)", legacyPending.handle === "@shop_b" && !legacyPending.previous, legacyPending);
  const legacyFailed = v("failed", null, null, B);
  check("대상이 빈 옛 실패 글 → 지금 계정(다시 시도하면 거기로 간다)", legacyFailed.handle === "@shop_b" && !legacyFailed.previous, legacyFailed);
  const legacyPublished = v("published", null, null, B);
  check("대상이 빈 옛 발행 글 → 모름(칩 없음 — 백필이 채운다)", legacyPublished.handle === null && !legacyPublished.previous, legacyPublished);
  const legacyCanceled = v("canceled", null, null, B);
  check("대상이 빈 취소 글 → 모름", legacyCanceled.handle === null && !legacyCanceled.previous);
  const draftStamped = v("draft", "111", "@shop_a", B);
  check("초안은 대상이 없다 — 늘 지금 계정(예약하면 거기로 간다)", draftStamped.handle === "@shop_b" && !draftStamped.previous, draftStamped);
  const disconnected = v("published", "111", "@shop_a", null);
  check("연결이 없으면 적힌 이름만(«이전»이라 단정하지 않는다)", disconnected.handle === "@shop_a" && !disconnected.previous, disconnected);
  const unknown = v("published", "111", "@shop_a", undefined);
  check("연결 상태를 못 읽었으면 적힌 이름만", unknown.handle === "@shop_a" && !unknown.previous, unknown);
  const unknownLegacy = v("scheduled", null, null, undefined);
  check("연결 상태를 못 읽었고 대상도 비었으면 모름", unknownLegacy.handle === null && !unknownLegacy.previous);
  const draftNoConn = v("draft", null, null, null);
  check("연결 없는 초안 → 칩 없음", draftNoConn.handle === null && !draftNoConn.previous);
}

console.log("목록 한 줄(toListItem)에 계정이 실린다");
{
  const row: ListPostRow = {
    id: "p1",
    user_id: "u1",
    caption: "글",
    channel: "instagram",
    image_urls: [],
    media: null,
    ig_surface: null,
    scheduled_at: "2026-09-11T10:00:00Z",
    published_at: "2026-09-11T10:01:00Z",
    publish_after: null,
    publish_attempted_at: "2026-09-11T10:00:30Z",
    status: "published",
    error: null,
    permalink: null,
    media_purged_at: null,
    account_platform_id: "111",
    account_handle: "@shop_a",
  };
  const item = toListItem(row, null, Date.parse("2026-09-12T00:00:00Z"), postAccountView(row, B));
  check("이전 계정 글 → account_previous", item.account_handle === "@shop_a" && item.account_previous === true, item);
  check("시도 기록 → publish_attempted", item.publish_attempted === true);
  const bare = toListItem({ ...row, account_platform_id: undefined, account_handle: undefined }, null, Date.now());
  check("계정을 안 넘기면 칩 없음(옛 호출 호환)", bare.account_handle === null && bare.account_previous === false, bare);
}

console.log("백필 판정(옛 발행 글이 누구 것인가)");
{
  const ok = (ownerId: string | null, username: string | null) => ({ ok: true as const, ownerId, username, permalink: "https://www.instagram.com/p/x/" });
  const err = (code: number | null, subcode: number | null = null, httpStatus = 400, kind: "http" | "network" | "timeout" = "http") => ({
    ok: false as const,
    failure: { kind, httpStatus, code, subcode, message: null },
  });
  const owned = classifyMediaRead(ok("17841", null), "@shop_b");
  check("owner 가 오면 지금 계정 글", owned.verdict === "current", owned);
  const sameName = classifyMediaRead(ok(null, "Shop_B"), "@shop_b");
  check("owner 없이 아이디가 지금 계정과 같으면 지금 계정 글(대소문자·@ 무시)", sameName.verdict === "current", sameName);
  const other = classifyMediaRead(ok(null, "shop_a"), "@shop_b");
  check("남의 공개 글로 읽힘(스레드 고급 접근) → 이전 계정 + 아이디", other.verdict === "previous" && other.handle === "@shop_a", other);
  const noOwnerNoName = classifyMediaRead(ok(null, null), "@shop_b");
  check("owner·아이디 둘 다 없음 → 표식 박지 않고 하루 뒤", noOwnerNoName.verdict === "retry" && noOwnerNoName.afterMs === BACKFILL_LONG_RETRY_MS);
  const gone = classifyMediaRead(err(100, 33), "@shop_b");
  check("100/33(없거나 권한 없음) → 이전 계정 표식", gone.verdict === "previous" && gone.handle === null, gone);
  check("권한 코드 10 → 이전 계정 표식", classifyMediaRead(err(10), null).verdict === "previous");
  check("404 → 이전 계정 표식", classifyMediaRead(err(null, null, 404), null).verdict === "previous");
  const token = classifyMediaRead(err(190), "@shop_b");
  check("토큰 오류 190 → 이 사용자는 멈춤(하루 뒤)", token.verdict === "stop_user" && token.afterMs === BACKFILL_LONG_RETRY_MS, token);
  const rate = classifyMediaRead(err(4), "@shop_b");
  check("한도(4) → 잠시 뒤 다시", rate.verdict === "retry" && rate.afterMs === BACKFILL_RETRY_MS, rate);
  check("5xx → 잠시 뒤 다시", classifyMediaRead(err(null, null, 503), null).verdict === "retry");
  check("네트워크·시간 초과 → 잠시 뒤 다시", classifyMediaRead(err(null, null, 0, "network"), null).verdict === "retry" && classifyMediaRead(err(null, null, 0, "timeout"), null).verdict === "retry");
  const weird = classifyMediaRead(err(100, null), "@shop_b");
  check("모르는 400(필드 이름 거절 등) → 표식을 영구히 박지 않고 하루 뒤", weird.verdict === "retry" && weird.afterMs === BACKFILL_LONG_RETRY_MS, weird);
}

console.log("아이디 도우미");
check("toHandle — @ 붙이기", toHandle("shop_a") === "@shop_a" && toHandle("@shop.a") === "@shop.a");
check("toHandle — 이상한 값은 버린다", toHandle("<script>") === null && toHandle("") === null && toHandle(null) === null && toHandle("a b") === null);
check("handleKey — @·대소문자 무시", handleKey("@Shop_A") === handleKey("shop_a"));

console.log("계정 전환 문구(엔진·연동 콜백)");
{
  const both = accountSwitchedError("instagram", "@shop_a", "@shop_b", false);
  check("두 계정 이름을 모두 말한다", both.message.includes("@shop_a 계정") && both.message.includes("@shop_b 계정"), both.message);
  check("다시 예약하라고 안내한다", both.message.endsWith("새 계정으로 올리려면 다시 예약해 주세요"), both.message);
  check("코드·처리 — 계정 전환(permanent)", both.code === "ACCOUNT_SWITCHED" && both.kind === "permanent");
  check("마침표로 끝나지 않는다(알림이 이어 붙인다)", !both.message.endsWith("."));
  const onlyTarget = accountSwitchedError("instagram", "@shop_a", null, false);
  check("지금 이름을 모르면 «다른 계정»", onlyTarget.message.includes("@shop_a 계정이 아니라 지금은 다른 계정이"), onlyTarget.message);
  const none = accountSwitchedError("threads", null, null, false);
  check("둘 다 모르면 기본 문구(연동 콜백과 같은 문구)", none.message === publishError("ACCOUNT_SWITCHED", "threads").message, none.message);
  check(
    "기본 문구 = 사장님 지정 문구",
    publishError("ACCOUNT_SWITCHED", "instagram").message === "계정을 바꿔서 발행하지 못했어요 — 새 계정으로 올리려면 다시 예약해 주세요",
  );
  const attempted = accountSwitchedError("instagram", "@shop_a", "@shop_b", true);
  check("시도 뒤 → «올라갔는지 모름»(두 번 올리지 않는다)", attempted.code === "PUBLISH_AMBIGUOUS" && attempted.kind === "ambiguous", attempted);
  check("시도 뒤 → 옛 계정에서 확인하라고 말한다", attempted.message.includes("@shop_a 계정에서 먼저 확인"), attempted.message);
  const junk = accountSwitchedError("instagram", "@a b<script>", "@shop_b", false);
  check("망가진 이름은 문구에 싣지 않는다", !junk.message.includes("<script>") && junk.message.includes("@shop_b"), junk.message);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
