import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { publishCardNews } from "@/lib/meta/instagram-publish";
import { publishThreadsPost } from "@/lib/meta/threads-publish";
import { notifyUser } from "@/lib/notify";
import { isAuthorizedCron } from "@/lib/cron";
import { channelLabel, isMissingColumnError } from "@/lib/publish-rules";

/**
 * 예약 발행 크론 (매일 06:00 KST, vercel.json).
 * Vercel Hobby 크론은 하루 1회 빈도 제한이라 '예약일의 아침 배치' 단위로 처리한다
 * (분 단위 정시 발행 아님 — UI에도 이렇게 고지한다).
 * 발행 성공/실패는 studio 알림 유형으로 통지한다.
 *
 * 채널: instagram·threads 를 각자의 어댑터로 보낸다(2026-08-31 스레드 추가).
 * tiktok 은 발행 API 가 없어 큐에 들어올 수 없다 — 그래도 방어적으로 실패 처리한다.
 */
export const runtime = "nodejs";
/* Hobby 상한. Pro 전환 시 300 으로(pool-* 크론과 같은 규칙).
   ⚠️ 이 값이 없으면 플랫폼 기본값(수십 초)에 걸려 함수가 **강제 종료**된다 —
   그러면 아래 try/catch 가 실행되지 않아 status='publishing' 인 행이 영원히 굳는다. */
export const maxDuration = 60;

