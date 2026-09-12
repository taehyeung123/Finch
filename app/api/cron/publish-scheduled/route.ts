import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { publishError } from "@/lib/meta/publish-errors";
import { advanceClaimedPost, claimPost } from "@/lib/publish/run";
import { notifyUser } from "@/lib/notify";

/**
 * 예약 발행 크론 — **5분마다**(vercel.json `*\/5 * * * *`).
 *
 * 2026-09-09 까지는 하루 한 번(06:00 KST)이었다(Vercel Hobby 시절의 제약). 이제 예약 시각이 지난 글을 5분 안에 집는다.
 * 2026-09-11 영상 발행: 한 건을 보내는 논리는 lib/publish/run.ts 의 상태 기계다 — 메타가 영상을 처리 중이면 행을
 * processing 으로 내려놓고 매분 크론(publish-processing)이 이어서 올린다. 이 크론이 하는 일은 셋:
 *   ① 회수 — 죽은 실행이 남긴 publishing 을 준비물 유무에 따라 processing(이어 보기) 또는 failed 로
 *   ② 예약 시각이 지난 글(due) — 선점 후 엔진에 넘긴다(사용자당 5건씩 — 한 계정이 줄을 독차지하지 못하게)
 *   ③ 미리 만들기(prepare) — 20분 안에 나갈 예약 영상의 준비물을 먼저 만든다(메타 처리 시간만큼 늦지 않게).
 *      예약 시각 전엔 절대 발행하지 않는다(publish_after = 예약 시각). 행마다 한 번만 시도한다.
 * 0053(channel 컬럼) 미적용 폴백은 지웠다 — 0093 이 선행 조건이고 channel 을 전제로 한다.
 */
export const runtime = "nodejs";
/* Pro 상한. ⚠️ 이 값이 없으면 플랫폼 기본값에 걸려 함수가 **강제 종료**되고, 행이 publishing 으로 굳는다. */
export const maxDuration = 300;

/** 한 배치가 쓰는 시간 예산 — 응답 직렬화 여유를 두고 maxDuration 보다 짧게 잡는다 */
const TIME_BUDGET_MS = 280_000;
/** 선점한 뒤 기록할 몫 — 엔진 예산에서 뺀다 */
const RESERVE_MS = 8_000;
/** 한 건이 쓸 수 있는 상한 */
const MAX_PER_POST_MS = 90_000;
/** 이 시간을 넘긴 publishing 은 이전 실행이 죽으며 남긴 것으로 보고 회수한다.
    정상 실행은 길어야 5분(크론 maxDuration 300)·2분(「지금 발행」)이라 10분이면 확실히 죽은 것이다. */
