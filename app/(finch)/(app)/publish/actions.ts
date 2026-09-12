"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storagePathsFromPublicUrls } from "@/lib/storage/public-url";
import { isDemoMode } from "@/lib/supabase/config";
import { parseKstDateTimeLocal } from "@/lib/calendar";
import { publishGate } from "@/lib/publish/gate";
import { advanceClaimedPost, claimPost, type EnginePost } from "@/lib/publish/run";
import { stampPostTarget } from "@/lib/publish/account";
import { publishDbErrorText } from "@/lib/publish/db-errors";
import { MEDIA_PURGED_MESSAGE } from "@/lib/meta/publish-errors";
import { isOwnMediaPath } from "@/lib/publish/media-core";
import { cleanupDeletedPostMedia, finalizeUploads, issueUploadTickets, purgeUnattachedUploads } from "@/lib/publish/uploads";
import type { FinalizeResult, PublishUploadRequest, PublishUploadTicket } from "@/lib/publish/upload-types";
import {
  IG_STORY_ENABLED,
  PUBLISHABLE_CHANNELS,
  channelLabel,
  hasBlockingIssue,
  resolveIgSurface,
  validateMediaSet,
  validatePostText,
  type IgSurface,
  type MediaItemFacts,
  type PublishChannel,
} from "@/lib/publish-rules";

/*
  발행 액션 — 업로드·초안·예약·지금 발행 (2026-08-16 신설 → 2026-09-09 «예약 시각 + 지금 발행» → 2026-09-11 영상·섞인 캐러셀).

  2026-09-11 영상 발행:
   · 사진·영상은 브라우저가 Storage(publish-media, 비공개)로 **직접** 올린다 — createPublishUploads 가 경로·서명 토큰을 주고,
     finalizePublishUploads 가 크기·형식·첫 바이트를 확인한다(lib/publish/uploads.ts). 서버 액션 본문엔 경로만 오간다.
   · 새 글은 create_publish_post(0093, service_role)로만 만든다 — 업로드를 잠그고 확인된 것만 붙인다.
   · 발행은 여러 번의 실행에 걸친 상태 기계다(lib/publish/run.ts). 「지금 발행」은 할 수 있는 만큼 나아가고,
     메타가 영상을 처리 중이면 processing 으로 내려놓는다 — 매분 크론이 이어서 올리고 알림을 보낸다.

  2026-09-12 비동기 「지금 발행」(사장님 지시 «발행 중에 나가면 취소되냐? 누르면 목록에 올리는 중이 뜨고 나가도 괜찮게»):
   · 액션은 글을 만들고(또는 확인하고) **선점까지만** 한 뒤 바로 돌아온다 — 선점이 끝난 행은 'publishing' 이라 크론이 못 집고,
     응답에 실린 목록(revalidatePath)에 곧바로 «올리는 중»으로 나온다. 메타에 올리는 일은 after()(next/server)가 응답 **뒤에** 한다.
   · after 는 Server Action 안에서 쓸 수 있고(Next 문서 after.md), Vercel 에서는 waitUntil 로 함수 수명을 늘려 **이 페이지의
     maxDuration(120초) 안에서** 돈다. 그래서 엔진 예산은 액션이 시작된 시각부터 세어 NOW_TOTAL_BUDGET_MS(105초) 안에서 끝낸다.
     사용자가 창을 닫거나 다른 화면으로 가도 서버 쪽 일은 계속된다(연결이 끊겨도 waitUntil 이 붙잡는다).
   · 예산 안에 못 끝나면(영상 처리 등) 엔진이 행을 processing 으로 내려놓고 매분 크론이 이어서 올린다 — 예전과 같다.
   · 함수가 도중에 죽으면 행이 'publishing' 으로 남는다 → 5분 크론이 10분 뒤 회수한다(publish-scheduled ① 회수:
     준비물·시도 기록이 있으면 processing 으로 이어 보고, 없으면 «도중에 끊겼어요» 실패 + 알림).
   · 화면은 가벼운 조회(app/api/publish/progress, GET)로 진행 상황을 따라 보고, 끝나면 한 번 알린다(lib/publish/progress.ts).
   · 끝났을 때의 알림(notifyUser)은 엔진이 그대로 보낸다 — 화면을 나간 사람도 결과를 받는다.

  ⚠️ Server Actions 는 클라이언트마다 **하나씩 차례로** 돈다(node_modules/next/dist/docs/01-app/02-guides/server-actions.md).
     그래서 업로드 발급·확인은 파일 묶음을 한 번에 받는다 — 타일마다 부르면 줄을 선다(예전엔 1분 가까운 「지금 발행」 뒤에 밀렸다 —
     이제 「지금 발행」은 선점만 하고 곧 돌아와 줄을 오래 막지 않는다). 진행 상황 조회가 서버 액션이 아니라 GET 라우트인 것도 같은 이유다.
     확인(finalize)은 revalidatePath 를 부르지 않는다 — 부르면 응답마다 /publish 를 다시 그린다.

  세션 액션은 RLS(auth.uid()=user_id) 위에서 돌고 0093 가드가 상태 전이를 막는다. 토큰·업로드 원장·새 글 만들기는
  admin 으로 하되 **반드시 user_id 로 좁힌다**(admin 은 RLS 를 우회하므로 필터가 곧 권한이다). admin 이 없으면 닫는다.

  2026-09-12 대상 계정(0094, lib/publish/account-core.ts): 발행을 **약속하는** 조작 — 새 글의 예약·지금 발행, 초안·실패 글의
  예약하기·다시 예약, 「지금 발행」 — 은 그 순간 연결된 계정을 글의 대상으로 적는다(stampPostTarget, 서버 전용 칸이라 admin).
  크론은 대상을 바꾸지 않고, 지금 계정이 대상과 다르면 올리지 않는다 — 계정을 바꾼 뒤 옛 예약이 새 계정으로 새지 않는다.
  적기가 실패해도 글은 막지 않는다(엔진이 발행 때 다시 본다). 초안은 대상이 없다(예약하는 순간 정해진다).
*/

