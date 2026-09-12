import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { advanceClaimedPost, claimPost } from "@/lib/publish/run";

/**
 * 처리 중인 게시물 이어 보기 — **매분**(vercel.json `* * * * *`, 2026-09-11 영상 발행).
 *
 * 메타는 영상(가끔 사진)을 뒤에서 처리한다 — «1분마다 상태를 보라»가 메타 권고다. 「지금 발행」·예약 크론이
 * 요청 안에서 끝내지 못한 글은 processing 으로 내려앉고(next_check_at), 이 크론이 때가 된 것부터 집어 한 걸음씩 나아가게 한다:
 * 처리가 끝났으면 발행, 이미 올라갔으면 기록만(두 번 올리지 않기), 실패면 한국어 사유로 실패 + 알림.
 *
 * next_check_at 은 서버만 쓴다(0093 칸 권한) — 사용자가 1970 으로 적어 줄 맨 앞을 독차지하지 못한다.
 * 선점(processing → publishing)이 곧 중복 방지다 — 취소·「지금 발행」·겹친 실행이 먼저 잡으면 건드리지 않는다.
 * ⚠️ 미리보기 배포에는 크론이 돌지 않는다 — 거기서 «처리 중»은 멈춰 보인다(손으로 부르려면 Authorization: Bearer $CRON_SECRET).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** 한 번의 실행이 쓰는 시간 — 다음 분 실행과 겹치지 않게 */
const TIME_BUDGET_MS = 50_000;
/** 한 건 상한 — 상태 한 번 읽기·발행 한 번이면 보통 몇 초다 */
const PER_POST_MS = 20_000;
/** 이보다 적게 남았으면 새 글을 집지 않는다 — 발행 호출은 15초 이상 남았을 때만 시작한다(engine-core) */
const MIN_START_MS = 20_000;
const BATCH = 25;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("not_configured", { status: 503 });
  const started = Date.now();

  /* 조회는 id·주인만 — 엔진은 선점이 돌려준 **그 행**만 믿는다(조회해 둔 사본은 그 사이 낡는다) */
  const { data, error } = await admin
    .from("scheduled_posts")
    .select("id, user_id")
    .eq("status", "processing")
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[cron:publish-processing] 조회 실패:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ id: string; user_id: string }>;
  const tally = { checked: 0, published: 0, failed: 0, waiting: 0, deferred: 0 };
  for (const [i, post] of rows.entries()) {
    const remaining = TIME_BUDGET_MS - (Date.now() - started);
    if (remaining < MIN_START_MS) {
      tally.deferred = rows.length - i;
      break;
    }
    const claimed = await claimPost(admin, post.id, ["processing"], { userId: post.user_id, publishAfter: "keep" });
    if (!claimed.ok) continue; // 취소·다른 실행이 먼저
    const out = await advanceClaimedPost(admin, claimed.row, {
      source: "check",
      budgetMs: Math.min(PER_POST_MS, remaining - 3_000),
    });
    tally.checked++;
    if (out.kind === "published") tally.published++;
    else if (out.kind === "failed") tally.failed++;
    else tally.waiting++;
  }
  return NextResponse.json({ ok: true, ...tally });
}
