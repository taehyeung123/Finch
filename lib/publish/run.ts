/* 토큰 암호문을 풀고 알림을 만든다 — 서버 밖으로 나가면 안 된다 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto/tokens";
import { publishCardNews } from "@/lib/meta/instagram-publish";
import { publishThreadsPost } from "@/lib/meta/threads-publish";
import { notifyUser } from "@/lib/notify";
import { channelLabel } from "@/lib/publish-rules";

/*
  게시물 한 건을 **실제로 내보내는** 공통부 (2026-09-09).

  전에는 이 논리가 발행 크론 안에만 있었고, 크론은 하루 한 번(06:00 KST) 돌았다 — Vercel Hobby 시절의
  제약이 Pro 로 바꾼 뒤에도 그대로 남아 있었다. 그래서 「예약」은 «예약일 아침 배치»였고 「즉시 발행」은
  비활성이었으며, 사장님이 낮에 예약한 글은 다음 날 아침까지 아무 일도 안 일어났다(2026-09-09 신고:
  「인스타 발행이 제대로 안 되는 것 같다」 — 실패가 아니라 그 설계였다).

  이제 두 곳이 같은 함수를 부른다:
  · 크론(5분마다) — 예약 시각이 지난 글을 집어 보낸다
  · 서버 액션 publishNow — 사용자가 「지금 발행」을 누르면 그 자리에서 보내고 결과를 돌려준다

  ⚠️ 선점(claim)이 곧 중복 방지다. 크론과 「지금 발행」이 같은 행을 동시에 잡아도
  `update … where status in (…)` 는 한쪽만 성공한다 — 실패한 쪽은 손대지 않고 물러난다.
*/

export interface QueuedPost {
  id: string;
  user_id: string;
  caption: string;
  image_urls: string[] | null;
  /** 0053 이전 행은 null — 그 시절 큐는 전부 인스타 카드뉴스였다 */
  channel?: string | null;
}

export type RunResult = { ok: true; mediaId: string; label: string } | { ok: false; error: string; label: string };

/**
 * 행을 publishing 으로 선점한다. `from` 에 든 상태일 때만 성공한다.
 * 크론은 ["scheduled"] 만, 「지금 발행」은 ["draft","scheduled","failed"] 를 넘긴다.
 */
export async function claimPost(
  admin: SupabaseClient,
  id: string,
  from: string[],
  opts: {
    /** 서버 액션 경로는 **반드시** 넘긴다 — admin 은 RLS 를 우회하므로 이 필터가 곧 권한이다 */
    userId?: string;
  } = {},
): Promise<boolean> {
  /* ⚠️ 여기서 scheduled_at 을 건드리지 않는다. 「지금 발행」이 선점하면서 «지금»으로 덮었더니, 실패했을 때
     원래 9/20 이던 예약이 오늘 칸의 실패로 옮겨 앉아 예약일 칸에서는 사라졌다(2026-09-09 점검).
     실제 발행 시각은 **성공했을 때만** runClaimedPost 가 적는다. */
  let q = admin
    .from("scheduled_posts")
    .update({ status: "publishing", error: null })
    .eq("id", id)
    .in("status", from);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data } = await q.select("id");
  return !!data && data.length > 0;
}

/**
 * 선점한 행을 내보내고 결과를 DB·알림에 남긴다. **예외를 던지지 않는다** — 어떤 경로로 실패하든
 * 행은 failed 로 내려앉는다(publishing 으로 굳는 행을 만들지 않는다).
 *
 * @param waitBudgetMs 메타 컨테이너 처리를 기다릴 상한. 호출측의 실행시간 예산 안이어야 한다 —
 *   함수 maxDuration 보다 길게 기다리면 플랫폼이 함수를 죽이고, 그러면 아래 실패 처리가 실행되지 않는다.
 */
