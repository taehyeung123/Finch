/* 토큰 암호문을 풀고 알림을 만든다 — 서버 밖으로 나가면 안 된다 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto/tokens";
import { notifyUser } from "@/lib/notify";
import { iGa } from "@/lib/josa";
import { channelLabel, isPublishableChannel, type IgSurface } from "@/lib/publish-rules";
import { Deadline } from "@/lib/meta/deadline";
import { makeInstagramAdapter } from "@/lib/meta/instagram-publish";
import { makeThreadsAdapter } from "@/lib/meta/threads-publish";
import {
  accountSwitchedError,
  isFormatError,
  mapContainerError,
  mapGraphFailure,
  publishError,
  type PublishError,
  type PublishErrorCode,
} from "@/lib/meta/publish-errors";
import type { ContainerCheck, ContainerSpec, ContainerStatus, PublishAdapter } from "@/lib/meta/publish-types";
import {
  LOOKUP_GRACE_MS,
  POLL_INTERVAL_MS,
  PUBLISH_MIN_REMAINING_MS,
  containerWindow,
  isExtendedDeadline,
  matchRecentMedia,
  nextStep,
  processingDeadlineFor,
  publishRetryEndMs,
  type EngineSource,
} from "@/lib/publish/engine-core";
import { consumeFetchBudget, mintFetchUrls, parsePostMedia } from "@/lib/publish/media";
import type { ResolvedItem } from "@/lib/publish/media-core";
import { safePermalink } from "@/lib/publish/list-item";
import { targetAccountMismatch } from "@/lib/publish/account-core";

/*
  게시물 한 건을 **실제로 내보내는** 엔진 (2026-09-09 신설 → 2026-09-11 영상·섞인 캐러셀을 위한 상태 기계로 재작성).

  부르는 곳 넷 — 전부 claimPost 로 행을 publishing 으로 선점한 뒤 advanceClaimedPost 에 넘긴다:
   · 「지금 발행」(publish/actions.ts createPost·publishNow)  source "now"
   · 5분 크론(app/api/cron/publish-scheduled)                 source "due"(예약 시각이 지난 글)·"prepare"(20분 안 예약 영상 미리 만들기)
   · 매분 크론(app/api/cron/publish-processing)               source "check"(처리 중인 글 이어 보기)

  한 번의 실행이 할 수 있는 만큼 나아가고, 메타가 아직 처리 중이면 행을 processing 으로 내려놓는다(next_check_at).
  다음 걸음은 engine-core.ts nextStep 이 정한다 — 두 번 올리지 않기 규칙은 그 파일 머리말.

  ⚠️ 선점(claim)이 곧 중복 방지다. 크론·「지금 발행」이 같은 행을 동시에 잡아도 `update … where status in (…)` 는 한쪽만 성공한다.
  그리고 엔진은 **선점이 돌려준 행**만 믿는다 — 조회해 둔 옛 사본으로 움직이면, 그 사이 다른 실행이 적어 둔
  «발행 시도함»을 못 보고 두 번 올린다(2026-09-11 점검).

  대상 계정(2026-09-12 계정 전환, 0094 — 규칙 정본 lib/publish/account-core.ts):
   · 글에 적힌 대상 계정(account_platform_id)과 지금 연결된 계정이 다르면 **올리지 않는다** — 메타를 한 번도 부르지 않고
     «예약할 때 연결돼 있던 @A 계정이 아니라 지금은 @B 계정이 …»로 실패 + 알림(시도한 뒤라면 «올라갔는지 모름»).
     예전엔 발행할 때마다 지금 연결된 계정의 토큰을 써서, A 로 예약한 글이 B 로 바꾼 뒤 B 로 올라갔다.
   · 대상이 비어 있는 옛 글은 지금 계정으로 나간다 — 선점 직후 그 계정을 대상으로 적는다(여러 번의 실행에 걸친 영상 글이
     중간에 계정이 바뀌어도 새 계정으로 새지 않게). 올라가면 실제로 올린 계정(id·지금 이름)을 적는다.
*/

/** 엔진이 읽는 컬럼 — 선점(claimPost)이 이 모양으로 돌려준다 */
export const ENGINE_POST_COLUMNS =
  "id, user_id, channel, caption, image_urls, media, ig_surface, share_to_feed, status, scheduled_at, publish_after, " +
  "container_id, child_container_ids, container_created_at, container_owner_id, processing_deadline, next_check_at, " +
  "publish_attempted_at, publish_calls, claimed_at, prepare_attempted_at, container_window_at, container_window_count, media_purged_at, " +
  "account_platform_id, account_handle";

export interface EnginePost {
  id: string;
  user_id: string;
  channel: string;
  caption: string;
  image_urls: string[] | null;
  media: unknown;
  ig_surface: IgSurface | null;
  share_to_feed: boolean;
  status: string;
  scheduled_at: string;
  publish_after: string | null;
  container_id: string | null;
  child_container_ids: string[] | null;
  container_created_at: string | null;
  container_owner_id: string | null;
  processing_deadline: string | null;
  next_check_at: string | null;
  publish_attempted_at: string | null;
  publish_calls: number;
  claimed_at: string | null;
  prepare_attempted_at: string | null;
  container_window_at: string | null;
  container_window_count: number;
  media_purged_at: string | null;
  /** 대상 계정(0094) — null 이면 옛 글(지금 계정으로 나가며 적는다). '__previous__' 는 발행된 옛 글에만 있다 */
  account_platform_id: string | null;
  account_handle: string | null;
}

