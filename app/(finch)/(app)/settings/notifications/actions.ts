"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isMissingTableError } from "@/lib/supabase/errors";

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

export type MarketingConsentResult =
  | { ok: true; at: string | null }
  | { ok: false; demo?: boolean; reason?: "no_record" | "unavailable" };

/**
 * 마케팅 정보 수신 동의(선택) — user_consents.marketing_email_at 을 켜고 끈다(0079).
 *
 * 정보통신망법 §50: 광고성 정보 수신 동의는 **따로** 받고, 철회는 언제든 쉬워야 한다.
 * 가입 동의 화면(onboarding/consent)에서 받은 값을 여기서 바꾼다 — 같은 컬럼, 같은 의미.
 *
 * ⚠️ upsert 가 아니라 update 다. 필수 동의(약관·개인정보·만 14세) 없이 마케팅만 든 행을
 * 여기서 만들면 안 된다 — 행이 없으면(0079 이전 가입자, 게이트가 아직 안 돈 계정) 없다고 말한다.
 */
export async function setMarketingConsent(next: boolean): Promise<MarketingConsentResult> {
  if (isDemoMode()) return { ok: false, demo: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const at = next ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("user_consents")
    .update({ marketing_email_at: at })
    .eq("user_id", user.id)
    .select("user_id");
  if (error) {
    if (isMissingTableError(error)) return { ok: false, reason: "unavailable" };
    console.error("[notification-settings] 마케팅 동의 변경 실패:", error.message);
    return { ok: false };
  }
  /* PostgREST 는 RLS·조건 불일치로 0행이어도 오류를 안 낸다 — 행 수를 본다(저장소 규칙) */
  if (!data || data.length === 0) return { ok: false, reason: "no_record" };
  return { ok: true, at };
}