/* 「지금 발행」이 쓸 시간 상한. /publish 의 maxDuration(120s) 안에서 DB·알림 몫을 빼고 잡는다 —
   넘기면 플랫폼이 함수를 죽여 실패 처리가 실행되지 않는다. 엔진이 이 값을 흐름 전체 데드라인으로 쓴다.
   after() 안에서 돌아도 같은 함수 실행이다 — TOTAL 은 **액션이 시작된 시각**부터 센다(응답·목록 다시 그리기에 쓴 시간을 뺀다). */
const NOW_BUDGET_MS = 80_000;
const NOW_TOTAL_BUDGET_MS = 105_000;

/* 예시 화면(isDemoMode — 배포 스위치다, 로그인과 무관) 문구. «데모 모드»는 운영 용어라 고객에게 쓰지 않는다 —
   상태만 말한다(«로그인하면 된다»도 거짓 약속이라 쓰지 않는다). 2026-09-12 점검 */
const DEMO_TEXT = {
  upload: "지금은 예시 화면이라 올릴 수 없어요.",
  save: "지금은 예시 화면이라 저장할 수 없어요.",
  publish: "지금은 예시 화면이라 발행할 수 없어요.",
} as const;

/**
 * 「지금 발행」을 누른 결과 — 2026-09-12 부터 **시작했는지**만 말한다. 올라갔는지·실패했는지는 뒤에서 정해지고
 * 목록(진행 상황 조회)과 알림이 알린다.
 */
export type PublishStart =
  /** 선점했고 뒤에서 올리기 시작했다 — 목록에 «올리는 중»으로 보인다 */
  | { state: "started"; label: string }
  /** 저장은 됐고 크론이 곧 집어 간다 — «실패»가 아니라 «지금은 못 했다»(화면이 다르게 말한다) */
  | { state: "deferred"; label: string; error: string };

export type CreatePostResult =
  /** 저장 자체가 안 됐다 — 컴포저는 열린 채로 이유를 보여 준다 */
  | { ok: false; error: string }
  | { ok: true; mode: "draft" | "schedule" }
  /** 저장은 됐고 발행을 시작했다(또는 크론에 맡겼다) — 행은 목록에 남는다 */
  | { ok: true; mode: "now"; outcome: PublishStart };

/** 새 글의 항목 한 개 — 업로드 표(ticket)의 경로 + 브라우저 검사 결과 */
export interface PostMediaInput {
  /** createPublishUploads 가 준 경로(kind image 또는 video, finalize 까지 끝난 것) */
  path: string;
  /** 영상만 — 목록 썸네일로 쓸 커버 JPEG(kind cover 업로드). 없으면 목록에 필름 아이콘 */
  coverPath?: string | null;
  /** 영상만 — 인스타 커버 장면(ms, 0 이상 길이 미만). 없으면 min(1초, 길이/2) */
  thumbOffsetMs?: number | null;
  /* 아래는 브라우저 검사 결과(video-inspect) — 규칙 검사에만 쓴다. 모르면 null(막지 않는다, 메타가 최종 판정) */
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioChannels?: number | null;
  audioSampleRate?: number | null;
}