export type ClaimResult = { ok: true; row: EnginePost } | { ok: false; reason: "lost" | "db_error" };

/**
 * 행을 publishing 으로 선점하고 **선점한 그 행**을 돌려준다. `from` 에 든 상태일 때만 성공한다.
 *
 * @param opts.userId      서버 액션 경로는 **반드시** 넘긴다 — admin 은 RLS 를 우회하므로 이 필터가 곧 권한이다.
 * @param opts.notBefore   크론이 조회한 scheduled_at — 그 사이 예약 시각이 바뀌었으면 선점하지 않는다.
 * @param opts.publishAfter now = 「지금 발행」(누른 시각부터 발행 가능) / scheduled = 예약 시각(notBefore)부터 / keep = 그대로(처리 중 이어 보기)
 * @param opts.markPrepare 미리 만들기 — 행마다 한 번만 한다(prepare_attempted_at)
 *
 * ⚠️ scheduled_at 은 건드리지 않는다(2026-09-09). 실제 발행 시각은 published_at 에 따로 적는다.
 */
export async function claimPost(
  admin: SupabaseClient,
  id: string,
  from: Array<"draft" | "scheduled" | "failed" | "processing">,
  opts: { userId?: string; notBefore?: string; publishAfter: "now" | "scheduled" | "keep"; markPrepare?: boolean },
): Promise<ClaimResult> {
  const nowIso = new Date().toISOString();
  const fields: Record<string, unknown> = { status: "publishing", error: null, error_code: null, claimed_at: nowIso };
  if (opts.publishAfter === "now") fields.publish_after = nowIso;
  if (opts.publishAfter === "scheduled") {
    if (!opts.notBefore) return { ok: false, reason: "lost" };
    fields.publish_after = opts.notBefore;
  }
  if (opts.markPrepare) fields.prepare_attempted_at = nowIso;
  let q = admin.from("scheduled_posts").update(fields).eq("id", id).in("status", from).is("media_purged_at", null);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.notBefore) q = q.eq("scheduled_at", opts.notBefore);
  const { data, error } = await q.select(ENGINE_POST_COLUMNS);
  if (error) {
    console.error("[publish] 선점 실패:", id, error.message);
    return { ok: false, reason: "db_error" };
  }
  const rows = (data ?? []) as unknown as EnginePost[];
  if (rows.length !== 1) return { ok: false, reason: "lost" };
  return { ok: true, row: rows[0] };
}

export type AdvanceOutcome =
  | { kind: "published"; label: string; mediaId: string | null; permalink: string | null }
  /** 메타가 처리 중 — 행은 processing, 매분 크론이 이어 본다. soon = 준비는 끝났고 다음 확인에서 올라간다 */
  | { kind: "processing"; label: string; hasVideo: boolean; publishAfter: string; soon: boolean }
  | { kind: "failed"; label: string; error: string; code: PublishErrorCode }
  /** 이번엔 못 했다 — 행은 예약으로 돌아갔고 5분 크론이 다시 집는다(scheduledAt 이 미래면 그 시각에) */
  | { kind: "released"; label: string; scheduledAt: string }
  /** 선점을 잃었다(다른 실행이 가져갔다) — 이 실행은 손을 뗀다 */
  | { kind: "conflict"; label: string };

type WriteResult = { ok: true } | { ok: false; reason: "lost_claim" | "db_error" };

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);
const sleep = (t: number) => new Promise((r) => setTimeout(r, t));

/** 인라인 대기(같은 실행 안에서 몇 초 뒤 다시 보기) 한 번의 간격 */
const INLINE_STEP_MS = 2_500;
/** 소스별 인라인 대기 상한 — 「지금 발행」은 결과를 바로 보여 주려고 길게, 크론은 다른 글을 위해 짧게 */
const INLINE_LIMIT_MS: Record<EngineSource, number> = { now: 55_000, due: 30_000, check: 10_000, prepare: 12_000 };
/** 준비물 하나 만드는 데 드는 대략의 시간(예산 판단용) */
const CREATE_EACH_MS = 2_500;
/** 예약 시각이 이만큼 지난 글은 일시 오류로 계속 미루지 않고 실패로 멈춘다 */
const STALE_DUE_MS = 2 * 3600_000;

/**
 * 선점한 행을 한 걸음 이상 나아가게 하고 결과를 DB·알림에 남긴다. **예외를 던지지 않는다.**
 * 어떤 경로로 끝나든 행은 published·processing·failed·scheduled 중 하나로 내려앉는다(publishing 으로 굳히지 않는다 —
 * 함수가 죽어 굳은 행은 5분 크론이 10분 뒤 회수한다).
 *
 * @param opts.budgetMs 이 호출이 쓸 시간. 호출측 실행시간 예산 안이어야 한다 — 넘기면 플랫폼이 함수를 죽인다.
 */
