import type { Metadata } from "next";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { LoadFailed } from "@/components/ui/load-failed";
import { isMissingTableError } from "@/lib/supabase/errors";
import { SettingsShell } from "../_components/settings-shell";
import {
  DEFAULT_STATE,
  NotificationSettingsClient,
  type NotificationSettingsState,
  type RowKey,
} from "./_components/notification-settings-client";
import { MarketingConsentCard, type MarketingConsentState } from "./_components/marketing-consent-card";

/** 마케팅 수신 동의 상태(0079 user_consents) — 조회 실패는 «없음»과 가른다 */
async function loadMarketingConsent(): Promise<MarketingConsentState> {
  if (isDemoMode()) return { kind: "demo" };
  try {
    const supabase = await createClient();
    const user = await getAuthUser();
    if (!user) return { kind: "none" };
    const { data, error } = await supabase
      .from("user_consents")
      .select("marketing_email_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return { kind: "none" };
      console.error("[notification-settings] 마케팅 동의 조회 실패:", error.message);
      return { kind: "failed" };
    }
    if (!data) return { kind: "none" };
    const at = (data as { marketing_email_at: string | null }).marketing_email_at;
    return { kind: "ok", at: at ?? null };
  } catch (e) {
    console.error("[notification-settings] 마케팅 동의 조회 실패:", e);
    return { kind: "failed" };
  }
}

export const metadata: Metadata = {
  title: "알림 설정",
  robots: { index: false, follow: false },
};

/*
  알림 설정 — 서버에서 저장된 설정을 읽어 클라이언트에 전달.
  저장값이 없거나(신규 사용자) 0008 마이그레이션 미적용이면 기본값으로 폴백.

  ⚠️ **조회 실패는 기본값으로 폴백하지 않는다.** 이 화면은 읽은 값을 그대로 되쓴다 —
  실패했는데 기본값을 그려 두면, 사용자가 토글 하나만 만지고 저장하는 순간
  **원래 설정이 통째로 기본값으로 덮어써진다.** 조용한 데이터 손실이라 화면을 아예 막는다.
  (컬럼/테이블이 없는 경우와는 다르다 — 그건 아래 tableMissing 으로 가른다.)
*/
export default async function NotificationSettingsPage() {
  let initial: NotificationSettingsState = DEFAULT_STATE;
  let loadFailed = false;
  const marketingPromise = loadMarketingConsent();

  if (!isDemoMode()) {
    try {
      const supabase = await createClient();
      const user = await getAuthUser();
      if (user) {
        const { data, error } = await supabase
          .from("notification_settings")
          .select("settings")
          .eq("user_id", user.id)
          .maybeSingle();
        /* 0008 미적용(테이블 없음)은 «저장한 적 없음»과 같게 다뤄도 안전하다 —
           그 DB 에는 덮어쓸 값 자체가 없다. 그 밖의 오류는 값이 있는데 못 읽은 것이다. */
        if (error && !/relation .* does not exist|schema cache/i.test(error.message)) {
          console.error("[notification-settings] 조회 실패:", error.message);
          loadFailed = true;
        }
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
      console.error("[notification-settings] 조회 실패:", e);
      loadFailed = true;
    }
  }

  const marketing = await marketingPromise;

  return (
    <SettingsShell title="알림 설정" description="알림 유형별로 수신 경로를 선택하세요.">
      {loadFailed ? (
        <LoadFailed
          title="알림 설정을 불러오지 못했어요"
          description="지금 저장하면 기존 설정이 덮어써질 수 있어 화면을 잠시 막았어요. 다시 시도해 주세요."
        />
      ) : (
        <NotificationSettingsClient initial={initial} />
      )}
      {/* 광고성 정보 수신 동의는 위 표와 **다른 동의**다 — 카드를 따로 둔다(marketing-consent-card.tsx 주석) */}
      <MarketingConsentCard initial={marketing} />
    </SettingsShell>
  );
}