/* ══════════════════════════════════════════════════════════════════
   업로드 — 발급·확인·버리기
   ══════════════════════════════════════════════════════════════════ */

/**
 * 업로드 자리 발급 — 파일 묶음을 한 번에. 표 순서 = 요청 순서.
 * 발행 관문(연동·권한)을 먼저 본다 — 발행할 수 없는 채널에 파일을 쌓게 두지 않는다(컴포저도 연동된 채널만 고르게 한다).
 * 표는 2시간 뒤 만료된다 — 올리기 직전에 받고, «다시 올리기»는 새 표를 받는다.
 */
export async function createPublishUploads(input: {
  channel: string;
  files: PublishUploadRequest[];
}): Promise<{ ok: true; tickets: PublishUploadTicket[] } | { ok: false; error: string; retryable: boolean }> {
  if (isDemoMode()) return { ok: false, error: DEMO_TEXT.upload, retryable: false };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요.", retryable: false };
  if (!PUBLISHABLE_CHANNELS.includes(input?.channel as PublishChannel)) {
    return { ok: false, error: `${channelLabel(String(input?.channel ?? ""))} 발행은 준비 중이에요.`, retryable: false };
  }
  const supabase = await createClient();
  const gate = await publishGate(supabase, user.id, input.channel as PublishChannel);
  if (!gate.ok) return { ok: false, error: gate.error, retryable: gate.reason === "lookup_failed" };
  const admin = createAdminClient();
  if (!admin) {
    console.error("[publish] 업로드 발급 불가 — 서버 자격증명 미설정");
    return { ok: false, error: "잠시 후 다시 시도해 주세요.", retryable: true };
  }
  return issueUploadTickets(admin, user.id, Array.isArray(input.files) ? input.files : []);
}

/** 올린 뒤 확인 — 경로 묶음을 한 번에. 틀린 파일은 서버가 지운다(ok:false, retryable:false). */
export async function finalizePublishUploads(
  paths: string[],
): Promise<{ ok: true; results: FinalizeResult[] } | { ok: false; error: string; retryable: boolean }> {
  if (isDemoMode()) return { ok: false, error: DEMO_TEXT.upload, retryable: false };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요.", retryable: false };
  const admin = createAdminClient();
  if (!admin) {
    console.error("[publish] 업로드 확인 불가 — 서버 자격증명 미설정");
    return { ok: false, error: "잠시 후 다시 시도해 주세요.", retryable: true };
  }
  return { ok: true, results: await finalizeUploads(admin, user.id, Array.isArray(paths) ? paths : []) };
}

/**
 * 아직 글에 붙지 않은 업로드 버리기 — 타일 제거·작성 취소. 글에 붙은 경로는 건드리지 않는다(원장에서 먼저 차지한 것만 지운다).
 * 실패해도 정리 크론이 24시간 뒤 치운다 — 호출측은 결과를 기다리지 않아도 된다.
 */
export async function discardPublishUploads(paths: string[]): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: true, removed: 0 };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const admin = createAdminClient();
  if (!admin) {
    console.error("[publish] 업로드 버리기 불가 — 서버 자격증명 미설정(정리 크론이 치운다)");
    return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  }
  const list = Array.isArray(paths) ? paths.filter((p) => typeof p === "string").slice(0, 60) : [];
  const removed = await purgeUnattachedUploads(admin, user.id, list);
  return { ok: true, removed: removed.length };
}

/* ══════════════════════════════════════════════════════════════════
   공통 도우미
   ══════════════════════════════════════════════════════════════════ */

/**
 * 예약 시각 판정 — "YYYY-MM-DDTHH:mm"(KST) → ISO.
 * 1분의 여유를 둔다: 화면이 «지금»을 골라 보내는 사이 서버 시계가 앞서 있으면 정상 요청이 «지난 시각»으로 튕긴다.
 * (DB 가드는 5분 여유 — 서버가 먼저 더 좁게 본다)
 */
