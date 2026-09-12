"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { attributeUnstampedPosts } from "@/lib/publish/account";

/**
 * 채널 연동 해제 — 저장된 계정 행(암호화 토큰 포함)을 삭제한다.
 * RLS(auth.uid()=user_id) + user_id 명시 필터 이중 방어로 타인 계정은 건드릴 수 없다.
 * 데모 모드는 지울 DB가 없으므로 성공 모달만 재현한다(버튼이 조용히 무반응이면 고장으로 보인다).
 * 성공/실패는 OAuth 콜백과 같은 파이프라인(page.tsx의 connect 쿼리 → ResultModal)으로 피드백한다.
 */
export async function disconnectAccount(formData: FormData): Promise<void> {
  const accountId = formData.get("accountId");
  if (typeof accountId !== "string" || !accountId) {
    redirect("/settings/channels?connect=error&reason=disconnect_failed");
  }
  if (isDemoMode()) {
    redirect("/settings/channels?connect=disconnected");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/settings/channels?connect=error&reason=disconnect_failed");
  }

  // .select("id")로 삭제 행 수를 확인한다 — RLS 등으로 0행이 지워졌는데
  // 성공 모달이 뜨면 "해제했는데 그대로예요"라는 최악의 혼란이 된다.
  const { data: deleted, error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id, channel, platform_user_id, handle");
  if (error || !deleted || deleted.length === 0) {
    console.error("[settings] 연동 해제 실패:", error?.message ?? "0행 삭제(권한 또는 이미 삭제됨)");
    redirect("/settings/channels?connect=error&reason=disconnect_failed");
  }

  /* 그 채널로 예약된 글은 이제 나갈 수 없다 — 예약 시각에 «연동이 끊겼어요»로 조용히 실패하게 두지 않고
     지금 실패로 내려 목록에서 바로 보이게 한다(다시 연결한 뒤 「다시 예약」·「지금 발행」이 된다). (2026-09-09 감사)
     0053 이전 DB 는 channel 컬럼이 없어 이 갱신이 실패한다 — 해제 자체는 이미 끝났으므로 로그만 남긴다. */
  const gone = deleted[0] as { channel?: string | null; platform_user_id?: string | null; handle?: string | null };
  const channel = gone.channel;
  if (channel) {
    /* 2026-09-11: 이 쓰기는 이제 서버(admin)로 한다 — 0093 가드가 로그인 사용자의 «예약 → 실패» 전이를 막는다(상태는 서버만 옮긴다).
       admin 은 RLS 를 우회하므로 user_id 필터가 곧 권한이다. 처리 중(미리 만든 준비물이 옛 계정 것)인 글도 함께 내린다 —
       다른 인스타 계정으로 다시 연결하면 옛 계정의 준비물로 발행하려 들기 때문이다. 단 **발행을 시도한 글은 건드리지 않는다**
       (이미 올라갔을 수 있다 — 매분 크론이 «올라갔나»를 확인해 기록한다). admin 이 없으면 로그만 남긴다(폴백 없음 — 해제 자체는 끝났다). */
    const admin = createAdminClient();
    if (!admin) {
      console.error("[settings] 해제 채널의 예약 글 정리 불가 — 서버 자격증명 미설정");
    } else {
      /* 2026-09-12 계정 전환: 대상 계정이 비어 있는 옛 글(0094 전)에 지금 지운 계정을 적는다 — 다른 계정으로 다시 연결해도
         옛 발행 이력이 새 계정 것처럼 보이지 않는다(«@옛 · 이전 계정»). 행을 지운 뒤라 옛 id 는 삭제 결과에서 받는다. */
      if (gone.platform_user_id) {
        await attributeUnstampedPosts(admin, user.id, channel, {
          platformUserId: String(gone.platform_user_id),
          handle: typeof gone.handle === "string" ? gone.handle : null,
        });
      }
      const fields = {
        status: "failed",
        error: "연결을 해제해서 발행하지 못했어요 — 다시 연결한 뒤 예약해 주세요",
        error_code: "NOT_CONNECTED",
        next_check_at: null,
      };
      const a = await admin.from("scheduled_posts").update(fields).eq("user_id", user.id).eq("channel", channel).eq("status", "scheduled");
      if (a.error) console.error("[settings] 해제 채널의 예약 글 정리 실패:", a.error.message);
      const b = await admin
        .from("scheduled_posts")
        .update(fields)
        .eq("user_id", user.id)
        .eq("channel", channel)
        .eq("status", "processing")
        .is("publish_attempted_at", null);
      if (b.error) console.error("[settings] 해제 채널의 처리 중 글 정리 실패:", b.error.message);
    }
    revalidatePath("/publish");
  }
  revalidatePath("/settings/channels");
  redirect("/settings/channels?connect=disconnected");
}

/**
 * 메타 광고 연동 해제 — meta_ad_connections 행을 지운다.
 * meta_ad_accounts 는 connection_id 외래키의 on delete cascade 로 함께 사라진다(0077).
 *
 * 채널 해제와 표가 달라 함수를 따로 둔다 — 하나로 합치면 «어느 표를 지울지»를
 * 폼 값으로 받아야 하고, 그건 사용자가 보내는 값으로 지울 표를 고르는 것과 같다.
 */
export async function disconnectMetaAds(formData: FormData): Promise<void> {
  const connectionId = formData.get("connectionId");
  if (typeof connectionId !== "string" || !connectionId) {
    redirect("/settings/channels?connect=error&reason=disconnect_failed");
  }
  if (isDemoMode()) {
    redirect("/settings/channels?connect=disconnected");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/settings/channels?connect=error&reason=disconnect_failed");
  }

  // 0행 삭제를 성공으로 덮지 않는다 — «해제했는데 그대로예요»가 된다(위와 같은 규칙)
  const { data: deleted, error } = await supabase
    .from("meta_ad_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !deleted || deleted.length === 0) {
    console.error(
      "[settings] 광고 연동 해제 실패:",
      error?.message ?? "0행 삭제(권한 또는 이미 삭제됨)",
    );
    redirect("/settings/channels?connect=error&reason=disconnect_failed");
  }
  revalidatePath("/settings/channels");
  revalidatePath("/ads");
  redirect("/settings/channels?connect=disconnected");
}
