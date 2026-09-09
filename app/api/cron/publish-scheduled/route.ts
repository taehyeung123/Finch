import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { isMissingColumnError } from "@/lib/publish-rules";
import { claimPost, runClaimedPost, type QueuedPost } from "@/lib/publish/run";

/**
 * 예약 발행 크론 — **5분마다**(vercel.json `*\/5 * * * *`).
 *
 * 2026-09-09 까지는 하루 한 번(06:00 KST)이었다. Vercel Hobby 의 «크론은 하루 1회» 제약에서 온 설계인데,
 * Pro 로 옮긴 뒤에도(다른 크론은 이미 매분·300초로 돈다) 이것만 남아 있었다. 그래서 「예약」은
 * 예약 시각이 아니라 «그날 아침 배치»였고 「즉시 발행」은 비활성이었다 — 낮에 예약한 글이 다음 날
 * 아침까지 아무 일도 안 일어나, 사장님이 「발행이 안 된다」고 신고했다(실패가 아니라 그 설계였다).
 *
 * 이제 예약 시각이 지난 글을 5분 안에 집어 보낸다. 한 건을 보내는 논리는 lib/publish/run.ts 에 있고
 * 「지금 발행」(서버 액션)과 같은 함수를 쓴다.
 */
export const runtime = "nodejs";
/* Pro 상한. ⚠️ 이 값이 없으면 플랫폼 기본값에 걸려 함수가 **강제 종료**되고, 그러면 실패 처리가 실행되지
   않아 status='publishing' 인 행이 굳는다. */
export const maxDuration = 300;

/** 한 배치가 쓰는 시간 예산 — 응답 직렬화 여유를 두고 maxDuration 보다 짧게 잡는다 */
const TIME_BUDGET_MS = 280_000;
/** 한 건을 시작할 수 있는 최소 잔여 시간 — 이보다 적으면 집지 않고 다음 배치(5분 뒤)에 넘긴다 */
const MIN_PER_POST_MS = 20_000;
/** 발행 호출·DB 갱신 몫 — 컨테이너 폴링에 이만큼은 남겨 둔다 */
const PUBLISH_RESERVE_MS = 8_000;
/** 한 건이 컨테이너 처리를 기다릴 상한 — 캐러셀 10장도 보통 이 안에 끝난다 */
const MAX_WAIT_PER_POST_MS = 90_000;
/** 이 시간을 넘긴 publishing 은 이전 실행이 죽으며 남긴 것으로 보고 회수한다.
    정상 실행은 길어야 5분(크론 maxDuration 300)·2분(「지금 발행」)이라 10분이면 확실히 죽은 것이다 —
    30분이던 것을 줄였다: 그동안 사용자는 그 글을 다시 시도도 삭제도 못 한다(둘 다 publishing 을 안 받는다). */
const STUCK_MINUTES = 10;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }
  const startedAt = Date.now();

  /* 이전 실행이 타임아웃으로 죽으면 선점만 해 둔 행이 'publishing' 으로 남는다.
     크론은 'scheduled' 만 집고 화면도 draft/failed 만 손댈 수 있어 **영원히 굳는다.**
     시작 때 오래된 것부터 회수한다 — 실패는 사용자가 다시 시도할 수 있다.
     ⚠️ 문구가 «올라갔는지 확인하라»고 말하는 이유: 굳은 행 중에는 **실제로는 올라갔는데 기록만 못 한** 것이
     섞일 수 있다(lib/publish/run.ts 의 기록 재시도 주석). «실패»라고만 하면 사용자가 다시 시도해 두 번 올린다. */
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  const { data: recovered } = await admin
    .from("scheduled_posts")
    .update({ status: "failed", error: "발행이 도중에 끊겼어요 — 실제로 올라갔는지 확인한 뒤 다시 시도해 주세요" })
    .eq("status", "publishing")
    .lt("updated_at", stuckBefore)
    .select("id");
  if (recovered && recovered.length > 0) {
    console.warn("[cron:publish] 굳은 publishing 회수:", recovered.length);
  }

  /* channel 은 0053 컬럼 — 미적용 DB 폴백(계단식, 저장 경로와 같은 패턴).
     컬럼이 없던 시절 큐는 전부 인스타 카드뉴스였으므로 instagram 으로 읽는다. */
  const baseSelect = "id, user_id, caption, image_urls, scheduled_at";
  const dueQuery = (select: string) =>
    admin
      .from("scheduled_posts")
      .select(select)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(50);

  let due: QueuedPost[] | null = null;
  let error: { message: string } | null = null;

  const withChannel = await dueQuery(`${baseSelect}, channel`);
  if (isMissingColumnError(withChannel.error, /channel/i)) {
    /* 판정식을 좁게 유지하는 이유: 넓으면 관계없는 오류 한 번에 이 분기가 걸리고,
       여기서는 **모든 행을 인스타로 읽는다** — 스레드 글이 인스타 계정으로 나간다. */
    console.warn("[cron:publish] channel 컬럼 없음 — 전 행 instagram 으로 처리");
    const fallback = await dueQuery(baseSelect);
    due = fallback.data as unknown as QueuedPost[] | null;
    error = fallback.error;
  } else {
    due = withChannel.data as unknown as QueuedPost[] | null;
    error = withChannel.error;
  }

  if (error) {
    console.error("[cron:publish] 조회 실패:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let published = 0;
  let failed = 0;
  let deferred = 0;
  const queue = due ?? [];

  for (let i = 0; i < queue.length; i++) {
    const post = queue[i];
    /* 남은 예산으로 한 건을 끝낼 수 없으면 **집지 않는다.** 선점해 놓고 함수가 죽으면
       그 행이 'publishing' 으로 굳는다(위 회수 로직이 있지만, 애초에 안 만드는 편이 낫다). */
    const remaining = TIME_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < MIN_PER_POST_MS) {
      deferred = queue.length - i;
      console.warn("[cron:publish] 시간 예산 소진 — 나머지는 다음 실행으로:", deferred);
      break;
    }

    // 선점 실패 = 「지금 발행」이나 동시 실행이 먼저 잡았다 — 손대지 않는다
    if (!(await claimPost(admin, post.id, ["scheduled"]))) continue;

    const result = await runClaimedPost(admin, post, {
      source: "cron",
      waitBudgetMs: Math.min(MAX_WAIT_PER_POST_MS, remaining - PUBLISH_RESERVE_MS),
    });
    if (result.ok) published++;
    else failed++;
  }

  return NextResponse.json({
    ok: true,
    total: due?.length ?? 0,
    published,
    failed,
    deferred,
    recovered: recovered?.length ?? 0,
  });
}