function resolveScheduledAt(when: string): { ok: true; iso: string } | { ok: false; error: string } {
  const iso = parseKstDateTimeLocal(when);
  if (!iso) return { ok: false, error: "날짜와 시각을 확인해 주세요." };
  if (Date.parse(iso) < Date.now() - 60_000) return { ok: false, error: "지난 시각으로는 예약할 수 없어요." };
  return { ok: true, iso };
}

/**
 * 선점한 글을 **응답 뒤에** 내보낸다(after — 머리말 «비동기 「지금 발행」»). 엔진은 예외를 던지지 않고 결과를 DB·알림에 남긴다 —
 * 여기서는 아무것도 돌려주지 않는다(응답은 이미 나갔다). 예산은 액션이 시작된 시각부터 센다.
 */
function publishInBackground(admin: NonNullable<ReturnType<typeof createAdminClient>>, row: EnginePost, startedAt: number): void {
  after(async () => {
    const budgetMs = Math.min(NOW_BUDGET_MS, Math.max(15_000, NOW_TOTAL_BUDGET_MS - (Date.now() - startedAt)));
    try {
      await advanceClaimedPost(admin, row, { source: "now", budgetMs });
    } catch (e) {
      /* advanceClaimedPost 는 던지지 않게 짜여 있다 — 그래도 새면 행은 publishing 으로 남고 5분 크론이 10분 뒤 회수한다 */
      console.error("[publish] 뒤에서 올리기 예외(크론이 회수한다):", row.id, e);
    }
  });
}

/** 이 글의 채널·상태 — 세션(RLS)으로 읽는다: 못 읽으면 남의 글이거나 없는 글이다(missing — 다른 창에서 지웠다 등) */
async function loadOwnPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<
  | { ok: true; channel: PublishChannel; status: string; mediaPurged: boolean; attempted: boolean }
  | { ok: false; error: string; missing?: true }
> {
  /* ⚠️ «에러든 빈 결과든 인스타»로 뭉치지 않는다 — 조회가 한 번 실패했을 때 스레드 글에 «인스타그램을 연동하세요»라고 말하게 된다 */
  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("channel, status, media_purged_at, publish_attempted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[publish] 글 조회 실패:", error.message);
    return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  }
  if (!data) return { ok: false, error: "이미 처리된 글이에요.", missing: true };
  const channel = (data.channel ?? "instagram") as PublishChannel;
  if (!PUBLISHABLE_CHANNELS.includes(channel)) {
    return { ok: false, error: `${channelLabel(channel)} 발행은 아직 지원하지 않아요.` };
  }
  return {
    ok: true,
    channel,
    status: String(data.status),
    mediaPurged: !!data.media_purged_at,
    attempted: !!data.publish_attempted_at,
  };
}

/* 파일이 지워진 글의 거절 이유 — 문구는 엔진·목록과 한 벌(lib/meta/publish-errors.ts). 결과 모달의 설명은 문장이라 마침표를 붙인다 */
const PURGED_TEXT = `${MEDIA_PURGED_MESSAGE}.`;

/** 「지금 발행」이 거절된 결과. moved = 누르는 사이 **서버에서 글의 상태가 이미 바뀌었다**(다른 창·크론이 먼저 집었거나 지웠다) */
export type PublishNowRejected = { ok: false; error: string; moved?: true };

/**
 * 누르는 사이 글이 이미 다른 데로 갔다 — 응답에 목록을 실어 보내(revalidatePath) 화면이 **진짜 상태**로 맞춘다.
 * 화면은 이 경우 누르기 전 모습으로 되돌리지 않는다(되돌리면 «실패»·«예약됨»이 잠깐 보였다가 새로고침에 «올리는 중»으로 바뀐다 — 2026-09-12 점검).
 */
function movedOn(error: string): PublishNowRejected {
  revalidatePath("/publish");
  return { ok: false, error, moved: true };
}

/* ══════════════════════════════════════════════════════════════════
   초안·실패 글 → 예약 / 지금 발행 / 삭제
   ══════════════════════════════════════════════════════════════════ */

