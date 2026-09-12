"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countRecentMarketingAgrees, notifyMarketingConsentResult, recordConsentEvents } from "@/lib/legal/consent-events";
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
  /** changed=false — 이미 그 상태였다(이력·처리 결과 메일 없음). at 은 지금 저장된 값 */
  | { ok: true; at: string | null; changed: boolean }
  | { ok: false; demo?: boolean; reason?: "no_record" | "unavailable" | "rate_limited" };

/** 광고성 정보 수신 «동의»의 하루 상한 — 동의·철회마다 법정 처리 결과 메일이 한 통씩 나간다(아래) */
const MARKETING_AGREE_LIMIT = 5;
const MARKETING_AGREE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 마케팅 정보 수신 동의(선택) — user_consents.marketing_email_at 을 켜고 끈다(0079).
 *
 * 정보통신망법 §50: 광고성 정보 수신 동의는 **따로** 받고, 철회는 언제든 쉬워야 한다.
 * 가입 동의 화면(onboarding/consent)에서 받은 값을 여기서 바꾼다 — 같은 컬럼, 같은 의미.
 *
 * ⚠️ upsert 가 아니라 update 다. 필수 동의(약관·개인정보·만 14세) 없이 마케팅만 든 행을
 * 여기서 만들면 안 된다 — 행이 없으면(0079 이전 가입자, 게이트가 아직 안 돈 계정) 없다고 말한다.
 *
 * ⚠️ **상태가 실제로 바뀔 때만** 쓴다(2026-09-12 점검). 같은 값으로 다시 부르면(오래된 두 번째 탭, 스크립트로 서버 액션 POST)
 *    예전엔 marketing_email_at 을 now() 로 덮어써 동의 일자와 2년 재확인 기산점(시행령 §62의3)이 흔들렸고,
 *    부를 때마다 이력 한 줄과 법정 메일 한 통이 나갔다. 그래서 update 에 «지금과 반대 상태일 때만» 조건을 건다 —
 *    두 요청이 겹쳐도 하나만 바꾼다. 0행이면 행이 없는지, 이미 그 상태인지 한 번 더 읽어 가른다.
 * ⚠️ «동의»에는 하루 상한을 둔다(MARKETING_AGREE_LIMIT). 켰다 껐다를 반복해 메일 발송 한도(팀 초대·법정 안내와 공유)를
 *    태우는 걸 막는다. **철회는 막지 않는다** — 켜진 상태에서만 끌 수 있으니 동의를 막으면 철회 횟수도 함께 묶인다.
 */
export async function setMarketingConsent(next: boolean): Promise<MarketingConsentResult> {
  if (isDemoMode()) return { ok: false, demo: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  if (next) {
    /* 셀 수 없으면(0095 미적용·조회 실패) 제한하지 않는다 — 로그는 countRecentMarketingAgrees 가 남긴다 */
    const recent = await countRecentMarketingAgrees(user.id, MARKETING_AGREE_WINDOW_MS);
    if (recent !== null && recent >= MARKETING_AGREE_LIMIT) return { ok: false, reason: "rate_limited" };
  }

  const at = next ? new Date().toISOString() : null;
  const base = supabase.from("user_consents").update({ marketing_email_at: at }).eq("user_id", user.id);
  /* 반대 상태일 때만 — 켜기는 «꺼져 있을 때», 끄기는 «켜져 있을 때» */
  const { data, error } = await (next ? base.is("marketing_email_at", null) : base.not("marketing_email_at", "is", null)).select("user_id");
  if (error) {
    if (isMissingTableError(error)) return { ok: false, reason: "unavailable" };
    console.error("[notification-settings] 마케팅 동의 변경 실패:", error.message);
    return { ok: false };
  }
  /* PostgREST 는 RLS·조건 불일치로 0행이어도 오류를 안 낸다 — 행 수를 본다(저장소 규칙).
     0행 = 행이 없거나(no_record) 이미 그 상태다(바꿀 것 없음 — 이력·메일 없이 지금 값을 돌려준다) */
  if (!data || data.length === 0) {
    const { data: row, error: readErr } = await supabase
      .from("user_consents")
      .select("marketing_email_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readErr) {
      console.error("[notification-settings] 마케팅 동의 상태 확인 실패:", readErr.message);
      return { ok: false };
    }
    if (!row) return { ok: false, reason: "no_record" };
    return { ok: true, at: (row as { marketing_email_at: string | null }).marketing_email_at, changed: false };
  }

  /* 동의·철회 이력(0095)과 처리 결과 통지(정보통신망법 §50⑦ — 14일 안, 방침 제19조①).
     통지는 응답 뒤에 보낸다 — 스위치 반응이 메일 왕복을 기다리지 않게. */
  await recordConsentEvents(user.id, [{ doc: "marketing_email", action: next ? "agree" : "withdraw", source: "settings" }]);
  const email = user.email;
  const uid = user.id;
  after(() => notifyMarketingConsentResult(uid, email, next));
  return { ok: true, at, changed: true };
}