/** 한 배치가 쓰는 시간 예산 — 응답 직렬화 여유를 두고 maxDuration 보다 짧게 잡는다 */
const TIME_BUDGET_MS = 52_000;
/** 한 건을 시작할 수 있는 최소 잔여 시간 — 이보다 적으면 집지 않고 다음 배치에 넘긴다 */
const MIN_PER_POST_MS = 15_000;
/** 발행 호출·DB 갱신 몫 — 폴링에 이만큼은 남겨 둔다 */
const PUBLISH_RESERVE_MS = 8_000;
/** 이 시간을 넘긴 publishing 은 이전 배치가 죽으며 남긴 것으로 보고 회수한다 */
const STUCK_MINUTES = 30;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }
  const startedAt = Date.now();

  /* 이전 배치가 타임아웃으로 죽으면 선점만 해 둔 행이 'publishing' 으로 남는다.
     크론은 'scheduled' 만 집고 화면도 draft/failed 만 손댈 수 있어 **영원히 굳는다.**
     배치 시작 때 오래된 것부터 회수한다 — 실패는 사용자가 다시 예약할 수 있다. */
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  const { data: recovered } = await admin
    .from("scheduled_posts")
    .update({ status: "failed", error: "발행이 도중에 중단됐어요" })
    .eq("status", "publishing")
    .lt("updated_at", stuckBefore)
    .select("id");
  if (recovered && recovered.length > 0) {
    console.warn("[cron:publish] 굳은 publishing 회수:", recovered.length);
  }

  /* channel 은 0053 컬럼 — 미적용 DB 폴백(계단식, 저장 경로와 같은 패턴).
     컬럼이 없던 시절 큐는 전부 인스타 카드뉴스였으므로 instagram 으로 읽는다. */
  interface DuePost {
    id: string;
    user_id: string;
    caption: string;
    image_urls: string[] | null;
    channel?: string | null;
  }
  const baseSelect = "id, user_id, caption, image_urls, scheduled_at";
  const dueQuery = (select: string) =>
    admin
      .from("scheduled_posts")
      .select(select)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(50);

  let due: DuePost[] | null = null;
  let error: { message: string } | null = null;

  const withChannel = await dueQuery(`${baseSelect}, channel`);
  if (isMissingColumnError(withChannel.error, /channel/i)) {
    /* 0053 미적용 — 그 시절 큐는 전부 인스타 카드뉴스였다.
       판정식을 좁게 유지하는 이유: 넓으면 관계없는 오류 한 번에 이 분기가 걸리고,
       여기서는 **모든 행을 인스타로 읽는다** — 스레드 글이 인스타 계정으로 나간다. */
    console.warn("[cron:publish] channel 컬럼 없음 — 전 행 instagram 으로 처리");
    const fallback = await dueQuery(baseSelect);
    due = fallback.data as unknown as DuePost[] | null;
    error = fallback.error;
  } else {
    due = withChannel.data as unknown as DuePost[] | null;
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
      console.warn("[cron:publish] 시간 예산 소진 — 나머지는 다음 배치로:", deferred);
      break;
    }

    const channel = post.channel ?? "instagram";
    const label = channelLabel(channel);

    // publishing으로 먼저 점유 — 동시 실행/재시도 시 중복 발행 방지
    const { data: claimed } = await admin
      .from("scheduled_posts")
      .update({ status: "publishing" })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const fail = async (reason: string) => {
      await admin.from("scheduled_posts").update({ status: "failed", error: reason }).eq("id", post.id);
      await notifyUser(admin, {
        userId: post.user_id,
        type: "studio",
        title: "예약 발행에 실패했어요",
        /* 「스튜디오에서」라고 안내했었다 — 발행 컴포저로 만든 글은 스튜디오에 존재하지 않아서
           그 안내를 따라가면 아무것도 못 찾는다. 실패한 글은 /publish 목록에 남는다. */
        body: `예약한 ${label} 게시물 발행이 실패했어요 (${reason}). 「발행」 화면에서 다시 예약하거나 지울 수 있어요.`,
      });
      failed++;
    };

    if (channel !== "instagram" && channel !== "threads") {
      await fail(`${label} 발행은 아직 지원하지 않아요`);
      continue;
    }

    const { data: account } = await admin
      .from("connected_accounts")
      .select("platform_user_id, access_token_cipher, token_expires_at")
      .eq("user_id", post.user_id)
      .eq("channel", channel)
      .eq("connected", true)
      .maybeSingle();
    const token = decryptToken(account?.access_token_cipher ?? null);
    if (!account?.platform_user_id || !token) {
      await fail(`${label} 연동이 끊겼어요 — 설정에서 다시 연동해 주세요`);
      continue;
    }
    /* 만료 토큰으로 호출하면 Graph 원문("Error validating access token…")이 그대로
       실패 사유가 되고, 알림은 「다시 예약하세요」라고 안내한다 — 사용자는 진짜 해법인
       «재연동»을 끝까지 못 듣고 매일 같은 실패를 반복한다. 여기서 갈라 준다.
       (정상 운영에서는 refresh-tokens 크론이 3시간 앞서 갱신한다 — 이건 그게 실패했을 때의 2차 방어다.) */
    if (account.token_expires_at && new Date(account.token_expires_at).getTime() <= Date.now()) {
      await fail(`${label} 연동이 만료됐어요 — 설정에서 다시 연동해 주세요`);
      continue;
    }

    /* 발행 어댑터가 **예외를 던지면** 위에서 박아 둔 status="publishing" 이 그대로 남는다.
       그 행은 크론이 다시 안 집고(scheduled 만 집는다) 화면에서도 손댈 수 없어, 「발행 중」인 채로
       영원히 굳는다. 예외도 실패로 내려 앉힌다 — 실패는 사용자가 다시 예약할 수 있다. */
    let result: { ok: true; mediaId: string } | { ok: false; error: string };
    try {
      result =
        channel === "threads"
          ? await publishThreadsPost({
              threadsUserId: account.platform_user_id,
              accessToken: token,
              text: post.caption,
              imageUrls: post.image_urls ?? [],
              /* 어댑터 기본 상한은 90초라 maxDuration(60)을 통째로 넘긴다 —
                 남은 예산 안으로 눌러서 넘긴다. 못 끝내면 실패로 떨어지고 재예약할 수 있다. */
              maxWaitMs: Math.max(5_000, remaining - PUBLISH_RESERVE_MS),
            })
          : await publishCardNews({
              igUserId: account.platform_user_id,
              accessToken: token,
              caption: post.caption,
              imageUrls: post.image_urls ?? [],
            });
    } catch (e) {
      console.error("[cron:publish] 발행 중 예외:", post.id, channel, e);
      await fail("발행 중 오류가 발생했어요");
      continue;
    }

    if (!result.ok) {
      console.error("[cron:publish] 발행 실패:", post.id, channel, result.error);
      await fail(result.error);
      continue;
    }

    /* ig_media_id 는 인스타 시절 이름이지만 스레드 media id 도 여기 들어간다(0074 주석) */
    await admin.from("scheduled_posts").update({ status: "published", ig_media_id: result.mediaId }).eq("id", post.id);
    await notifyUser(admin, {
      userId: post.user_id,
      type: "studio",
      title: "예약한 게시물이 발행됐어요",
      body: `${label}에 게시물이 정상적으로 올라갔어요.`,
    });
    published++;
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
