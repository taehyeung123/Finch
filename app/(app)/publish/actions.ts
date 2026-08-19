"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { earliestPublishDate } from "@/lib/calendar";

/*
  초안 관리 — 2026-08-16 신설.

  초안을 만들어 놓고 **지울 수도, 예약으로 바꿀 수도 없었다.** 저장하는 순간
  스토리지 이미지까지 포함한 결과물이 영구히 DB 에 갇혔고, 그 상태로 쌓이면
  발행 화면 조회(최신 200건)를 밀어내 진짜 미래 예약이 화면에서 사라진다.
  화면 문구는 "언제든 날짜를 정하세요"라고 하면서 그럴 수단이 없었다.

  두 액션 다 RLS(auth.uid()=user_id) 위에서 돌고, 추가로 .eq("status","draft") 를
  건다 — id 만 맞으면 이미 발행된 글까지 손댈 수 있으면 안 된다.
*/

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

  /* 인스타그램 연동이 없으면 예약해도 배치가 실패로 끝난다 — 여기서 막는다.
     초안 저장 때는 연동을 요구하지 않지만(아직 발행이 아니다), 예약은 발행 약속이다. */
  /* ⚠️ user_id 로 반드시 좁힌다. connected_accounts 에는 "team members read" 정책이
     있어 팀원이 **소유자의** 연동 행을 읽는다 — 안 좁히면 자기 계정엔 연동이 없는데
     게이트를 통과하고, 발행 크론은 user_id 로 토큰을 찾으므로 그 예약은 반드시
     실패한다(설정 화면·크론이 이미 쓰는 패턴과 맞춘다). */
  const { data: account } = await supabase
    .from("connected_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("channel", "instagram")
    .eq("connected", true)
    .limit(1)
    .maybeSingle();
  if (!account) return { ok: false, error: "먼저 설정에서 인스타그램 계정을 연동해 주세요." };

  /* 배치는 KST 06:00 에 돈다(vercel.json "0 21 * * *" = UTC 21시). 그 날 아침에
     집히려면 scheduled_at 이 그 시각 이전이어야 하므로 KST 자정(=UTC 15:00 전날)으로 둔다. */
  const scheduledAt = new Date(`${date}T00:00:00+09:00`).toISOString();

  const { data, error } = await supabase
    .from("scheduled_posts")
    .update({ status: "scheduled", scheduled_at: scheduledAt, error: null })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("[publish] 초안 예약 전환 실패:", error.message);
    return { ok: false, error: "예약으로 바꾸지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 초안이에요." };
  return { ok: true };
}

/** 초안 삭제. 발행된 글은 지울 수 없다 — 이력이다. */
export async function deleteDraft(id: string): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scheduled_posts")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("[publish] 초안 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 초안이에요." };
  /* Storage 의 이미지는 남는다 — cardnews 버킷은 본인 폴더 RLS 라 새는 건 아니지만
     고아 객체가 된다. 버킷 정리는 별도 배치로 다룬다(여기서 지우면 삭제 실패 시
     DB 는 지워졌는데 이미지만 남거나 그 반대가 되는 부분 실패가 생긴다). */
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   새 게시물 포스팅 — 링크팜 포스팅 실측(2026-08-19) 대응
   ══════════════════════════════════════════════════════════════════ */

/** 인스타그램 캡션 상한 */
const CAPTION_MAX = 2200;
/** 캐러셀 상한 — 0010 의 image_urls check 와 동일 */
const MAX_IMAGES = 10;
/** 장당 업로드 상한 — 인스타 발행 이미지가 8MB 를 넘을 일은 없다 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 게시물을 직접 만들어 예약/초안으로 넣는다.
 *
 * 지금까지 발행 대기열(scheduled_posts)에 넣는 길은 스튜디오 카드뉴스뿐이었다 —
 * 링크팜은 포스팅 화면에서 이미지+캡션을 바로 써서 올린다. 그 길을 연다.
 *
 * 채널: 실제 발행 함수가 인스타그램뿐이라(lib/meta/instagram-publish.ts) 여기서도
 * instagram 만 받는다. 컴포저의 틱톡·스레드는 "(준비 중)" 비활성 — 값이 오면
 * 사용자가 아니라 코드가 잘못된 것이므로 명확히 거절한다.
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

  if (input.channel !== "instagram") {
    return { ok: false, error: "지금은 인스타그램 발행만 지원해요. 틱톡·스레드는 준비 중입니다." };
  }
  const caption = input.caption.trim();
  if (!caption) return { ok: false, error: "캡션을 입력해 주세요." };
  if (caption.length > CAPTION_MAX) return { ok: false, error: `캡션은 ${CAPTION_MAX}자까지예요.` };
  if (!Array.isArray(input.images) || input.images.length === 0) {
    return { ok: false, error: "이미지를 1장 이상 올려 주세요." };
  }
  if (input.images.length > MAX_IMAGES) return { ok: false, error: `이미지는 ${MAX_IMAGES}장까지예요.` };

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
    const { data: account } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("channel", "instagram")
      .eq("connected", true)
      .limit(1)
      .maybeSingle();
    if (!account) return { ok: false, error: "먼저 설정에서 인스타그램 계정을 연동해 주세요." };
  }

  /* 이미지 업로드 — 카드뉴스와 같은 버킷·같은 본인 폴더 규칙(0010 RLS).
     전부 올린 뒤에 insert 한다: insert 먼저 하면 업로드 실패 시 이미지 없는
     행이 남고, 그 행은 배치에서 반드시 실패한다. */
  const urls: string[] = [];
  for (const dataUrl of input.images) {
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
     instagram 만 받으므로 컬럼이 없어도 의미는 유실되지 않는다(기본값이 instagram). */
  const row = {
    user_id: user.id,
    caption,
    image_urls: urls,
    scheduled_at: scheduledAt,
    status: input.mode === "schedule" ? "scheduled" : "draft",
  };
  let { error } = await supabase.from("scheduled_posts").insert({ ...row, channel: input.channel });
  if (error && /channel/i.test(error.message) && /column|schema/i.test(error.message)) {
    ({ error } = await supabase.from("scheduled_posts").insert(row));
  }
  if (error) {
    console.error("[publish] 게시물 생성 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/publish");
  return { ok: true };
}
