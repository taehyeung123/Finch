/* service_role 로 발행 글의 대상 계정을 적고, 계정을 바꾸면 옛 계정의 예약을 멈춘다 — 서버 전용 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishError } from "@/lib/meta/publish-errors";
import { notifyUser } from "@/lib/notify";
import { channelLabel } from "@/lib/publish-rules";
import type { CurrentAccount } from "@/lib/publish/account-core";

/*
  발행 글의 대상 계정 — 쓰기 쪽 (2026-09-12 계정 전환, 0094). 규칙의 정본은 lib/publish/account-core.ts 머리말.

  부르는 곳:
   · 새 글(publish/actions.ts createPost · app/api/studio/schedule)  → stampPostTarget(예약·지금 발행일 때만, 초안은 대상 없음)
   · 예약하기·다시 예약(scheduleDraft) · 「지금 발행」(publishNow)     → stampPostTarget(그 순간 연결된 계정으로 다시 정한다)
   · 인스타·스레드 연동 콜백의 «다른 계정으로 바꾸기»                  → attributeUnstampedPosts(바꾸기 전) + stopPostsOfPreviousAccount(바꾼 뒤)
   · 연동 해제(settings/channels/actions.ts)                          → attributeUnstampedPosts(지운 계정으로 이력 묶기)
  발행 엔진(lib/publish/run.ts)은 대상이 비어 있는 옛 글을 나갈 때 지금 계정으로 적고, 대상과 지금 계정이 다르면 올리지 않는다.

  전부 admin(service_role)이다 — 로그인 사용자는 이 칸을 쓸 권한이 없다(0094, 서버 전용 칸). admin 은 RLS 를 우회하므로
  **user_id 필터가 곧 권한이다.** connected_accounts 는 칸을 적어 읽는다(select("*") 금지 — 0085 토큰 칸).
*/

/**
 * 지금 그 채널에 연결된 계정 — 토큰은 읽지 않는다.
 * ok:false = 조회 **실패**(«연결 없음»이 아니다). account:null = 연결이 없다.
 */
export async function loadCurrentAccount(
  admin: SupabaseClient,
  userId: string,
  channel: string,
): Promise<{ ok: true; account: CurrentAccount | null } | { ok: false }> {
  const { data, error } = await admin
    .from("connected_accounts")
    .select("platform_user_id, handle")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("connected", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[publish] 연결 계정 조회 실패:", channel, error.message);
    return { ok: false };
  }
  const row = data as { platform_user_id?: unknown; handle?: unknown } | null;
  const id = row && row.platform_user_id !== null && row.platform_user_id !== undefined ? String(row.platform_user_id).trim() : "";
  if (!id) return { ok: true, account: null };
  return { ok: true, account: { platformUserId: id, handle: typeof row?.handle === "string" ? row.handle : null } };
}

/** 대상 계정을 다시 정할 수 있는 상태 — 발행을 약속하는 조작(예약·지금 발행)이 닿는 상태만 */
type RetargetableStatus = "draft" | "scheduled" | "failed" | "processing";

/**
 * 글에 대상 계정을 적는다 — **지금** 그 채널에 연결된 계정. 발행을 시도한 글은 절대 바꾸지 않는다(이미 옛 계정에 올라갔을 수 있다).
 * 실패해도 글을 막지 않는다(로그만) — 엔진이 발행 때 한 번 더 본다: 대상이 비면 지금 계정으로 나가며 적고, 옛 대상이 남았는데
 * 계정이 다르면 올리지 않고 «계정이 바뀌었어요»로 멈춘다(사용자가 다시 예약하면 된다).
 * 반환: 실제로 적었나(한 행이 바뀌었나).
 */
export async function stampPostTarget(
  admin: SupabaseClient,
  opts: { postId: string; userId: string; channel: string; statuses: RetargetableStatus[] },
): Promise<boolean> {
  const acc = await loadCurrentAccount(admin, opts.userId, opts.channel);
  if (!acc.ok) return false;
  const { data, error } = await admin
    .from("scheduled_posts")
    .update({ account_platform_id: acc.account?.platformUserId ?? null, account_handle: acc.account?.handle ?? null })
    .eq("id", opts.postId)
    .eq("user_id", opts.userId)
    .eq("channel", opts.channel)
    .in("status", opts.statuses)
    .is("publish_attempted_at", null)
    .select("id");
  if (error) {
    console.error("[publish] 대상 계정 기록 실패(글은 그대로):", opts.postId, error.message);
    return false;
  }
  return (data?.length ?? 0) === 1;
}

