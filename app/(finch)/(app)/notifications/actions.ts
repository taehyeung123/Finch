"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/**
 * 알림 읽음 처리 — RLS(auth.uid()=user_id)로 내 알림만 갱신된다.
 * 데모 모드는 no-op (클라이언트 로컬 상태만으로 동작).
 */
export async function markNotificationRead(id: string): Promise<void> {
  if (isDemoMode() || !id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) console.error("[notifications] 읽음 처리 실패:", error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  if (isDemoMode()) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
  if (error) console.error("[notifications] 전체 읽음 처리 실패:", error.message);
}