/** 초안·실패 글 → 예약. when 은 "YYYY-MM-DDTHH:mm"(KST). */
export async function scheduleDraft(id: string, when: string): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: DEMO_TEXT.save };
  const at = resolveScheduledAt(when);
  if (!at.ok) return { ok: false, error: at.error };

  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  const post = await loadOwnPost(supabase, id);
  if (!post.ok) return { ok: false, error: post.error };
  if (post.mediaPurged) return { ok: false, error: PURGED_TEXT };
  const gate = await publishGate(supabase, user.id, post.channel);
  if (!gate.ok) return { ok: false, error: gate.error };

  /* 대상 계정 — 예약하는 **지금** 연결된 계정으로 정한다(계정을 바꿔서 멈춘 글은 «다시 예약해 주세요»가 이 줄로 풀린다).
     상태를 바꾸기 **전에** 적는다: 초안·실패 글은 크론이 안 집으므로, 예약으로 바뀐 순간부터는 이미 새 대상이 적혀 있다.
     발행을 시도한 적이 있는 실패 글은 바꾸지 않는다(옛 계정에 올라갔을 수 있다 — stampPostTarget). */
  const admin = createAdminClient();
  if (!admin) console.error("[publish] 예약 전환 — 대상 계정을 적지 못함(서버 자격증명 미설정, 발행 때 엔진이 다시 본다)");
  else await stampPostTarget(admin, { postId: id, userId: user.id, channel: post.channel, statuses: ["draft", "failed"] });

  /* draft 뿐 아니라 **failed 도 받는다.** 발행에 실패한 글은 재시도도 삭제도 안 돼서 목록에 영구히 박제됐다.
     상한(60)·지난 시각·파일 정리된 글은 DB 가드(0093)가 한 번 더 본다 — 실패→예약으로 상한을 우회하지 못하게. */
  const { data, error } = await supabase
    .from("scheduled_posts")
    .update({ status: "scheduled", scheduled_at: at.iso, error: null })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .select("id");
  if (error) {
    console.error("[publish] 예약 전환 실패:", error.message);
    return { ok: false, error: publishDbErrorText(error) ?? "예약으로 바꾸지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 글이에요." };
  revalidatePath("/publish");
  return { ok: true };
}

/**
 * 「지금 발행」 — 초안·예약·실패·처리 중 글을 선점하고 **바로 돌아온다.** 메타에 올리는 일은 응답 뒤(after)에 이어진다.
 * 미리 준비해 둔 예약 영상(processing)이면 준비물이 이미 있어 곧바로 올라간다.
 */
export async function publishNow(id: string): Promise<PublishNowRejected | { ok: true; outcome: PublishStart }> {
  if (isDemoMode()) return { ok: false, error: DEMO_TEXT.publish };
  const startedAt = Date.now();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  const post = await loadOwnPost(supabase, id);
  if (!post.ok) return post.missing ? movedOn(post.error) : { ok: false, error: post.error };
  if (!["draft", "scheduled", "failed", "processing"].includes(post.status)) {
    return movedOn(
      post.status === "published" ? "이미 발행된 글이에요." : post.status === "publishing" ? "지금 올리고 있는 글이에요." : "지금은 발행할 수 없는 상태예요.",
    );
  }
  if (post.mediaPurged) return { ok: false, error: PURGED_TEXT };
  const gate = await publishGate(supabase, user.id, post.channel);
  if (!gate.ok) return { ok: false, error: gate.error };

  /* 토큰 암호문은 admin 으로만 읽는다(0085). 선점·발행 쿼리에 user_id 를 건다 — admin 은 RLS 를 우회한다. */
  const admin = createAdminClient();
  if (!admin) {
    console.error("[publish] 지금 발행 불가 — 서버 자격증명 미설정");
    return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  }
  /* 누르는 순간 연결된 계정이 대상이다 — 확인 모달이 «@지금 계정으로 올라가요»라고 말한 그 계정. 발행을 시도한 글은 바꾸지 않는다 */
  if (!post.attempted) {
    await stampPostTarget(admin, { postId: id, userId: user.id, channel: post.channel, statuses: ["draft", "scheduled", "failed", "processing"] });
  }
  const claimed = await claimPost(admin, id, ["draft", "scheduled", "failed", "processing"], { userId: user.id, publishAfter: "now" });
  if (!claimed.ok) {
    if (claimed.reason === "db_error") return { ok: false, error: "잠시 후 다시 시도해 주세요." };
    /* 선점을 놓쳤다 = 확인과 선점 사이에 다른 실행(다른 창·크론)이 먼저 집었다 — 글은 이미 다른 데서 올라가고 있다 */
    return movedOn("이미 발행이 시작된 글이에요. 잠시 후 목록을 확인해 주세요.");
  }
  publishInBackground(admin, claimed.row, startedAt);
  /* 응답에 목록을 실어 보낸다 — 이 글이 곧바로 «올리는 중»으로 보인다 */
  revalidatePath("/publish");
  return { ok: true, outcome: { state: "started", label: channelLabel(post.channel) } };
}