/**
 * 계정 전환·해제 ① — 아직 대상이 비어 있는 글(0094 전에 만든 옛 글)에 **옛 계정**을 적는다.
 * 연동 콜백은 연결 행을 새 계정으로 고치기 **전에** 부른다 — 고친 뒤엔 옛 계정 id 를 알 곳이 없다.
 *  · 발행 이력: 옛 계정 글이 새 계정 것처럼 보이지 않는다(«@옛 · 이전 계정»).
 *  · 아직 안 나간 글: 대상이 옛 계정으로 묶여 새 계정으로 나가지 않는다(엔진이 막고, ② 가 곧바로 실패로 내린다).
 * 초안은 뺀다 — 대상이 없는 것이 정상이다(예약하는 순간 정해진다). 실패는 로그만(연결 자체는 막지 않는다).
 */
export async function attributeUnstampedPosts(
  admin: SupabaseClient,
  userId: string,
  channel: string,
  prev: CurrentAccount,
): Promise<void> {
  const { error } = await admin
    .from("scheduled_posts")
    .update({ account_platform_id: prev.platformUserId, account_handle: prev.handle })
    .eq("user_id", userId)
    .eq("channel", channel)
    .is("account_platform_id", null)
    .neq("status", "draft");
  if (error) console.error("[publish] 옛 계정 이력 기록 실패(발행 때 엔진이 다시 본다):", channel, error.message);
}

/**
 * 계정 전환 ② — 연결 행을 새 계정으로 고친 **뒤에**, 옛 계정이 대상인 예약·처리 중(발행 시도 전) 글을 곧바로 실패로 내린다.
 * 연동 해제(settings/channels/actions.ts)와 같은 모양이다. 발행을 시도한 글은 건드리지 않는다 — 옛 계정에 이미 올라갔을 수 있고,
 * 엔진이 다음 확인에서 «올라갔는지 모름»으로 멈춘다. 발행 중(publishing)인 글은 이미 옛 토큰을 들고 옛 계정으로 나가는 중이라 둔다.
 *
 * 대상이 **비어 있는** 예약도 함께 내린다 — 바꾸기를 시작하기 전에(switchStartedAt) 만든 것만. 예약은 연결이 있어야 잡히므로
 * 그 글은 새 계정이 연결되기 전에 잡힌 것이다(새 계정 것이 아니다). ① 이 실패해 옛 계정을 못 적었어도 새 계정으로 새지 않게 하는 두 번째 줄이다.
 *
 * ⚠️ 고치기 **전에** 하지 않는 이유: 고치기가 실패하면(다른 핀치 사용자가 이미 연결한 계정 — 23505) 계정은 그대로인데
 *    멀쩡한 예약만 실패로 떨어진다. 고친 뒤 ~ 여기 사이에 크론이 집은 글은 엔진이 대상 계정을 보고 막는다.
 * 멈춘 글이 있으면 알림을 하나 남긴다. 반환: 멈춘 글 수(쓰기가 실패한 묶음은 빠진다 — 로그를 남기고, 남은 글은 엔진이 막는다).
 */
export async function stopPostsOfPreviousAccount(
  admin: SupabaseClient,
  userId: string,
  channel: string,
  prev: CurrentAccount,
  switchStartedAt: string,
): Promise<number> {
  const err = publishError("ACCOUNT_SWITCHED", channel);
  const fields = { status: "failed", error: err.message, error_code: err.code, next_check_at: null, processing_deadline: null };
  /* 대상이 비어 있던 글은 멈추면서 옛 계정도 적는다 — ① 이 한 일과 같다(목록이 «@옛 · 이전 계정»으로 보인다) */
  const stampPrev = { ...fields, account_platform_id: prev.platformUserId, account_handle: prev.handle };
  const targets = [
    { label: "옛 계정 대상", scope: () => admin.from("scheduled_posts").update(fields).eq("account_platform_id", prev.platformUserId) },
    {
      label: "대상 없음(옛 글)",
      scope: () => admin.from("scheduled_posts").update(stampPrev).is("account_platform_id", null).lt("created_at", switchStartedAt),
    },
  ];
  let stopped = 0;
  for (const t of targets) {
    const a = await t.scope().eq("user_id", userId).eq("channel", channel).eq("status", "scheduled").select("id");
    if (a.error) console.error(`[publish] 계정 전환 — ${t.label} 예약 글 정리 실패:`, channel, a.error.message);
    const b = await t.scope().eq("user_id", userId).eq("channel", channel).eq("status", "processing").is("publish_attempted_at", null).select("id");
    if (b.error) console.error(`[publish] 계정 전환 — ${t.label} 처리 중 글 정리 실패:`, channel, b.error.message);
    stopped += (a.data?.length ?? 0) + (b.data?.length ?? 0);
  }
  if (stopped > 0) {
    const label = channelLabel(channel);
    await notifyUser(admin, {
      userId,
      type: "studio",
      title: "계정을 바꿔서 예약한 게시물을 멈췄어요",
      body: `${label} 연결 계정이 바뀌어 ${prev.handle ? `${prev.handle} 계정으로 ` : "이전 계정으로 "}예약해 둔 게시물 ${stopped}개를 올리지 않았어요. 새 계정으로 올리려면 「발행」 화면에서 다시 예약해 주세요.`,
    });
  }
  return stopped;
}
