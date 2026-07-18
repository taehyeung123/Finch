import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import {
  DEFAULT_STATE,
  NotificationSettingsClient,
  type NotificationSettingsState,
  type RowKey,
} from "./_components/notification-settings-client";

/*
  알림 설정 — 서버에서 저장된 설정을 읽어 클라이언트에 전달.
  저장값이 없거나(신규 사용자) 0008 마이그레이션 미적용이면 기본값으로 폴백.
*/
export default async function NotificationSettingsPage() {
  let initial: NotificationSettingsState = DEFAULT_STATE;

  if (!isDemoMode()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("notification_settings")
          .select("settings")
          .eq("user_id", user.id)
          .maybeSingle();
        const saved = (data?.settings ?? null) as Partial<
          Record<RowKey, { inapp?: boolean; email?: boolean }>
        > | null;
        if (saved) {
          // 저장값 위에 기본값을 깔아 새 알림 유형이 추가돼도 안전하게 병합
          initial = Object.fromEntries(
            (Object.keys(DEFAULT_STATE) as RowKey[]).map((k) => [
              k,
              {
                inapp: saved[k]?.inapp ?? DEFAULT_STATE[k].inapp,
                email: saved[k]?.email ?? DEFAULT_STATE[k].email,
              },
            ]),
          ) as NotificationSettingsState;
        }
      }
    } catch (e) {
      console.warn("[notification-settings] 조회 실패, 기본값 사용:", e);
    }
  }

  return <NotificationSettingsClient initial={initial} />;
}
