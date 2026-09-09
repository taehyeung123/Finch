"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storagePathsFromPublicUrls } from "@/lib/storage/public-url";
import { isDemoMode } from "@/lib/supabase/config";
import { parseKstDateTimeLocal } from "@/lib/calendar";
import { eulReul } from "@/lib/josa";
import { REQUIRED_SCOPE, checkScope } from "@/lib/meta/granted-scopes";
import { claimPost, runClaimedPost } from "@/lib/publish/run";
import {
  PUBLISHABLE_CHANNELS,
  channelRules,
  channelLabel,
  isMissingColumnError,
  type PublishChannel,
} from "@/lib/publish-rules";

/*
  발행 액션 — 초안·예약·지금 발행 (2026-08-16 신설 → 2026-09-09 «예약 시각 + 지금 발행» 으로 개편).

  2026-09-09 까지 발행은 하루 한 번(06:00 KST) 배치였고 「즉시 발행」은 비활성이었다 — Vercel Hobby 시절의
  크론 제약이 Pro 로 옮긴 뒤에도 남아 있었다. 그래서 예약은 «날짜»만 받았고, 낮에 예약한 글은 다음 날 아침에야
  나갔다. 지금은 크론이 5분마다 돌고(lib/publish/run.ts), 여기서 «시각»을 받으며, 「지금 발행」은 그 자리에서
  내보내고 결과를 돌려준다.

  액션들은 RLS(auth.uid()=user_id) 위에서 돌고, 상태 전이마다 .in("status", …) 를 건다 —
  id 만 맞으면 이미 발행된 글까지 손댈 수 있으면 안 된다. 토큰을 만지는 「지금 발행」만 admin 클라이언트를
  쓰되(0085 — 암호문은 서버만 읽는다), 그 앞에서 RLS 로 본인 행임을 먼저 확인하고 admin 쿼리에도 user_id 를 건다.
*/

/* 「지금 발행」이 메타 쪽 흐름(아이템 생성·컨테이너·폴링·발행 합계)에 쓸 시간 상한. /publish 의 maxDuration(120s)
   안에서 이미지 업로드·DB·알림 몫을 빼고 잡는다 — 넘기면 플랫폼이 액션을 죽여 실패 처리가 실행되지 않는다.
   어댑터가 이 값을 **전체 흐름**의 데드라인으로 쓰므로(instagram-publish.ts) 장수와 무관하게 이 안에서 끝난다.
   createPost 는 업로드에 쓴 시간만큼 더 줄인다(아래). */
const NOW_WAIT_BUDGET_MS = 80_000;
const NOW_TOTAL_BUDGET_MS = 105_000;

/** 「지금 발행」의 결과 — 화면이 모달로 그린다 */
export type PublishOutcome =
  | { published: true; label: string }
  /** deferred: 저장은 됐고 크론이 5분 안에 집어 간다 — «실패»가 아니라 «지금은 못 했다»다(화면이 다르게 말한다) */
  | { published: false; error: string; label: string; deferred?: boolean };

export type CreatePostResult =
  /** 저장 자체가 안 됐다 — 컴포저는 열린 채로 이유를 보여 준다 */
  | { ok: false; error: string }
  | { ok: true; mode: "draft" | "schedule" }
  /** 저장은 됐고 발행을 시도했다 — 성공이든 실패든 행은 목록에 남는다 */
  | { ok: true; mode: "now"; outcome: PublishOutcome };

/**
 * 연동 계정 + 부여된 스코프 조회. 0075 미적용 DB 폴백 포함.
 *
 * ⚠️ granted_scopes 컬럼이 없는 DB 에서 그냥 select 하면 **예약 자체가 깨진다** —
 * 지금 잘 돌아가는 기능을 마이그레이션 적용 전까지 죽이는 셈이다. 컬럼 없음이면 없이 다시 조회한다.
 * 반환의 scopes=null 은 «확인 불가» 다(«권한 없음» 이 아니다).
 */