export async function runClaimedPost(
  admin: SupabaseClient,
  post: QueuedPost,
  opts: { waitBudgetMs: number; source: "cron" | "now" },
): Promise<RunResult> {
  const channel = post.channel ?? "instagram";
  const label = channelLabel(channel);

  const fail = async (reason: string): Promise<RunResult> => {
    await admin.from("scheduled_posts").update({ status: "failed", error: reason }).eq("id", post.id);
    /* 「지금 발행」은 결과를 화면 모달로 바로 보여 준다 — 그래도 알림은 남긴다(나중에 «왜 안 나갔지» 를 찾을 곳) */
    await notifyUser(admin, {
      userId: post.user_id,
      type: "studio",
      title: opts.source === "cron" ? "예약 발행에 실패했어요" : "발행에 실패했어요",
      body: `${label} 게시물 발행이 실패했어요 (${reason}). 「발행」 화면에서 다시 시도하거나 지울 수 있어요.`,
    });
    return { ok: false, error: reason, label };
  };

  if (channel !== "instagram" && channel !== "threads") {
    return fail(`${label} 발행은 아직 지원하지 않아요`);
  }

  /* 토큰은 **글 소유자**의 것이다. 팀원이 만든 글은 팀원 자신의 연동으로 나간다(예약 관문도 그렇게 잠근다) —
     소유자 토큰으로 대신 내보내지 않는다. 암호문 스코프(AAD)도 같은 userId 라야 풀린다. */
  const { data: account } = await admin
    .from("connected_accounts")
    .select("platform_user_id, access_token_cipher, token_expires_at")
    .eq("user_id", post.user_id)
    .eq("channel", channel)
    .eq("connected", true)
    .maybeSingle();
  const token = decryptToken(account?.access_token_cipher ?? null, {
    userId: post.user_id,
    field: "connected_accounts.access_token_cipher",
  });
  if (!account?.platform_user_id || !token) {
    return fail(`${label} 연동이 끊겼어요 — 설정에서 다시 연동해 주세요`);
  }
  /* 만료 토큰으로 호출하면 Graph 원문("Error validating access token…")이 그대로 실패 사유가 되고
     사용자는 진짜 해법인 «재연동»을 못 듣는다. 여기서 갈라 준다(refresh-tokens 크론이 1차, 이건 2차 방어). */
  if (account.token_expires_at && new Date(account.token_expires_at).getTime() <= Date.now()) {
    return fail(`${label} 연동이 만료됐어요 — 설정에서 다시 연동해 주세요`);
  }

  const waitBudgetMs = Math.max(5_000, opts.waitBudgetMs);
  let result: { ok: true; mediaId: string } | { ok: false; error: string };
  try {
    result =
      channel === "threads"
        ? await publishThreadsPost({
            threadsUserId: account.platform_user_id,
            accessToken: token,
            text: post.caption,
            imageUrls: post.image_urls ?? [],
            maxWaitMs: waitBudgetMs,
          })
        : await publishCardNews({
            igUserId: account.platform_user_id,
            accessToken: token,
            caption: post.caption,
            imageUrls: post.image_urls ?? [],
            maxWaitMs: waitBudgetMs,
          });
  } catch (e) {
    console.error("[publish] 발행 중 예외:", post.id, channel, e);
    return fail("발행 중 오류가 발생했어요");
  }

  if (!result.ok) {
    console.error("[publish] 발행 실패:", post.id, channel, result.error);
    return fail(result.error);
  }

  /* ⚠️ 여기서부터는 글이 **이미 올라간 뒤**다. 이 갱신이 실패하면 행이 publishing 으로 남고, 30분 뒤 크론의
     회수 로직이 failed 로 뒤집으며, 사용자가 「다시 시도」를 누르면 **같은 글이 두 번 올라간다.** 그래서 세 번까지
     다시 쓰고, 끝내 안 되면 media id 를 로그에 남겨 손으로 맞출 수 있게 한다(회수 문구도 «올라갔는지 확인하라»고 말한다).
     ig_media_id 는 인스타 시절 이름이지만 스레드 media id 도 여기 들어간다(0074 주석). */
  /* 「지금 발행」은 성공한 시각을 예약 시각으로 적는다 — 목록·달력이 실제 발행 시각을 보여 주게. 크론은 예약 시각 그대로. */
  const published = {
    status: "published",
    ig_media_id: result.mediaId,
    ...(opts.source === "now" ? { scheduled_at: new Date().toISOString() } : {}),
  };
  let recorded = false;
  for (let attempt = 1; attempt <= 3 && !recorded; attempt++) {
    const { error: upErr } = await admin.from("scheduled_posts").update(published).eq("id", post.id);
    if (!upErr) {
      recorded = true;
    } else {
      console.error(`[publish] 발행 기록 실패(${attempt}/3):`, post.id, upErr.message);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  if (!recorded) {
    console.error("[publish] CRITICAL 발행됐지만 기록하지 못함 — 수동 대조 필요:", { postId: post.id, channel, mediaId: result.mediaId });
  }
  await notifyUser(admin, {
    userId: post.user_id,
    type: "studio",
    title: opts.source === "cron" ? "예약한 게시물이 발행됐어요" : "게시물이 발행됐어요",
    body: `${label}에 게시물이 정상적으로 올라갔어요.`,
  });
  return { ok: true, mediaId: result.mediaId, label };
}