export async function advanceClaimedPost(
  admin: SupabaseClient,
  post: EnginePost,
  opts: { source: EngineSource; budgetMs: number },
): Promise<AdvanceOutcome> {
  const label = channelLabel(post.channel);
  try {
    return await advance(admin, post, opts.source, opts.budgetMs);
  } catch (e) {
    console.error("[publish] 엔진 예외:", post.id, e);
    /* 준비물이 있으면 처리 중으로 내려놓는다(다음 확인이 시도 여부부터 본다). 없으면 안전하게 실패. */
    const hasContainers = !!post.container_id || (post.child_container_ids?.length ?? 0) > 0;
    const fields = hasContainers
      ? {
          status: "processing",
          next_check_at: iso(Date.now() + POLL_INTERVAL_MS),
          processing_deadline: post.processing_deadline ?? iso(Date.now() + 10 * 60_000),
        }
      : { status: "failed", error: publishError("TRANSIENT", post.channel).message, error_code: "TRANSIENT", next_check_at: null };
    await admin.from("scheduled_posts").update(fields).eq("id", post.id).eq("status", "publishing");
    return hasContainers
      ? { kind: "processing", label, hasVideo: false, publishAfter: post.publish_after ?? post.scheduled_at, soon: false }
      : { kind: "failed", label, error: publishError("TRANSIENT", post.channel).message, code: "TRANSIENT" };
  }
}