/** 초안·실패·취소 글 삭제. 발행**된** 글은 지울 수 없다 — 이력이다(DB 가드도 같은 규칙, 0093).
    실패·취소 글은 이력이 아니라 «못 나간 글»이므로 지울 수 있어야 한다(안 그러면 파일이 영구히 남는다). */
export async function deleteDraft(id: string): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: DEMO_TEXT.save };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scheduled_posts")
    .delete()
    .eq("id", id)
    .in("status", ["draft", "failed", "canceled"])
    .select("id, image_urls, media");
  if (error) {
    console.error("[publish] 삭제 실패:", error.message);
    return { ok: false, error: publishDbErrorText(error) ?? "삭제하지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 글이에요." };
  const row = data[0] as { image_urls?: unknown; media?: unknown };

  /* 사진·영상도 **실제로** 지운다(2026-09-08 감사) — 화면은 「되돌릴 수 없어요」라고 말하고 개인정보처리방침도 삭제를 확언한다.
     순서: DB 먼저, Storage 는 뒤 — 반대로 하면 객체는 지웠는데 행이 남아 발행 때 404 가 된다.
     옛 cardnews 는 이 행 전용 URL 이라 세션으로 바로 지운다(되짚지 못한 URL 은 지우지 않는다).
     publish-media 는 응답 뒤(after)에 admin 으로 — 원장에서 먼저 차지한 경로만 지운다. 실패하면 정리 크론(24시간)이 치운다. */
  const paths = storagePathsFromPublicUrls(row.image_urls, "cardnews", user.id);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from("cardnews").remove(paths);
    if (rmErr) console.error("[publish] 초안 이미지 삭제 실패(행은 지워짐):", rmErr.message);
  }
  if (row.media) {
    const userId = user.id;
    after(async () => {
      const admin = createAdminClient();
      if (!admin) {
        console.error("[publish] 글 파일 정리 불가 — 서버 자격증명 미설정(정리 크론이 치운다)");
        return;
      }
      await cleanupDeletedPostMedia(admin, userId, row.media);
    });
  }
  revalidatePath("/publish");
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   새 게시물 포스팅
   ══════════════════════════════════════════════════════════════════ */

/**
 * 게시물을 만들어 지금 발행 / 예약 / 초안으로 넣는다.
 *
 * 채널: 실제 발행 어댑터가 있는 것만(instagram·threads). 틱톡은 발행 API 자체가 없다.
 * 채널별 상한(글자·개수·길이·해상도…)은 lib/publish-rules.ts 가 정한다 — 컴포저와 같은 함수를 부른다.
 *
 * 사진·영상: media(업로드 표의 경로, 순서 = 게시물 순서). 인스타는 1개 영상 → 릴스, 1개 사진 → 사진 게시물,
 * 2~10개 → 캐러셀(섞어도 된다), igStory(항목 1개) → 스토리. 스레드는 0~20개(글만도 된다).
 *
 * mode=now 는 행을 예약(지금)으로 넣고 선점한 뒤 바로 돌아온다 — 올리는 일은 응답 뒤(after)에 이어진다(머리말).
 * 컴포저는 곧바로 닫히고 목록 맨 위에 «올리는 중»이 보인다. 선점을 못 했어도 저장은 된 것이라 ok:true(deferred) —
 * 크론이 곧 집어 간다(열어 둔 채 오류만 보이면 같은 글을 두 번 올리게 된다).
 */