async function loadConnectedAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  channel: PublishChannel,
): Promise<{ ok: true; found: boolean; scopes: string[] | null } | { ok: false }> {
  const base = () =>
    supabase
      .from("connected_accounts")
      .select("id, granted_scopes")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("connected", true)
      .limit(1)
      .maybeSingle();

  const res = await base();
  if (isMissingColumnError(res.error, /granted_scopes/i)) {
    const fallback = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("connected", true)
      .limit(1)
      .maybeSingle();
    if (fallback.error) {
      console.error("[publish] 연동 확인 실패:", fallback.error.message);
      return { ok: false };
    }
    return { ok: true, found: !!fallback.data, scopes: null };
  }
  if (res.error) {
    /* 조회 실패를 «연동 없음»으로 읽으면 멀쩡히 연동한 사람에게 연동하라고 말한다 —
       이 저장소가 반복해 밟은 «실패는 없음이 아니다» 함정이다. */
    console.error("[publish] 연동 확인 실패:", res.error.message);
    return { ok: false };
  }
  const row = res.data as { granted_scopes?: string[] | null } | null;
  return { ok: true, found: !!row, scopes: row?.granted_scopes ?? null };
}

/**
 * 발행 관문 — 예약이든 지금 발행이든 «발행 약속»을 받기 전에 같은 것을 본다.
 * ⚠️ user_id 로 반드시 좁힌다. connected_accounts 에는 "team members read" 정책이 있어 팀원이 **소유자의**
 * 연동 행을 읽는다 — 안 좁히면 자기 계정엔 연동이 없는데 관문을 통과하고, 발행은 user_id 로 토큰을 찾으므로
 * 반드시 실패한다.
 */
async function publishGate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  channel: PublishChannel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const acc = await loadConnectedAccount(supabase, userId, channel);
  if (!acc.ok) return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  if (!acc.found) return { ok: false, error: `먼저 설정에서 ${channelLabel(channel)} 계정을 연동해 주세요.` };
  /* 발행 권한이 **확실히 없으면** 여기서 막는다 — 받아 두면 크론이 돌 때 권한 오류로 실패하고, 그 사이 사용자는
     발행될 거라고 믿는다. 확인 불가(0075 이전 연동)면 통과시킨다 — 모른다고 멀쩡한 예약을 막지 않는다. */
  const scopeCheck = checkScope(
    acc.scopes,
    channel === "threads" ? REQUIRED_SCOPE.threadsPublish : REQUIRED_SCOPE.instagramPublish,
  );
  if (scopeCheck.state === "missing") {
    return { ok: false, error: `${channelLabel(channel)} 발행 권한이 없어요. 설정에서 다시 연동하면 바로 쓸 수 있어요.` };
  }
  return { ok: true };
}

/**
 * 예약 시각 판정 — "YYYY-MM-DDTHH:mm"(KST) → ISO.
 * 1분의 여유를 둔다: 화면이 «지금»을 골라 보내는 사이 서버 시계가 앞서 있으면 정상 요청이 «지난 시각»으로 튕긴다.
 */
function resolveScheduledAt(when: string): { ok: true; iso: string } | { ok: false; error: string } {
  const iso = parseKstDateTimeLocal(when);
  if (!iso) return { ok: false, error: "날짜와 시각을 확인해 주세요." };
  if (Date.parse(iso) < Date.now() - 60_000) return { ok: false, error: "지난 시각으로는 예약할 수 없어요." };
  return { ok: true, iso };
}

/** 이 글의 채널 — 0053 미적용 DB 에서는 컬럼이 없고, 그 시절 큐는 전부 인스타 카드뉴스였다 */
async function loadPostChannel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<{ ok: true; channel: PublishChannel } | { ok: false; error: string }> {
  /* ⚠️ 세 갈래를 뭉치면 안 된다 — «에러든 빈 결과든 인스타»로 두면 조회가 한 번 실패했을 때
     스레드 글을 예약하려던 사람에게 «인스타그램을 연동하세요»라고 말한다.
     instagram 으로 단정해도 되는 경우는 «컬럼 자체가 없다» 하나뿐이다. */
  let channel: PublishChannel = "instagram";
  const withCh = await supabase.from("scheduled_posts").select("channel").eq("id", id).maybeSingle();
  if (withCh.error) {
    if (!isMissingColumnError(withCh.error, /channel/i)) {
      console.error("[publish] 채널 조회 실패:", withCh.error.message);
      return { ok: false, error: "잠시 후 다시 시도해 주세요." };
    }
  } else if (!withCh.data) {
    return { ok: false, error: "이미 처리된 글이에요." };
  } else if (withCh.data.channel) {
    channel = withCh.data.channel as PublishChannel;
  }
  if (!PUBLISHABLE_CHANNELS.includes(channel)) {
    return { ok: false, error: `${channelLabel(channel)} 발행은 아직 지원하지 않아요.` };
  }
  return { ok: true, channel };
}