async function advance(admin: SupabaseClient, post: EnginePost, source: EngineSource, budgetMs: number): Promise<AdvanceOutcome> {
  const startedAt = Date.now();
  const deadline = new Deadline(budgetMs);
  const channel = post.channel;
  const label = channelLabel(channel);
  const publishAfterMs = Number.isFinite(ms(post.publish_after)) ? ms(post.publish_after) : ms(post.scheduled_at);
  const scheduledMs = ms(post.scheduled_at);

  /* ── 기록 도우미 — 전부 id + status='publishing' 가드, 정확히 1행이 바뀌어야 성공 ── */
  const write = async (fields: Record<string, unknown>, guard: boolean): Promise<WriteResult> => {
    let q = admin.from("scheduled_posts").update(fields).eq("id", post.id);
    if (guard) q = q.eq("status", "publishing");
    const { data, error } = await q.select("id");
    if (error) {
      console.error("[publish] 기록 실패:", post.id, error.message);
      return { ok: false, reason: "db_error" };
    }
    return data && data.length === 1 ? { ok: true } : { ok: false, reason: "lost_claim" };
  };

  /* 진행 상태(이번 실행에서 바뀐다) */
  const st = {
    containerId: post.container_id,
    childIds: post.child_container_ids && post.child_container_ids.length > 0 ? post.child_container_ids : null,
    createdAtMs: Number.isFinite(ms(post.container_created_at)) ? ms(post.container_created_at) : null,
    ownerId: post.container_owner_id,
    deadlineMs: Number.isFinite(ms(post.processing_deadline)) ? ms(post.processing_deadline) : null,
    attemptedAtMs: Number.isFinite(ms(post.publish_attempted_at)) ? ms(post.publish_attempted_at) : null,
    calls: post.publish_calls ?? 0,
    windowAtMs: Number.isFinite(ms(post.container_window_at)) ? ms(post.container_window_at) : null,
    windowCount: post.container_window_count ?? 0,
    childStates: null as ContainerStatus[] | null,
    containerState: null as ContainerStatus | null,
    lastError: null as ContainerCheck | null,
    lookup: null as "found" | "not_found" | null,
    hit: null as { id: string; permalink: string | null } | null,
  };
  const hasContainers = () => st.containerId !== null || (st.childIds !== null && st.childIds.length > 0);

  let items: ResolvedItem[] = [];
  const hasVideo = () => items.some((i) => i.kind === "video");

  const processingOutcome = (soon: boolean): AdvanceOutcome => ({
    kind: "processing",
    label,
    hasVideo: hasVideo(),
    publishAfter: iso(publishAfterMs),
    soon,
  });

  /** processing 으로 내려놓는다 — 매분 크론이 atMs 이후에 이어 본다 */
  const toProcessing = async (atMs: number, extra: Record<string, unknown> = {}, soon = false): Promise<AdvanceOutcome> => {
    const deadlineIso = iso(st.deadlineMs ?? processingDeadlineFor(st.createdAtMs ?? Date.now(), items));
    const w = await write({ status: "processing", next_check_at: iso(atMs), processing_deadline: deadlineIso, ...extra }, true);
    if (!w.ok && w.reason === "lost_claim") return { kind: "conflict", label };
    /* db_error 면 행은 publishing 으로 남는다 — 5분 크론이 10분 뒤 준비물이 있는 행을 processing 으로 되돌린다 */
    return processingOutcome(soon);
  };

  /** 실패로 확정. recreate = 준비물·시도 기록을 비워 «다시 시도»가 새로 만들게 한다(시도한 적이 있으면 절대 비우지 않는다) */
  const fail = async (err: PublishError, o: { recreate: boolean; extra?: Record<string, unknown> } = { recreate: false }): Promise<AdvanceOutcome> => {
    let e = err;
    let recreate = o.recreate;
    if (recreate && st.attemptedAtMs !== null) {
      /* 시도한 행의 준비물을 버리면 다음 시도가 새 준비물로 **두 번째 게시물**을 만든다 — 모르는 채로 멈춘다 */
      e = publishError("PUBLISH_AMBIGUOUS", channel, `recreate_after_attempt: ${err.code}`);
      recreate = false;
    }
    console.error("[publish] 실패:", post.id, channel, source, e.code, e.raw ?? "");
    const fields: Record<string, unknown> = {
      status: "failed",
      error: e.message,
      error_code: e.code,
      next_check_at: null,
      ...(o.extra ?? {}),
    };
    if (recreate) {
      Object.assign(fields, {
        container_id: null,
        child_container_ids: null,
        container_created_at: null,
        container_owner_id: null,
        processing_deadline: null,
        publish_attempted_at: null,
        publish_calls: 0,
      });
    }
    const w = await write(fields, true);
    if (!w.ok) return w.reason === "lost_claim" ? { kind: "conflict", label } : { kind: "failed", label, error: e.message, code: e.code };
    const purged = e.code === "MEDIA_PURGED" || !!post.media_purged_at;
    /* 미리 만들기의 실패 문구(«…받지 않았어요»)는 메타가 거절한 경우의 말이다 — 계정이 바뀌어 우리가 멈춘 것은 일반 실패 문구로 */
    const prepareCopy = source === "prepare" && e.code !== "ACCOUNT_SWITCHED";
    await notifyUser(admin, {
      userId: post.user_id,
      type: "studio",
      title: prepareCopy ? "예약한 게시물을 준비하지 못했어요" : "발행에 실패했어요",
      body: prepareCopy
        ? `${iGa(label)} 예약한 게시물을 받지 않았어요 — ${e.message}. 「발행」 화면에서 지운 뒤 다시 만들어 예약해 주세요.`
        : `${label} 게시물을 올리지 못했어요 — ${e.message}. 「발행」 화면에서 ${purged ? "지울" : "다시 시도하거나 지울"} 수 있어요.`,
    });
    return { kind: "failed", label, error: e.message, code: e.code };
  };

  /**
   * 이번 시도의 창이 끝났다(처리 마감·발행 재시도 끝) — 실패로 멈춘다. engine-core 머리말 «처리 창».
   *  recreate=false(첫 창): 준비물은 남기고 **마감만 비운다** — «다시 시도»가 새 창을 연다(아래 «처리 창» 열기).
   *  recreate=true(다시 연 창): 준비물을 버린다 — 다음 시도가 새로 만든다.
   */
  const endWindow = (err: PublishError, recreate: boolean, extra: Record<string, unknown> = {}): Promise<AdvanceOutcome> =>
    recreate ? fail(err, { recreate: true, extra }) : fail(err, { recreate: false, extra: { ...extra, processing_deadline: null } });

  /** 예약으로 되돌린다 — 예약 시각이 지났으면 5분 크론이 곧 다시 집는다(준비물이 없을 때만 쓴다) */
  const release = async (): Promise<AdvanceOutcome> => {
    const w = await write({ status: "scheduled" }, true);
    if (!w.ok && w.reason === "lost_claim") return { kind: "conflict", label };
    return { kind: "released", label, scheduledAt: post.scheduled_at };
  };

  /**
   * 일시 오류·예산 부족 — 소스별로 «다음에 다시»를 고른다.
   *  준비물이 있으면 processing(매분 크론), 없으면 scheduled 로 되돌린다(5분 크론 — 예약 시각이 미래면 그 시각에).
   *  예약 시각이 2시간 넘게 지난 글은 일시 오류가 끝없이 반복되지 않게 실패로 멈춘다.
   */
  const later = async (err: PublishError | null, atMs = Date.now() + POLL_INTERVAL_MS): Promise<AdvanceOutcome> => {
    if (err) console.warn("[publish] 다음에 다시:", post.id, channel, source, err.code, err.raw ?? "");
    if (hasContainers()) return toProcessing(atMs);
    const stale = Number.isFinite(scheduledMs) && Date.now() - scheduledMs > STALE_DUE_MS;
    if (!stale) return release();
    return fail(err ?? publishError("TRANSIENT", channel));
  };

  /** 오류 → 걸음. 미리 만들기는 형식 오류만 실패로 확정한다 — 나머지는 예약 시각의 본 발행에 맡긴다(행마다 미리 만들기는 한 번) */
  const onError = async (err: PublishError): Promise<AdvanceOutcome> => {
    if (source === "prepare" && !isFormatError(err)) return later(err);
    switch (err.kind) {
      case "transient":
      case "not_ready":
      case "ambiguous":
        return later(err);
      case "recreate":
        return fail(err, { recreate: true });
      case "auth":
      case "permanent":
        return fail(err, { recreate: false });
    }
  };

  /* ── 0. 발행 가능한 글인가 ── */
  if (!isPublishableChannel(channel)) return fail(publishError("UNSUPPORTED_CHANNEL", channel));
  if (post.media_purged_at) return fail(publishError("MEDIA_PURGED", channel));
  const parsed = parsePostMedia(post);
  if (!parsed.ok) return fail(parsed.error, { recreate: true });
  items = parsed.items;
  if (channel === "instagram" && items.length === 0) return fail(publishError("MEDIA_INVALID", channel, "ig_without_media"), { recreate: true });
  const surface: IgSurface | null = channel === "instagram" ? (post.ig_surface ?? "feed") : null;
  const carousel = items.length >= 2;

  /* 처리 창 열기 — 준비물은 있는데 마감이 비어 있으면 «다시 시도»다(마감을 넘겨 실패한 글은 endWindow 가 마감만 비운다).
     이번 시도의 새 창을 연다. 옛 마감을 그대로 쓰면 상태를 한 번 읽고 곧바로 또 실패한다(2026-09-12 점검).
     여기서 연 창은 첫 창보다 늦으므로 isExtendedDeadline 이 참이 된다 — 이 창마저 넘기면 준비물을 버린다. */
  if (hasContainers() && st.deadlineMs === null) st.deadlineMs = processingDeadlineFor(Date.now(), items);

  /* ── 1. 연동 — 토큰은 **글 소유자**의 것이다(팀원이 만든 글은 팀원 자신의 연동으로 나간다). 암호문 AAD 도 같은 userId 라야 풀린다 ── */
  const { data: account, error: accErr } = await admin
    .from("connected_accounts")
    .select("platform_user_id, handle, access_token_cipher, token_expires_at")
    .eq("user_id", post.user_id)
    .eq("channel", channel)
    .eq("connected", true)
    .maybeSingle();
  if (accErr) {
    /* 조회 «실패»는 «연동 없음»이 아니다 — 멀쩡한 연동을 끊긴 것으로 알리지 않는다 */
    return later(publishError("LOOKUP_FAILED", channel, accErr.message));
  }
  const token = decryptToken(account?.access_token_cipher ?? null, {
    userId: post.user_id,
    field: "connected_accounts.access_token_cipher",
  });
  if (!account?.platform_user_id || !token) return onError(publishError("NOT_CONNECTED", channel));
  if (account.token_expires_at && new Date(account.token_expires_at).getTime() <= Date.now()) {
    return onError(publishError("TOKEN_EXPIRED", channel));
  }
  const platformUserId = String(account.platform_user_id);
  const currentHandle = typeof account.handle === "string" && account.handle.trim() ? account.handle.trim() : null;

  /* 대상 계정(머리말) — 다르면 아래 걸음 반복의 첫 걸음(nextStep ⓪)이 메타를 부르지 않고 멈춘다.
     비어 있으면(옛 글) 지금 계정을 대상으로 **먼저** 적는다: 영상 글은 여러 번의 실행에 걸쳐 나아가는데, 그 사이 계정을 바꾸면
     다음 확인이 새 계정으로 준비물을 다시 만들어 새 계정에 올렸다. 못 적어도(DB 오류) 이번 실행은 이 계정으로 계속한다 —
     연동 콜백이 바꾸는 순간 비어 있는 글에 옛 계정을 적고, 올라가면 recordPublished 가 다시 적는다. */
  const targetMismatch = targetAccountMismatch(post.account_platform_id, platformUserId);
  if (!post.account_platform_id) {
    const pin = await write({ account_platform_id: platformUserId, account_handle: currentHandle }, true);
    if (!pin.ok && pin.reason === "lost_claim") return { kind: "conflict", label };
  }

  const adapter: PublishAdapter =
    channel === "threads" ? makeThreadsAdapter(platformUserId, token) : makeInstagramAdapter(platformUserId, token);

  const caption = post.caption?.trim() ?? "";
  const thumbOffset = (it: ResolvedItem): number | null => {
    if (it.kind !== "video" || it.source !== "publish-media") return null;
    if (it.thumbOffsetMs !== null) return it.thumbOffsetMs;
    /* 컴포저가 목록 커버를 min(1초, 길이/2) 지점에서 뜬다 — 메타 커버도 같은 장면으로(안 보내면 첫 프레임) */
    return it.durationMs !== null ? Math.min(1000, Math.floor(it.durationMs / 2)) : 1000;
  };

  /* 준비물 사양 — 채널·면·항목 수로 정한다 */
  const childSpec = (it: ResolvedItem, url: string): ContainerSpec =>
    it.kind === "video"
      ? { type: "video", url, caption: null, carouselItem: true, thumbOffsetMs: channel === "instagram" ? thumbOffset(it) : null }
      : { type: "image", url, caption: null, carouselItem: true };
  const singleSpec = (url: string | null): ContainerSpec | null => {
    const it = items[0];
    if (channel === "threads") {
      if (!it) return caption ? { type: "text", caption } : null;
      if (!url) return null;
      return it.kind === "video"
        ? { type: "video", url, caption: caption || null, carouselItem: false, thumbOffsetMs: null }
        : { type: "image", url, caption: caption || null, carouselItem: false };
    }
    if (!it || !url) return null;
    if (surface === "story") return { type: "story", url, mediaKind: it.kind };
    if (it.kind === "video") {
      return { type: "reels", url, caption, shareToFeed: post.share_to_feed !== false, thumbOffsetMs: thumbOffset(it) };
    }
    return { type: "image", url, caption: caption || null, carouselItem: false };
  };

  /**
   * 새 준비물 묶음을 만들기 전 관문 — 게시물당 하루 3번·하루 전송 예산.
   * 반환: null = 통과 / AdvanceOutcome = 이 실행은 여기서 끝(실패·다음에 다시·선점 잃음)
   */
  const beforeNewSet = async (): Promise<AdvanceOutcome | null> => {
    const win = containerWindow(Date.now(), st.windowAtMs, st.windowCount);
    if (!win.allowed) return onError(publishError("POST_RETRY_LIMIT", channel));
    const budget = await consumeFetchBudget(admin, post.user_id, items, channel);
    if (!budget.ok) return onError(budget.error);
    /* 창 기록을 먼저 남긴다 — 만들다 실패해도 센다(실패를 무한 반복하며 파일을 받아 가게 하지 않는다) */
    const w = await write({ container_window_at: iso(win.windowAtMs), container_window_count: win.count }, true);
    if (!w.ok) return w.reason === "lost_claim" ? { kind: "conflict", label } : later(publishError("TRANSIENT", channel, "window_write"));
    st.windowAtMs = win.windowAtMs;
    st.windowCount = win.count;
    return null;
  };

  const readStatus = async (id: string): Promise<{ status: ContainerStatus; check: ContainerCheck | null }> => {
    const r = await adapter.check(id, deadline);
    if (r.ok) return { status: r.data.status, check: r.data };
    const mapped = mapGraphFailure(channel, "status", r.failure);
    if (mapped.code === "CONTAINER_EXPIRED") return { status: "EXPIRED", check: null };
    console.warn("[publish] 상태 읽기 실패:", post.id, mapped.raw ?? "");
    return { status: "UNKNOWN", check: null };
  };

  const recordPublished = async (mediaId: string | null, permalinkRaw: string | null): Promise<AdvanceOutcome> => {
    let permalink = safePermalink(permalinkRaw);
    if (!permalink && mediaId && deadline.remaining() > 3_000) permalink = safePermalink(await adapter.permalink(mediaId, deadline));
    /* ⚠️ 여기서부터는 글이 **이미 올라간 뒤**다. 상태 가드 없이(회수 로직이 processing 으로 옮겼어도) 세 번까지 다시 쓰고,
       끝내 안 되면 media id 를 로그에 남겨 손으로 맞춘다. 알림은 실제로 바뀐 행이 있을 때만(두 번 알리지 않는다). */
    const fields = {
      status: "published",
      ig_media_id: mediaId,
      permalink,
      published_at: new Date().toISOString(),
      error: null,
      error_code: null,
      next_check_at: null,
      /* 실제로 올린 계정 — 대상과 같다(다르면 여기까지 오지 않는다). 이름은 지금 이름으로(그 사이 바꿨을 수 있다) */
      account_platform_id: platformUserId,
      account_handle: currentHandle,
    };
    let changed = false;
    let recorded = false;
    for (let attempt = 1; attempt <= 3 && !recorded; attempt++) {
      const { data, error } = await admin.from("scheduled_posts").update(fields).eq("id", post.id).neq("status", "published").select("id");
      if (!error) {
        recorded = true;
        changed = !!data && data.length === 1;
      } else {
        console.error(`[publish] 발행 기록 실패(${attempt}/3):`, post.id, error.message);
        await sleep(500 * attempt);
      }
    }
    if (!recorded) {
      console.error("[publish] CRITICAL 발행됐지만 기록하지 못함 — 수동 대조 필요:", { postId: post.id, channel, mediaId });
    }
    if (changed) {
      const wasScheduled = source === "due" || (source === "check" && Number.isFinite(scheduledMs) && publishAfterMs === scheduledMs);
      await notifyUser(admin, {
        userId: post.user_id,
        type: "studio",
        title: wasScheduled ? "예약한 게시물이 발행됐어요" : "게시물이 발행됐어요",
        body: `${label}에 게시물이 올라갔어요.`,
      });
    }
    return { kind: "published", label, mediaId, permalink };
  };

  /* ── 2. 걸음 반복 — 한 바퀴는 메타 호출 하나 또는 짧은 대기 하나다. 시간 예산(deadline)이 실제 상한이고 이 수는 안전판이다 ── */
  for (let guard = 0; guard < 200; guard++) {
    const step = nextStep({
      source,
      nowMs: Date.now(),
      publishAfterMs,
      carousel,
      childIds: st.childIds,
      childStates: st.childStates,
      containerId: st.containerId,
      containerState: st.containerState,
      containerCreatedAtMs: st.createdAtMs,
      deadlineMs: st.deadlineMs,
      deadlineExtended: isExtendedDeadline(st.createdAtMs, st.deadlineMs, items),
      publishAttemptedAtMs: st.attemptedAtMs,
      publishCalls: st.calls,
      lookup: st.lookup,
      ownerMismatch: !!st.ownerId && st.ownerId !== platformUserId,
      targetMismatch,
      remainingMs: deadline.remaining(),
    });

    switch (step.do) {
      case "reset": {
        const w = await write(
          { container_id: null, child_container_ids: null, container_created_at: null, container_owner_id: null, processing_deadline: null },
          true,
        );
        if (!w.ok) return w.reason === "lost_claim" ? { kind: "conflict", label } : later(publishError("TRANSIENT", channel, "reset_write"));
        Object.assign(st, { containerId: null, childIds: null, createdAtMs: null, ownerId: null, deadlineMs: null, childStates: null, containerState: null });
        continue;
      }

      case "create_children": {
        if (deadline.remaining() < CREATE_EACH_MS * (items.length + 1) + 5_000) return later(null);
        const gate = await beforeNewSet();
        if (gate) return gate;
        const minted = await mintFetchUrls(admin, items, channel);
        if (!minted.ok) return onError(minted.error);
        const ids: string[] = [];
        for (let i = 0; i < items.length; i++) {
          const r = await adapter.create(childSpec(items[i], minted.urls[i]), deadline);
          if (!r.ok) return onError(mapGraphFailure(channel, "create", r.failure));
          ids.push(r.data.id);
        }
        const createdAt = Date.now();
        const dl = processingDeadlineFor(createdAt, items);
        const w = await write(
          { child_container_ids: ids, container_created_at: iso(createdAt), container_owner_id: platformUserId, processing_deadline: iso(dl) },
          true,
        );
        if (!w.ok) return w.reason === "lost_claim" ? { kind: "conflict", label } : later(publishError("TRANSIENT", channel, "children_write"));
        Object.assign(st, { childIds: ids, createdAtMs: createdAt, ownerId: platformUserId, deadlineMs: dl, childStates: null });
        continue;
      }

      case "check_children": {
        const states: ContainerStatus[] = [];
        st.lastError = null;
        for (const id of st.childIds ?? []) {
          const r = await readStatus(id);
          states.push(r.status);
          if (r.status === "ERROR" && !st.lastError) st.lastError = r.check;
        }
        st.childStates = states;
        continue;
      }

      case "create_container": {
        if (deadline.remaining() < CREATE_EACH_MS + 5_000) return later(null);
        let spec: ContainerSpec | null;
        const newSet = !carousel;
        if (carousel) {
          spec = { type: "carousel", children: st.childIds ?? [], caption: caption || null };
        } else {
          const gate = await beforeNewSet();
          if (gate) return gate;
          let url: string | null = null;
          if (items.length > 0) {
            const minted = await mintFetchUrls(admin, items, channel);
            if (!minted.ok) return onError(minted.error);
            url = minted.urls[0];
          }
          spec = singleSpec(url);
        }
        if (!spec) return fail(publishError("MEDIA_INVALID", channel, "no_spec"), { recreate: true });
        const r = await adapter.create(spec, deadline);
        if (!r.ok) return onError(mapGraphFailure(channel, "create", r.failure));
        const createdAt = Date.now();
        const fields: Record<string, unknown> = { container_id: r.data.id };
        if (newSet) {
          const dl = processingDeadlineFor(createdAt, items);
          Object.assign(fields, { container_created_at: iso(createdAt), container_owner_id: platformUserId, processing_deadline: iso(dl) });
          Object.assign(st, { createdAtMs: createdAt, ownerId: platformUserId, deadlineMs: dl });
        }
        const w = await write(fields, true);
        if (!w.ok) return w.reason === "lost_claim" ? { kind: "conflict", label } : later(publishError("TRANSIENT", channel, "container_write"));
        st.containerId = r.data.id;
        st.containerState = null;
        continue;
      }

      case "check_container": {
        const r = await readStatus(st.containerId as string);
        st.containerState = r.status;
        st.lastError = r.status === "ERROR" ? r.check : null;
        continue;
      }

      case "lookup": {
        const r = await adapter.recent(deadline);
        if (!r.ok) {
          /* 목록을 못 읽었다 — 유예 안이면 다음 확인에서 다시, 지나면 «못 찾음»으로 본다(준비물 상태가 1차 신호다) */
          if (st.attemptedAtMs !== null && Date.now() - st.attemptedAtMs < LOOKUP_GRACE_MS) {
            return toProcessing(Date.now() + POLL_INTERVAL_MS);
          }
          st.lookup = "not_found";
          continue;
        }
        const hit = matchRecentMedia(r.data, { sinceMs: st.attemptedAtMs ?? st.createdAtMs ?? Date.now(), caption });
        st.lookup = hit ? "found" : "not_found";
        st.hit = hit ? { id: hit.id, permalink: hit.permalink } : null;
        continue;
      }

      case "record_published": {
        if (!st.hit && st.lookup === null && caption && deadline.remaining() > 5_000) {
          /* 준비물이 PUBLISHED 인데 게시물 id 를 모른다 — 링크를 위해 한 번만 찾아본다(못 찾아도 기록한다) */
          const r = await adapter.recent(deadline);
          const hit = r.ok ? matchRecentMedia(r.data, { sinceMs: st.attemptedAtMs ?? st.createdAtMs ?? Date.now(), caption }) : null;
          if (hit) st.hit = { id: hit.id, permalink: hit.permalink };
        }
        return recordPublished(st.hit?.id ?? null, st.hit?.permalink ?? null);
      }

      case "wait": {
        /* 처리 중이면 같은 실행 안에서 몇 초 뒤 다시 본다(사진은 보통 몇 초면 끝난다) — 소스별 상한 안에서만 */
        const elapsed = Date.now() - startedAt;
        const inline =
          step.reason === "processing" &&
          elapsed + INLINE_STEP_MS < INLINE_LIMIT_MS[source] &&
          deadline.remaining() > INLINE_STEP_MS + PUBLISH_MIN_REMAINING_MS + 3_000;
        if (inline) {
          await sleep(INLINE_STEP_MS);
          st.childStates = null;
          st.containerState = null;
          continue;
        }
        return toProcessing(step.untilMs, {}, step.reason === "budget");
      }

      case "fail": {
        if (step.code === "ACCOUNT_SWITCHED") {
          /* 대상 계정이 아니다 — 준비물·시도 기록은 그대로 두고(두 번 올리지 않기), 마감만 비운다(다시 시도가 새 창을 연다).
             시도 전: «@A 가 아니라 지금은 @B …» / 시도 뒤: «올라갔는지 모름»(옛 계정에서 확인하라고 말한다) */
          const err = accountSwitchedError(channel, post.account_handle, currentHandle, st.attemptedAtMs !== null);
          return fail(err, { recreate: false, extra: { processing_deadline: null } });
        }
        if (step.code === "CONTAINER_ERROR") {
          const err = st.lastError ? mapContainerError(channel, st.lastError) : publishError("CONTAINER_ERROR", channel);
          if (source === "prepare" && !isFormatError(err)) return later(err);
          return fail(err, { recreate: step.recreate });
        }
        if (step.code === "PROCESSING_TIMEOUT") return endWindow(publishError(step.code, channel), step.recreate);
        return fail(publishError(step.code, channel), { recreate: step.recreate });
      }

      case "publish": {
        const prevAt = st.attemptedAtMs;
        const prevCalls = st.calls;
        if (prevCalls === 0) {
          /* 하루 한도 — 못 읽으면 막지 않는다(메타가 2207042 로 최종 판정한다) */
          const q = await adapter.quota(deadline);
          if (q && q.usage >= q.total) return fail(publishError("QUOTA", channel, `quota ${q.usage}/${q.total}`));
        }
        if (deadline.remaining() < PUBLISH_MIN_REMAINING_MS) return toProcessing(Date.now() + 15_000, {}, true);
        /* ① 시도 기록이 **먼저** 남아야 부른다 — 기록 없이 부르면 끊겼을 때 두 번 올릴 수 있다 */
        const at = Date.now();
        const w = await write({ publish_attempted_at: iso(at), publish_calls: prevCalls + 1 }, true);
        if (!w.ok) return w.reason === "lost_claim" ? { kind: "conflict", label } : toProcessing(Date.now() + POLL_INTERVAL_MS);
        st.attemptedAtMs = at;
        st.calls = prevCalls + 1;

        const r = await adapter.publish(st.containerId as string, deadline);
        if (r.ok) return recordPublished(r.data.id, null);

        const err = mapGraphFailure(channel, "publish", r.failure);
        const restore = { publish_attempted_at: prevAt === null ? null : iso(prevAt), publish_calls: prevCalls };
        if (err.kind === "ambiguous") {
          /* 올라갔는지 모른다 — 시도 기록을 남긴 채 다음 확인이 목록부터 본다 */
          console.warn("[publish] 발행 결과 모름 — 다음 확인에서 대조:", post.id, err.raw ?? "");
          return toProcessing(Date.now() + POLL_INTERVAL_MS);
        }
        if (prevAt !== null) {
          /* 두 번째 호출이 거절됐다 — 첫 호출이 사실은 올렸을 수 있다(«이미 올라감» 거절). 모르는 채로 멈춘다 */
          return fail(publishError("PUBLISH_AMBIGUOUS", channel, `second_call_rejected: ${err.raw ?? err.code}`));
        }
        /* 여기부터는 메타가 **거절을 확실히 답한** 첫 호출이다 — 안 올라갔다. 시도로 세지 않는다(메모리 상태도 되돌려야
           fail 이 «시도한 행»으로 오인해 모름으로 바꾸지 않는다) */
        st.attemptedAtMs = prevAt;
        st.calls = prevCalls;
        if (err.kind === "not_ready" || err.kind === "transient") {
          /* 2207027 «아직 처리 중»·2207008 등 «잠시 뒤 다시»(메타 권고) — 다음 확인이 상태부터 다시 읽고(없어진 준비물이면
             거기서 만료로 보고 새로 만든다) 다시 발행한다. 끝이 있다: 처리 마감과 발행 시각 중 늦은 쪽 + 15분을 넘기면
             이번 시도를 멈춘다 — 예전엔 준비물이 «발행 가능»인 한 매분 끝없이(23시간마다 새 준비물로) 불렀다. */
          if (Date.now() > publishRetryEndMs(st.deadlineMs, publishAfterMs)) {
            const final = err.kind === "not_ready" ? publishError("PROCESSING_TIMEOUT", channel, err.raw) : err;
            return endWindow(final, isExtendedDeadline(st.createdAtMs, st.deadlineMs, items), restore);
          }
          return toProcessing(Date.now() + POLL_INTERVAL_MS, restore, err.kind === "not_ready");
        }
        return fail(err, { recreate: err.kind === "recreate", extra: restore });
      }
    }
  }
  console.error("[publish] 걸음 상한 초과:", post.id);
  return later(publishError("TRANSIENT", channel, "step_guard"));
}
