import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationEmail } from "@/lib/email/resend";
import { defaultPrefFor, type NotifyChannelPref } from "@/lib/notify-defaults";
import type { NotificationType } from "@/lib/types";

/**
 * 알림 생성 공통 헬퍼 — 크론·웹훅 등 세션 없는 컨텍스트에서 알림을 만드는 모든 곳이 이걸 거친다.
 * notification_settings의 유형별 인앱/이메일 토글을 존중하고, 선택적으로 최근 발송 중복을 막는다.
 * admin 클라이언트는 호출측이 만들어 넘긴다(라우트마다 새로 생성하지 않도록).
 */
export interface NotifyParams {
  userId: string;
  type: NotificationType;
  /** notification_settings.settings의 키 — 생략 시 type과 동일 */
  settingKey?: string;
  /** 설정되면 이 기간(ms) 내 같은 type 알림이 있으면 건너뛴다 */
  dedupeMs?: number;
  /**
   * **법정 고지** — 수신 설정을 따르지 않고 항상 보낸다.
   * 정기결제 갱신 3일 전 고지·결제 실패·구독 종료가 여기 해당한다. 구독 시작 화면의 필수 동의문이
   * 「결제 예정일 3일 전에 미리 알려드린다」고 약속하는데, 그 고지가 설정 화면의 토글 하나로 꺼지면
   * 예고 없이 카드가 긁힌다 — 동의 화면에서 받은 약속이 스위치로 무효가 되는 구조였다(2026-09-07 감사).
   */
  mandatory?: boolean;
  title: string;
  body: string;
}

export async function notifyUser(admin: SupabaseClient, params: NotifyParams): Promise<boolean> {
  const settingKey = params.settingKey ?? params.type;
  const { data: setting } = await admin
    .from("notification_settings")
    .select("settings")
    .eq("user_id", params.userId)
    .maybeSingle();
  /* ⚠️ 저장된 설정이 **없으면 기본값을 쓴다.** 예전엔 행이 있을 때만 메일을 보냈는데, 가입 시 그 행을
     만드는 코드가 없어서(handle_new_user 는 users_profile 만 만든다) 설정 화면을 한 번도 안 건드린
     사용자에게는 결제 실패·구독 해지·토큰 만료 메일이 한 통도 안 나갔다. 화면은 「켜짐」으로 보였다.
     기본값 정본은 lib/notify-defaults.ts — 설정 화면도 같은 표를 읽는다(2026-09-07 감사). */
  const saved = (setting?.settings as Record<string, Partial<NotifyChannelPref>> | null)?.[settingKey];
  const fallback = defaultPrefFor(settingKey);
  const pref: NotifyChannelPref = {
    /* 법정 고지는 수신거부 분기를 타지 않는다 — 끌 수 있는 것과 끌 수 없는 것을 여기서 가른다 */
    inapp: params.mandatory ? true : (saved?.inapp ?? fallback.inapp),
    email: params.mandatory ? true : (saved?.email ?? fallback.email),
  };
  if (!pref.inapp) return false;

  if (params.dedupeMs) {
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", params.userId)
      .eq("type", params.type)
      .gte("created_at", new Date(Date.now() - params.dedupeMs).toISOString())
      .limit(1);
    if (recent && recent.length > 0) return false;
  }

  const { error } = await admin.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
  });
  if (error) {
    console.error("[notify] 알림 생성 실패:", params.userId, params.type, error.message);
    return false;
  }

  if (pref.email) {
    const { data: userData } = await admin.auth.admin.getUserById(params.userId);
    const email = userData?.user?.email;
    if (email) {
      await sendNotificationEmail(email, params.title, params.body);
    }
  }
  return true;
}