/** 초안·실패 글 → 예약. when 은 "YYYY-MM-DDTHH:mm"(KST). */
export async function scheduleDraft(id: string, when: string): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
  const at = resolveScheduledAt(when);
  if (!at.ok) return { ok: false, error: at.error };

  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  const ch = await loadPostChannel(supabase, id);
  if (!ch.ok) return { ok: false, error: ch.error };
  const gate = await publishGate(supabase, user.id, ch.channel);
  if (!gate.ok) return { ok: false, error: gate.error };

  /* draft 뿐 아니라 **failed 도 받는다.** 발행에 실패한 글은 재시도도 삭제도 안 돼서 목록에 영구히 박제됐다. */
  const { data, error } = await supabase
    .from("scheduled_posts")
    .update({ status: "scheduled", scheduled_at: at.iso, error: null })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .select("id");
  if (error) {
    console.error("[publish] 예약 전환 실패:", error.message);
    return { ok: false, error: "예약으로 바꾸지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 글이에요." };
  revalidatePath("/publish");
  return { ok: true };
}

/**
 * 「지금 발행」 — 초안·예약·실패 글을 그 자리에서 내보내고 결과를 돌려준다.
 * 최대 1분 남짓 걸릴 수 있다(메타가 이미지를 처리하는 시간) — /publish 페이지에 maxDuration 이 걸려 있다.
 */
export async function publishNow(id: string): Promise<{ ok: false; error: string } | { ok: true; outcome: PublishOutcome }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 발행할 수 없어요." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  /* RLS 로 본인 행만 읽힌다 — 여기서 못 읽으면 남의 글이거나 없는 글이다 */
  const { data: row, error: rowErr } = await supabase
    .from("scheduled_posts")
    .select("id, caption, image_urls, status")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) {
    console.error("[publish] 글 조회 실패:", rowErr.message);
    return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  }
  if (!row) return { ok: false, error: "이미 처리된 글이에요." };
  if (!["draft", "scheduled", "failed"].includes(row.status)) {
    return {
      ok: false,
      error: row.status === "published" ? "이미 발행된 글이에요." : row.status === "publishing" ? "지금 발행 중이에요." : "지금은 발행할 수 없는 상태예요.",
    };
  }
  const ch = await loadPostChannel(supabase, id);
  if (!ch.ok) return { ok: false, error: ch.error };
  const gate = await publishGate(supabase, user.id, ch.channel);
  if (!gate.ok) return { ok: false, error: gate.error };

  /* 토큰 암호문은 admin 으로만 읽는다(0085). 선점·발행 쿼리에 user_id 를 거는 이유는 위 주석과 같다 —
     admin 은 RLS 를 우회하므로 필터가 곧 권한이다. */
  const admin = createAdminClient();
  if (!admin) {
    console.error("[publish] 지금 발행 불가 — 서버 자격증명 미설정");
    return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  }
  const claimed = await claimPost(admin, id, ["draft", "scheduled", "failed"], { userId: user.id });
  if (!claimed) return { ok: false, error: "이미 발행이 시작된 글이에요. 잠시 후 목록을 확인해 주세요." };

  const outcome = await runClaimedPost(
    admin,
    { id, user_id: user.id, caption: row.caption, image_urls: (row.image_urls as string[] | null) ?? [], channel: ch.channel },
    { source: "now", waitBudgetMs: NOW_WAIT_BUDGET_MS },
  );
  revalidatePath("/publish");
  return {
    ok: true,
    outcome: outcome.ok ? { published: true, label: outcome.label } : { published: false, error: outcome.error, label: outcome.label },
  };
}

