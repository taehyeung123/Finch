"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { earliestPublishDate } from "@/lib/calendar";
import { eulReul } from "@/lib/josa";
import { REQUIRED_SCOPE, checkScope } from "@/lib/meta/granted-scopes";
import {
  PUBLISHABLE_CHANNELS,
  channelRules,
  channelLabel,
  isMissingColumnError,
  type PublishChannel,
} from "@/lib/publish-rules";

/*
  초안 관리 — 2026-08-16 신설.

  초안을 만들어 놓고 **지울 수도, 예약으로 바꿀 수도 없었다.** 저장하는 순간
  스토리지 이미지까지 포함한 결과물이 영구히 DB 에 갇혔고, 그 상태로 쌓이면
  발행 화면 조회(최신 200건)를 밀어내 진짜 미래 예약이 화면에서 사라진다.
  화면 문구는 "언제든 날짜를 정하세요"라고 하면서 그럴 수단이 없었다.

  두 액션 다 RLS(auth.uid()=user_id) 위에서 돌고, 추가로 .eq("status","draft") 를
  건다 — id 만 맞으면 이미 발행된 글까지 손댈 수 있으면 안 된다.
*/

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

/** 초안 → 예약. date 는 "YYYY-MM-DD"(KST). */
export async function scheduleDraft(id: string, date: string): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "날짜 형식이 올바르지 않아요." };
  /* 과거뿐 아니라 **오늘 아침 배치가 이미 지난 경우의 오늘**도 막는다.
     배치는 KST 06:00 하루 1회라, 06시 이후에 오늘로 잡으면 오늘은 아무 일도
     안 일어나고 내일 아침에 나간다 — 화면 안내와 어긋난다. */
  const earliest = earliestPublishDate();
  if (date < earliest) {
    return {
      ok: false,
      error:
        date < new Date().toISOString().slice(0, 10)
          ? "지난 날짜로는 예약할 수 없어요."
          : "오늘 아침 발행 배치가 이미 지났어요. 내일 이후로 골라 주세요.",
    };
  }

  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  /* 어느 채널로 예약하는 글인지 먼저 읽는다 — 예전엔 무조건 인스타그램 연동을 물어서,
     스레드 초안을 예약하려면 쓰지도 않는 인스타를 연동해야 했다(2026-08-31 스레드 발행 추가).
     channel 은 0053 컬럼이고, 미적용 DB 의 큐는 전부 인스타 시절 것이다.

     ⚠️ 세 갈래를 뭉치면 안 된다 — «에러든 빈 결과든 인스타»로 두면 조회가 한 번 실패했을 때
     스레드 글을 예약하려던 사람에게 «인스타그램을 연동하세요»라고 말한다.
     instagram 으로 단정해도 되는 경우는 «컬럼 자체가 없다» 하나뿐이다. */
  let channel: PublishChannel = "instagram";
  const withCh = await supabase.from("scheduled_posts").select("channel").eq("id", id).maybeSingle();
  if (withCh.error) {
    if (!isMissingColumnError(withCh.error, /channel/i)) {
      console.error("[publish] 채널 조회 실패:", withCh.error.message);
      return { ok: false, error: "잠시 후 다시 시도해 주세요." };
    }
    // 0053 미적용 — 그 시절 큐는 전부 인스타 카드뉴스였다
  } else if (!withCh.data) {
    return { ok: false, error: "이미 처리된 글이에요." };
  } else if (withCh.data.channel) {
    channel = withCh.data.channel as PublishChannel;
  }
  if (!PUBLISHABLE_CHANNELS.includes(channel)) {
    return { ok: false, error: `${channelLabel(channel)} 발행은 아직 지원하지 않아요.` };
  }

  /* 연동이 없으면 예약해도 배치가 실패로 끝난다 — 여기서 막는다.
     초안 저장 때는 연동을 요구하지 않지만(아직 발행이 아니다), 예약은 발행 약속이다. */
  /* ⚠️ user_id 로 반드시 좁힌다. connected_accounts 에는 "team members read" 정책이
     있어 팀원이 **소유자의** 연동 행을 읽는다 — 안 좁히면 자기 계정엔 연동이 없는데
     게이트를 통과하고, 발행 크론은 user_id 로 토큰을 찾으므로 그 예약은 반드시
     실패한다(설정 화면·크론이 이미 쓰는 패턴과 맞춘다). */
  const acc = await loadConnectedAccount(supabase, user.id, channel);
  if (!acc.ok) return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  if (!acc.found) return { ok: false, error: `먼저 설정에서 ${channelLabel(channel)} 계정을 연동해 주세요.` };

  /* 발행 권한이 **확실히 없으면** 여기서 막는다. 예약을 받아 두면 새벽 6시 크론이 돌 때
     권한 오류로 실패하고, 그 사이 사용자는 발행될 거라고 믿는다.
     확인 불가(0075 이전 연동)면 통과시킨다 — 모른다고 멀쩡한 예약을 막지 않는다. */
  const scopeCheck = checkScope(
    acc.scopes,
    channel === "threads" ? REQUIRED_SCOPE.threadsPublish : REQUIRED_SCOPE.instagramPublish,
  );
  if (scopeCheck.state === "missing") {
    return {
      ok: false,
      error: `${channelLabel(channel)} 발행 권한이 없어요. 설정에서 다시 연동하면 바로 쓸 수 있어요.`,
    };
  }

  /* 배치는 KST 06:00 에 돈다(vercel.json "0 21 * * *" = UTC 21시). 그 날 아침에
     집히려면 scheduled_at 이 그 시각 이전이어야 하므로 KST 자정(=UTC 15:00 전날)으로 둔다. */
  const scheduledAt = new Date(`${date}T00:00:00+09:00`).toISOString();

  /* draft 뿐 아니라 **failed 도 받는다.** 발행에 실패한 글은 재시도도 삭제도 안 돼서
     목록에 영구히 박제됐다(크론도 status="scheduled" 만 집는다). 실패 알림은
     "스튜디오에서 다시 예약해 주세요"라고 안내했지만, 발행 컴포저로 만든 글은 스튜디오에 없다. */
  const { data, error } = await supabase
    .from("scheduled_posts")
    .update({ status: "scheduled", scheduled_at: scheduledAt, error: null })
    .eq("id", id)
    .in("status", ["draft", "failed"])
    .select("id");
  if (error) {
    console.error("[publish] 예약 전환 실패:", error.message);
    return { ok: false, error: "예약으로 바꾸지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 글이에요." };
  return { ok: true };
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
    .select("id");
  if (error) {
    console.error("[publish] 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 글이에요." };
  /* Storage 의 이미지는 남는다 — cardnews 버킷은 본인 폴더 RLS 라 새는 건 아니지만
     고아 객체가 된다. 버킷 정리는 별도 배치로 다룬다(여기서 지우면 삭제 실패 시
     DB 는 지워졌는데 이미지만 남거나 그 반대가 되는 부분 실패가 생긴다). */
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
 * 게시물을 직접 만들어 예약/초안으로 넣는다.
 *
 * 지금까지 발행 대기열(scheduled_posts)에 넣는 길은 스튜디오 카드뉴스뿐이었다 —
 * 포스팅 화면에서 이미지+글을 바로 써서 올리는 길을 연다.
 *
 * 채널: 실제 발행 어댑터가 있는 것만 받는다(instagram·threads).
 * 틱톡은 발행 API 자체가 없어 "(준비 중)" 비활성 — 값이 오면 사용자가 아니라
 * 코드가 잘못된 것이므로 명확히 거절한다.
 *
 * 채널별 상한(글자·장수)은 lib/publish-rules.ts 가 정한다 — 컴포저와 같은 값을 본다.
 *
 * "즉시 발행"은 없다 — 발행은 KST 06:00 배치라 "즉시"가 거짓이 된다.
 * 실시간 발행 API 배선(맨 마지막 단계) 전까지 mode 는 schedule | draft 둘뿐이다.
 */
export async function createPost(input: {
  channel: string;
  caption: string;
  /** FileReader data URL — 1~10장 */
  images: string[];
  mode: "schedule" | "draft";
  /** mode=schedule 일 때 YYYY-MM-DD(KST) */
  date?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
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

  /* 날짜 검증은 초안 예약 전환(scheduleDraft)과 같은 규칙 — 관문이 갈리면 어긋난다 */
  let scheduledAt: string;
  if (input.mode === "schedule") {
    const date = input.date ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "날짜 형식이 올바르지 않아요." };
    const earliest = earliestPublishDate();
    if (date < earliest) {
      return {
        ok: false,
        error:
          date < new Date().toISOString().slice(0, 10)
            ? "지난 날짜로는 예약할 수 없어요."
            : "오늘 아침 발행 배치가 이미 지났어요. 내일 이후로 골라 주세요.",
      };
    }
    scheduledAt = new Date(`${date}T00:00:00+09:00`).toISOString();
  } else {
    /* 초안의 scheduled_at 은 "만든 시각"의 의미다(0043) — 크론은 draft 를 안 집는다 */
    scheduledAt = new Date().toISOString();
  }

  const supabase = await createClient();

  /* 예약은 발행 약속이다 — 연동 없이 예약하면 배치가 반드시 실패한다.
     초안은 연동을 요구하지 않는다(아직 발행이 아니다). scheduleDraft 와 같은 규칙. */
  if (input.mode === "schedule") {
    const acc = await loadConnectedAccount(supabase, user.id, channel);
    if (!acc.ok) return { ok: false, error: "잠시 후 다시 시도해 주세요." };
    if (!acc.found) return { ok: false, error: `먼저 설정에서 ${channelLabel(channel)} 계정을 연동해 주세요.` };
    /* 위 scheduleDraft 와 같은 관문 — 예약은 발행 약속이므로 권한을 여기서 본다 */
    const scopeCheck = checkScope(
      acc.scopes,
      channel === "threads" ? REQUIRED_SCOPE.threadsPublish : REQUIRED_SCOPE.instagramPublish,
    );
    if (scopeCheck.state === "missing") {
      return {
        ok: false,
        error: `${channelLabel(channel)} 발행 권한이 없어요. 설정에서 다시 연동하면 바로 쓸 수 있어요.`,
      };
    }
  }

  /* 이미지 업로드 — 카드뉴스와 같은 버킷·같은 본인 폴더 규칙(0010 RLS).
     전부 올린 뒤에 insert 한다: insert 먼저 하면 업로드 실패 시 이미지 없는
     행이 남고, 그 행은 배치에서 반드시 실패한다. */
  const urls: string[] = [];
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
    urls.push(supabase.storage.from("cardnews").getPublicUrl(path).data.publicUrl);
  }

  /* channel 은 0053 컬럼 — 미적용 DB 폴백(계단식, auto-dm 0052 와 같은 패턴).
     ⚠️ 스레드는 컬럼이 없으면 **인스타로 저장돼 엉뚱한 계정에 발행**된다. 폴백은
     인스타일 때만 쓴다 — 조용히 채널을 바꾸느니 저장을 거절하는 편이 낫다. */
  const row = {
    user_id: user.id,
    caption,
    image_urls: urls,
    scheduled_at: scheduledAt,
    status: input.mode === "schedule" ? "scheduled" : "draft",
  };
  let { error } = await supabase.from("scheduled_posts").insert({ ...row, channel });
  if (isMissingColumnError(error, /channel/i)) {
    if (channel !== "instagram") {
      console.error("[publish] channel 컬럼 미적용 — 스레드 저장 거절:", error?.message);
      return { ok: false, error: "스레드 발행 준비가 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요." };
    }
    ({ error } = await supabase.from("scheduled_posts").insert(row));
  }
  if (error) {
    /* image_urls 체크에 걸린 경우 — 「저장 실패」로 뭉뚱그리면 뭘 고쳐야 하는지 알 수 없다.
       문구는 채널 규칙에서 만든다: 스레드에 «이미지를 1장 이상»은 틀린 안내다.
       (0074 미적용이어도 스레드 글 전용은 통과한다 — 빈 배열의 array_length 가 null 이라
        0010 의 체크가 위반으로 보지 않는다. 0074 는 그 우연을 명시적 규칙으로 바꾼다.) */
    if (/image_urls/i.test(error.message)) {
      console.error("[publish] image_urls 체크 위반:", error.message);
      return {
        ok: false,
        error:
          rules.minImages > 0
            ? `이미지를 ${rules.minImages}장 이상 올려 주세요.`
            : `이미지는 ${rules.maxImages}장까지예요.`,
      };
    }
    console.error("[publish] 게시물 생성 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/publish");
  return { ok: true };
}