const STUCK_MINUTES = 10;
/** 미리 만들기 창 — 이 안에 예약된 영상 글 */
const PREPARE_WINDOW_MS = 20 * 60_000;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }
  const startedAt = Date.now();
  const remaining = () => TIME_BUDGET_MS - (Date.now() - startedAt);

  /* ── ① 회수 ────────────────────────────────────────────────────────
     이전 실행이 죽으면 선점만 해 둔 행이 'publishing' 으로 남는다. 기준 시각은 **한 번** 정한다 — 두 문장 사이에
     10분을 넘기는 행이 생겨 엉뚱한 쪽으로 분류되지 않게. 모든 갱신에 같은 status·updated_at 가드를 다시 건다
     (조회와 갱신 사이에 다른 실행이 선점하면 건드리지 않는다).
     · 준비물이 있거나 발행을 시도한 행 → processing(매분 크론이 «이미 올라갔나»부터 본다 — 두 번 올리지 않는다)
     · 아무것도 없는 새 코드의 행(claimed_at 있음) → failed «다시 시도해 주세요»(메타 쪽에 아무것도 안 만들었다) + 알림.
       2026-09-12 비동기 「지금 발행」 뒤로 가장 흔한 경우는 «응답 뒤(after)에 올리던 함수가 죽었다»다 — 사용자는 «나가도 계속 올라가요»를
       듣고 화면을 떠났을 수 있으므로, 조용히 실패로만 바꾸지 않고 알림을 보낸다(엔진의 실패 알림과 같은 문구 틀).
     · 옛 코드가 선점한 행(claimed_at 없음) → failed «실제로 올라갔는지 확인한 뒤» — 옛 코드는 준비물을 적지 않아
       «올라갔는데 기록만 못 한» 행을 구별할 수 없다(옛 문구 그대로)
     조회가 실패하면 이번 회차의 회수를 통째로 건너뛴다 — 실패를 «준비물 없음»으로 읽으면 멀쩡한 행을 실패로 만든다. */
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  let recoveredToProcessing = 0;
  let recoveredFailed = 0;
  const stuck = await admin
    .from("scheduled_posts")
    .select("id, processing_deadline")
    .eq("status", "publishing")
    .lt("updated_at", stuckBefore)
    .or("container_id.not.is.null,child_container_ids.not.is.null,publish_attempted_at.not.is.null")
    .limit(200);
  if (stuck.error) {
    console.error("[cron:publish] 회수 조회 실패 — 이번 회차 회수 건너뜀:", stuck.error.message);
  } else {
    const rows = (stuck.data ?? []) as Array<{ id: string; processing_deadline: string | null }>;
    const nowIso = new Date().toISOString();
    const withDeadline = rows.filter((r) => r.processing_deadline).map((r) => r.id);
    const noDeadline = rows.filter((r) => !r.processing_deadline).map((r) => r.id);
    for (const [ids, fields] of [
      [withDeadline, { status: "processing", next_check_at: nowIso }],
      [noDeadline, { status: "processing", next_check_at: nowIso, processing_deadline: new Date(Date.now() + 10 * 60_000).toISOString() }],
    ] as const) {
      if (ids.length === 0) continue;
      const { data, error } = await admin
        .from("scheduled_posts")
        .update(fields)
        .in("id", ids as string[])
        .eq("status", "publishing")
        .lt("updated_at", stuckBefore)
        .select("id");
      if (error) console.error("[cron:publish] 회수(처리 중) 실패:", error.message);
      recoveredToProcessing += data?.length ?? 0;
    }

    const failBare = async (legacyRows: boolean) => {
      const err = publishError(legacyRows ? "INTERRUPTED_LEGACY" : "INTERRUPTED", "instagram");
      let q = admin
        .from("scheduled_posts")
        .update({ status: "failed", error: err.message, error_code: err.code, next_check_at: null })
        .eq("status", "publishing")
        .lt("updated_at", stuckBefore)
        .is("container_id", null)
        .is("child_container_ids", null)
        .is("publish_attempted_at", null);
      q = legacyRows ? q.is("claimed_at", null) : q.not("claimed_at", "is", null);
      const { data, error } = await q.select("id, user_id");
      if (error) console.error("[cron:publish] 회수(실패) 실패:", error.message);
      /* 실제로 바뀐 행의 주인에게만, 사람마다 한 번 — 몇 개가 한꺼번에 끊겨도 알림은 하나 */
      const owners = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ id: string; user_id: string }>) owners.set(r.user_id, (owners.get(r.user_id) ?? 0) + 1);
      for (const [userId, n] of owners) {
        await notifyUser(admin, {
          userId,
          type: "studio",
          title: "발행에 실패했어요",
          body: legacyRows
            ? `게시물${n > 1 ? ` ${n}개를` : "을"} 올리던 중에 끊겼어요 — 실제로 올라갔는지 확인한 뒤 「발행」 화면에서 다시 시도하거나 지워 주세요.`
            : `게시물${n > 1 ? ` ${n}개를` : "을"} 올리던 중에 끊겼어요 — 「발행」 화면에서 다시 시도하거나 지울 수 있어요.`,
        });
      }
      return data?.length ?? 0;
    };
    recoveredFailed = (await failBare(false)) + (await failBare(true));
    if (recoveredToProcessing + recoveredFailed > 0) {
      console.warn("[cron:publish] 굳은 publishing 회수:", { recoveredToProcessing, recoveredFailed });
    }
  }

  /* ── ② 예약 시각이 지난 글 ──────────────────────────────────────── */
  const due = await admin.rpc("pick_due_posts", { p_limit: 50, p_per_user: 5 });
  if (due.error) {
    console.error("[cron:publish] 조회 실패:", due.error.message);
    return NextResponse.json({ ok: false, error: due.error.message }, { status: 500 });
  }
  const queue = (due.data ?? []) as Array<{ id: string; user_id: string; scheduled_at: string; items: number }>;

  let published = 0;
  let processing = 0;
  let failed = 0;
  let released = 0;
  let deferred = 0;
  for (let i = 0; i < queue.length; i++) {
    const post = queue[i];
    /* 남은 예산으로 한 건을 시작할 수 없으면 **집지 않는다** — 선점해 놓고 함수가 죽으면 행이 굳는다 */
    const needed = 15_000 + 2_500 * Math.max(1, post.items);
    if (remaining() < needed + RESERVE_MS) {
      deferred = queue.length - i;
      console.warn("[cron:publish] 시간 예산 소진 — 나머지는 다음 실행으로:", deferred);
      break;
    }
    /* 선점 실패 = 「지금 발행」이나 동시 실행이 먼저 잡았다(또는 그 사이 예약 시각이 바뀌었다) — 손대지 않는다 */
    const claimed = await claimPost(admin, post.id, ["scheduled"], {
      userId: post.user_id,
      notBefore: post.scheduled_at,
      publishAfter: "scheduled",
    });
    if (!claimed.ok) continue;
    const out = await advanceClaimedPost(admin, claimed.row, {
      source: "due",
      budgetMs: Math.min(MAX_PER_POST_MS, remaining() - RESERVE_MS),
    });
    if (out.kind === "published") published++;
    else if (out.kind === "processing") processing++;
    else if (out.kind === "failed") failed++;
    else released++;
  }

  /* ── ③ 미리 만들기 — 20분 안에 나갈 예약 영상 ─────────────────────── */
  let prepared = 0;
  if (remaining() > 40_000) {
    const now = Date.now();
    const soon = await admin
      .from("scheduled_posts")
      .select("id, user_id, scheduled_at, media")
      .eq("status", "scheduled")
      .gt("scheduled_at", new Date(now).toISOString())
      .lte("scheduled_at", new Date(now + PREPARE_WINDOW_MS).toISOString())
      .is("prepare_attempted_at", null)
      /* 배열을 넘기면 postgrest-js 가 Postgres 배열 리터럴(cs.{[object Object]})로 만들어 요청이 깨진다 — JSON 문자열로 */
      .filter("media", "cs", JSON.stringify([{ kind: "video" }]))
      .order("scheduled_at", { ascending: true })
      .limit(20);
    if (soon.error) {
      /* 실패를 «미리 만들 글 없음»으로 읽지 않는다 — 기록만 남긴다(예약 시각에 본 발행이 그대로 한다) */
      console.error("[cron:publish] 미리 만들기 조회 실패:", soon.error.message);
    } else {
      for (const post of (soon.data ?? []) as Array<{ id: string; user_id: string; scheduled_at: string; media: unknown }>) {
        const items = Array.isArray(post.media) ? post.media.length : 1;
        const budget = Math.min(20_000 + 2_500 * items, remaining() - RESERVE_MS);
        if (budget < 15_000) break;
        const claimed = await claimPost(admin, post.id, ["scheduled"], {
          userId: post.user_id,
          notBefore: post.scheduled_at,
          publishAfter: "scheduled",
          markPrepare: true,
        });
        if (!claimed.ok) continue;
        const out = await advanceClaimedPost(admin, claimed.row, { source: "prepare", budgetMs: budget });
        if (out.kind === "processing") prepared++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: queue.length,
    published,
    processing,
    failed,
    released,
    deferred,
    prepared,
    recoveredToProcessing,
    recovered: recoveredFailed,
  });
}