/** 초안·발행 실패 글 삭제. 발행**된** 글은 지울 수 없다 — 이력이다.
    실패한 글은 이력이 아니라 «못 나간 글»이므로 지울 수 있어야 한다(안 그러면 목록에 영구히 남는다). */
export async function deleteDraft(id: string): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scheduled_posts")
    .delete()
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .select("id, image_urls");
  if (error) {
    console.error("[publish] 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 글이에요." };
  /* 이미지도 **실제로** 지운다(2026-09-08 감사).
     예전에는 행만 지우고 객체를 남겼다 — 화면은 「되돌릴 수 없어요」라고 말하는데,
     이미 퍼진 공개 주소로는 그 사진이 계속 받아졌다. 개인정보처리방침도 「복구 불가능한
     방법으로 삭제」라고 확언한다. 여기 image_urls 는 **이 행 전용**이라(요청마다 새 uuid 로
     올리고 «글 복제» 기능이 없다) 지워도 다른 행이 깨지지 않는다.
     ⚠️ 나중에 «글 복제»를 만들면 URL 이 공유되므로 이 삭제를 다시 생각해야 한다.
     순서: DB 먼저, Storage 는 best-effort — 반대로 하면 객체는 지웠는데 행이 남아
     발행 때 404 가 된다. 되짚지 못한 URL 은 지우지 않는다(storagePathsFromPublicUrls). */
  const paths = storagePathsFromPublicUrls((data[0] as { image_urls?: unknown }).image_urls, "cardnews", user.id);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from("cardnews").remove(paths);
    if (rmErr) console.error("[publish] 초안 이미지 삭제 실패(행은 지워짐):", rmErr.message);
  }
  revalidatePath("/publish");
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   새 게시물 포스팅 — 링크팜 포스팅 실측(2026-08-19) 대응
   ══════════════════════════════════════════════════════════════════ */

/* 글자·장수 상한은 채널마다 다르다 — lib/publish-rules.ts 한 곳에서 화면과 함께 본다
   (인스타 2200자·이미지 필수 / 스레드 500자·글만도 가능) */
/** 장당 업로드 상한(2차 방어) — 정상 경로는 컴포저가 1440px JPEG 로 축소해
    장당 ~1.5MB 다. 이 8MB 는 축소를 우회한 직접 호출을 막는 서버측 가드이고,
    요청 전체는 그 전에 next.config.ts 의 bodySizeLimit(25mb)이 자른다. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 게시물을 직접 만들어 지금 발행 / 예약 / 초안으로 넣는다.
 *
 * 채널: 실제 발행 어댑터가 있는 것만 받는다(instagram·threads).
 * 틱톡은 발행 API 자체가 없어 "(준비 중)" 비활성 — 값이 오면 사용자가 아니라
 * 코드가 잘못된 것이므로 명확히 거절한다.
 *
 * 채널별 상한(글자·장수)은 lib/publish-rules.ts 가 정한다 — 컴포저와 같은 값을 본다.
 *
 * mode=now 는 행을 scheduled(지금)로 넣은 뒤 **같은 요청 안에서** 내보낸다. 발행이 실패해도 저장은 된 것이라
 * ok:true 에 outcome 으로 결과를 싣는다 — 컴포저는 닫히고 결과 모달이 뜨며, 실패한 글은 목록에 남아
 * 다시 시도하거나 지울 수 있다(컴포저를 열어 둔 채 오류만 보여 주면 같은 글을 두 번 올리게 된다).
 */