export async function createPost(input: {
  channel: string;
  caption: string;
  /** 직접 업로드한 사진·영상(업로드 표의 경로) — 순서 = 게시물 순서. 없으면 글만(스레드) */
  media?: PostMediaInput[];
  /** 인스타 — 항목이 정확히 1개일 때 스토리로 */
  igStory?: boolean;
  /** 인스타 릴스 — 피드에도 보이기(기본 켬) */
  shareToFeed?: boolean;
  mode: "now" | "schedule" | "draft";
  /** mode=schedule 일 때 "YYYY-MM-DDTHH:mm"(KST) */
  when?: string;
}): Promise<CreatePostResult> {
  if (isDemoMode()) return { ok: false, error: DEMO_TEXT.save };
  const startedAt = Date.now();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  if (!PUBLISHABLE_CHANNELS.includes(input.channel as PublishChannel)) {
    return { ok: false, error: `${channelLabel(input.channel)} 발행은 준비 중이에요.` };
  }
  const channel = input.channel as PublishChannel;

  const mediaIn = Array.isArray(input.media) ? input.media : [];
  if (mediaIn.length > 20) return { ok: false, error: "사진·영상이 너무 많아요." };

  /* 시각 검증은 초안 예약 전환(scheduleDraft)과 같은 규칙 */
  let scheduledAt: string;
  if (input.mode === "schedule") {
    const at = resolveScheduledAt(input.when ?? "");
    if (!at.ok) return { ok: false, error: at.error };
    scheduledAt = at.iso;
  } else {
    /* 초안의 scheduled_at 은 "만든 시각"의 의미다(0043). 지금 발행도 «지금». 실제 발행 시각은 published_at 에 따로 적힌다. */
    scheduledAt = new Date().toISOString();
  }

  const supabase = await createClient();
  /* 예약·지금 발행은 발행 약속이다 — 연동 없이 받으면 반드시 실패한다. 초안은 연동을 요구하지 않는다. */
  if (input.mode !== "draft") {
    const gate = await publishGate(supabase, user.id, channel);
    if (!gate.ok) return { ok: false, error: gate.error };
  }
  const admin = createAdminClient();
  if (!admin) {
    console.error("[publish] 저장 불가 — 서버 자격증명 미설정");
    return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  }

  /* ── 업로드 확인 — 종류·크기는 원장(서버가 확인한 값)에서, 길이·해상도·코덱은 브라우저 검사값에서 ── */
  const paths: string[] = [];
  for (const m of mediaIn) {
    if (!m || !isOwnMediaPath(m.path, user.id)) return { ok: false, error: "올린 파일을 확인하지 못했어요 — 다시 올려 주세요." };
    paths.push(m.path);
    if (m.coverPath !== null && m.coverPath !== undefined) {
      if (!isOwnMediaPath(m.coverPath, user.id, "cover")) return { ok: false, error: "커버 이미지를 확인하지 못했어요 — 다시 골라 주세요." };
      paths.push(m.coverPath);
    }
  }
  const uploads = new Map<string, { kind: string; actual_bytes: number | null; finalized_at: string | null; purged_at: string | null; post_id: string | null }>();
  if (paths.length > 0) {
    const { data, error } = await admin
      .from("publish_uploads")
      .select("path, kind, actual_bytes, finalized_at, purged_at, post_id")
      .eq("user_id", user.id)
      .in("path", paths);
    if (error) {
      console.error("[publish] 업로드 원장 조회 실패:", error.message);
      return { ok: false, error: "잠시 후 다시 시도해 주세요." };
    }
    for (const r of (data ?? []) as Array<{ path: string } & Parameters<typeof uploads.set>[1]>) uploads.set(r.path, r);
  }
  const ready = (p: string) => {
    const u = uploads.get(p);
    return !!u && !!u.finalized_at && !u.purged_at && !u.post_id;
  };
  const facts: MediaItemFacts[] = [];
  for (const m of mediaIn) {
    const u = uploads.get(m.path);
    if (!u || !ready(m.path) || (u.kind !== "image" && u.kind !== "video")) {
      return { ok: false, error: "아직 올라가지 않은 파일이 있어요 — 다 올라간 뒤 저장해 주세요." };
    }
    if (m.coverPath && (!ready(m.coverPath) || uploads.get(m.coverPath)?.kind !== "cover" || u.kind !== "video")) {
      return { ok: false, error: "커버 이미지가 아직 올라가지 않았어요 — 잠시 후 다시 저장해 주세요." };
    }
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
    facts.push({
      kind: u.kind,
      bytes: u.actual_bytes,
      width: num(m.width),
      height: num(m.height),
      durationMs: num(m.durationMs),
      fps: num(m.fps),
      videoCodec: typeof m.videoCodec === "string" ? m.videoCodec : null,
      audioCodec: typeof m.audioCodec === "string" ? m.audioCodec : null,
      audioChannels: num(m.audioChannels),
      audioSampleRate: num(m.audioSampleRate),
    });
  }

  /* ── 게시 면·규칙 ── */
  const surface: IgSurface | null =
    channel === "instagram"
      ? resolveIgSurface({ count: facts.length, firstKind: facts[0]?.kind ?? null, story: !!input.igStory && IG_STORY_ENABLED })
      : null;
  const story = surface === "story";
  const caption = story ? "" : String(input.caption ?? "").trim();
  const textErr = validatePostText(channel, surface, caption, facts.length);
  if (textErr) return { ok: false, error: textErr };
  const issues = validateMediaSet(channel, surface, facts);
  if (hasBlockingIssue(issues)) return { ok: false, error: issues.find((i) => i.severity === "error")?.message ?? "사진·영상을 확인해 주세요." };

  const media =
    facts.length === 0
      ? null
      : mediaIn.map((m, i) => {
          const f = facts[i];
          const video = f.kind === "video";
          let thumb = video && typeof m.thumbOffsetMs === "number" && Number.isFinite(m.thumbOffsetMs) && m.thumbOffsetMs >= 0 ? Math.round(m.thumbOffsetMs) : null;
          /* 메타는 커버 위치가 영상 길이 **미만**이어야 받는다(2207057) */
          if (thumb !== null && f.durationMs !== null) thumb = Math.min(thumb, Math.max(0, Math.floor(f.durationMs) - 1));
          return {
            kind: f.kind,
            path: m.path,
            cover_path: video && m.coverPath ? m.coverPath : null,
            thumb_offset_ms: thumb,
            duration_ms: f.durationMs !== null ? Math.round(f.durationMs) : null,
            width: f.width !== null ? Math.round(f.width) : null,
            height: f.height !== null ? Math.round(f.height) : null,
            bytes: f.bytes,
          };
        });

  const { data: newId, error: insErr } = await admin.rpc("create_publish_post", {
    p_user_id: user.id,
    p_channel: channel,
    p_caption: caption,
    p_ig_surface: surface,
    p_share_to_feed: input.shareToFeed !== false,
    p_media: media,
    p_status: input.mode === "draft" ? "draft" : "scheduled",
    p_scheduled_at: scheduledAt,
  });
  if (insErr || typeof newId !== "string") {
    const known = publishDbErrorText(insErr);
    if (!known) console.error("[publish] 게시물 생성 실패:", insErr?.message ?? "id 없음");
    return {
      ok: false,
      error: known ?? (/check/i.test(insErr?.message ?? "") ? "사진·영상 구성이 맞지 않아요 — 다시 골라 주세요." : "저장하지 못했어요. 잠시 후 다시 시도해 주세요."),
    };
  }

  /* 대상 계정 — 예약·지금 발행은 지금 연결된 계정(관문이 방금 확인했다). 초안은 대상이 없다(예약하는 순간 정해진다).
     create_publish_post(0093) 본문을 다시 쓰지 않고 뒤따라 적는다 — 함수 본문을 두 벌로 두면 한쪽만 고치는 날이 온다.
     실패해도 글은 그대로(로그) — 엔진이 나갈 때 지금 계정을 적는다. 「지금 발행」은 이 뒤에 선점하므로 순서가 보장된다. */
  if (input.mode !== "draft") await stampPostTarget(admin, { postId: newId, userId: user.id, channel, statuses: ["scheduled"] });

  if (input.mode !== "now") {
    revalidatePath("/publish");
    return { ok: true, mode: input.mode };
  }
  return runNow(admin, newId, user.id, channel, startedAt);
}

/** 방금 만든 글을 선점하고 뒤에서 내보낸다 — 응답은 곧바로 나간다 */
async function runNow(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
  userId: string,
  channel: PublishChannel,
  startedAt: number,
): Promise<CreatePostResult> {
  const label = channelLabel(channel);
  const claimed = await claimPost(admin, id, ["scheduled"], { userId, publishAfter: "now" });
  if (!claimed.ok) {
    revalidatePath("/publish");
    return {
      ok: true,
      mode: "now",
      outcome: {
        state: "deferred",
        label,
        error:
          claimed.reason === "db_error"
            ? "지금 바로는 올리지 못했어요. 몇 분 안에 자동으로 다시 올려요."
            : "발행이 이미 시작됐어요. 잠시 후 목록을 확인해 주세요.",
      },
    };
  }
  publishInBackground(admin, claimed.row, startedAt);
  /* 응답에 목록을 실어 보낸다 — 컴포저가 닫히는 순간 이 글이 «올리는 중»으로 보인다 */
  revalidatePath("/publish");
  return { ok: true, mode: "now", outcome: { state: "started", label } };
}
