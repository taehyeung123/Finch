"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/**
 * 알림 수신 설정 저장 — notification_settings upsert (RLS: 내 행만).
 *
 * ⚠️ 데모는 아무것도 쓰지 않는데 예전엔 `{ ok: true }` 를 돌려줬다. 화면은 그걸 보고 「저장됨」을
 * 띄웠고, 새로고침하면 스위치가 되돌아갔다(실측) — 저장됐다고 믿은 사람에게는 «설정이 풀린다»가 된다.
 * 저장이 안 되면 안 됐다고 말한다.
 */
export async function saveNotificationSettings(
  settings: Record<string, { inapp: boolean; email: boolean }>,
): Promise<{ ok: boolean; demo?: boolean }> {
  if (isDemoMode()) return { ok: false, demo: true };
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
