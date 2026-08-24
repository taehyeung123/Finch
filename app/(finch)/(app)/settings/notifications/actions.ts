"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/** 알림 수신 설정 저장 — notification_settings upsert (RLS: 내 행만). 데모는 no-op. */
export async function saveNotificationSettings(
  settings: Record<string, { inapp: boolean; email: boolean }>,
): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id: user.id, settings }, { onConflict: "user_id" });
  if (error) {
    console.error("[notification-settings] 저장 실패:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