export async function createPost(input: {
  channel: string;
  caption: string;
  /** FileReader data URL — 1~10장 */
  images: string[];
  mode: "now" | "schedule" | "draft";
  /** mode=schedule 일 때 "YYYY-MM-DDTHH:mm"(KST) */
  when?: string;
}): Promise<CreatePostResult> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
  const startedAt = Date.now();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  if (!PUBLISHABLE_CHANNELS.includes(input.channel as PublishChannel)) {
    return { ok: false, error: `${channelLabel(input.channel)} 발행은 준비 중이에요.` };
  }
  const channel = input.channel as PublishChannel;
  const rules = channelRules(channel);

  const caption = input.caption.trim();
  const images = Array.isArray(input.images) ? input.images : [];
  /* ⚠️ 글 요구와 이미지 요구는 **별개**다. 스레드를 열면서 이 검사를 «둘 다 비었을 때만»으로
     바꿨더니 인스타에서 캡션 없는 캐러셀이 통과했다 — minImages 는 이미지만 본다. */
  if (rules.requiresText && !caption) {
    return { ok: false, error: `${eulReul(rules.textLabel)} 입력해 주세요.` };
  }
  if (!caption && images.length === 0) {
    return { ok: false, error: "내용을 입력해 주세요." };
  }
  if (caption.length > rules.textMax) {
    return { ok: false, error: `${rules.textLabel} ${rules.textMax}자까지 쓸 수 있어요.` };
  }
  if (images.length < rules.minImages) {
    return { ok: false, error: `이미지를 ${rules.minImages}장 이상 올려 주세요.` };
  }
  if (images.length > rules.maxImages) {
    return { ok: false, error: `이미지는 ${rules.maxImages}장까지예요.` };
  }

  /* 시각 검증은 초안 예약 전환(scheduleDraft)과 같은 규칙 — 관문이 갈리면 어긋난다 */
  let scheduledAt: string;
  if (input.mode === "schedule") {
    const at = resolveScheduledAt(input.when ?? "");
    if (!at.ok) return { ok: false, error: at.error };
    scheduledAt = at.iso;
  } else {
    /* 초안의 scheduled_at 은 "만든 시각"의 의미다(0043) — 크론은 draft 를 안 집는다.
       지금 발행도 «지금»이다 — 목록·달력이 실제 발행 시각을 보여 준다. */
    scheduledAt = new Date().toISOString();
  }

  const supabase = await createClient();

  /* 예약·지금 발행은 발행 약속이다 — 연동 없이 받으면 반드시 실패한다.
     초안은 연동을 요구하지 않는다(아직 발행이 아니다). scheduleDraft 와 같은 규칙. */
  if (input.mode !== "draft") {
    const gate = await publishGate(supabase, user.id, channel);
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  /* 이미지 업로드 — 카드뉴스와 같은 버킷·같은 본인 폴더 규칙(0010 RLS).
     전부 올린 뒤에 insert 한다: insert 먼저 하면 업로드 실패 시 이미지 없는
     행이 남고, 그 행은 발행에서 반드시 실패한다. */
  const urls: string[] = [];
  /* 올린 객체의 경로를 함께 모은다 — 아래 insert 가 실패하면 **되돌려 지운다**.
     예전에는 그냥 두어 고아가 됐다: 저장에 실패한 글의 사진이 공개 주소로 영원히 남았다(2026-09-08 감사). */
  const uploaded: string[] = [];
  for (const dataUrl of images) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
    if (!m) return { ok: false, error: "PNG·JPG·WEBP 이미지만 올릴 수 있어요." };
    const buf = Buffer.from(m[2], "base64");
    if (buf.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "이미지는 장당 8MB 이하만 올릴 수 있어요." };
    const ext = m[1].split("/")[1].replace("jpeg", "jpg");
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("cardnews").upload(path, buf, {
      contentType: m[1],
      upsert: false,
    });
    if (upErr) {
      console.error("[publish] 이미지 업로드 실패:", upErr.message);
      return { ok: false, error: "이미지를 올리지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    uploaded.push(path);
    urls.push(supabase.storage.from("cardnews").getPublicUrl(path).data.publicUrl);
  }

  /** 저장이 끝내 실패했을 때 방금 올린 객체를 되돌려 지운다 — 실패해도 흐름은 막지 않는다 */
  const rollbackUploads = async () => {
    if (uploaded.length === 0) return;
    const { error: rmErr } = await supabase.storage.from("cardnews").remove(uploaded);
    if (rmErr) console.error("[publish] 업로드 롤백 실패:", rmErr.message);
  };

  /* channel 은 0053 컬럼 — 미적용 DB 폴백(계단식, auto-dm 0052 와 같은 패턴).
     ⚠️ 스레드는 컬럼이 없으면 **인스타로 저장돼 엉뚱한 계정에 발행**된다. 폴백은
     인스타일 때만 쓴다 — 조용히 채널을 바꾸느니 저장을 거절하는 편이 낫다. */
  const row = {
    user_id: user.id,
    caption,
    image_urls: urls,
    scheduled_at: scheduledAt,
    status: input.mode === "draft" ? "draft" : "scheduled",
  };
  let inserted = await supabase.from("scheduled_posts").insert({ ...row, channel }).select("id").single();
  if (isMissingColumnError(inserted.error, /channel/i)) {
    if (channel !== "instagram") {
      console.error("[publish] channel 컬럼 미적용 — 스레드 저장 거절:", inserted.error?.message);
      await rollbackUploads();
      return { ok: false, error: "스레드 발행 준비가 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요." };
    }
    inserted = await supabase.from("scheduled_posts").insert(row).select("id").single();
  }
  if (inserted.error || !inserted.data) {
    const error = inserted.error;
    /* image_urls 체크에 걸린 경우 — 「저장 실패」로 뭉뚱그리면 뭘 고쳐야 하는지 알 수 없다.
       문구는 채널 규칙에서 만든다: 스레드에 «이미지를 1장 이상»은 틀린 안내다.
       (0074 미적용이어도 스레드 글 전용은 통과한다 — 빈 배열의 array_length 가 null 이라
        0010 의 체크가 위반으로 보지 않는다. 0074 는 그 우연을 명시적 규칙으로 바꾼다.) */
    if (error && /image_urls/i.test(error.message)) {
      console.error("[publish] image_urls 체크 위반:", error.message);
      await rollbackUploads();
      return {
        ok: false,
        error:
          rules.minImages > 0
            ? `이미지를 ${rules.minImages}장 이상 올려 주세요.`
            : `이미지는 ${rules.maxImages}장까지예요.`,
      };
    }
    console.error("[publish] 게시물 생성 실패:", error?.message ?? "행 없음");
    await rollbackUploads();
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  if (input.mode !== "now") {
    revalidatePath("/publish");
    return { ok: true, mode: input.mode };
  }

  /* ── 지금 발행 — 방금 넣은 행을 그 자리에서 내보낸다 ── */
  const label = channelLabel(channel);
  const admin = createAdminClient();
  if (!admin) {
    /* 저장은 됐다. 크론이 5분 안에 집어 가므로 «지금»은 못 지켜도 발행은 된다 — 그 사실을 그대로 말한다 */
    console.error("[publish] 지금 발행 불가 — 서버 자격증명 미설정. 크론에 맡긴다:", inserted.data.id);
    revalidatePath("/publish");
    return {
      ok: true,
      mode: "now",
      outcome: { published: false, deferred: true, label, error: "지금 바로는 올리지 못했어요. 5분 안에 자동으로 발행돼요." },
    };
  }
  const claimed = await claimPost(admin, inserted.data.id, ["scheduled"], { userId: user.id });
  if (!claimed) {
    revalidatePath("/publish");
    return { ok: true, mode: "now", outcome: { published: false, label, error: "발행이 이미 시작됐어요. 잠시 후 목록을 확인해 주세요." } };
  }
  /* 업로드에 쓴 시간만큼 대기 예산을 줄인다 — 10장 업로드 뒤에도 액션 상한 안에서 끝나게 */
  const outcome = await runClaimedPost(
    admin,
    { id: inserted.data.id, user_id: user.id, caption, image_urls: urls, channel },
    { source: "now", waitBudgetMs: Math.min(NOW_WAIT_BUDGET_MS, Math.max(15_000, NOW_TOTAL_BUDGET_MS - (Date.now() - startedAt))) },
  );
  revalidatePath("/publish");
  return {
    ok: true,
    mode: "now",
    outcome: outcome.ok ? { published: true, label } : { published: false, label, error: outcome.error },
  };
}
