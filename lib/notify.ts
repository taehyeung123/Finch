import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationEmail } from "@/lib/email/resend";
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
  const pref = (setting?.settings as Record<string, { inapp?: boolean; email?: boolean }> | null)?.[settingKey];
  if (pref && pref.inapp === false) return false;

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

  if (pref?.email) {
    const { data: userData } = await admin.auth.admin.getUserById(params.userId);
    const email = userData?.user?.email;
    if (email) {
      await sendNotificationEmail(email, params.title, params.body);
    }
  }
  return true;
}
