"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { isMissingTableError } from "@/lib/supabase/errors";
import { purgeAndDeleteUser } from "@/lib/account/delete";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/versions";
import { notifyMarketingConsentResult, recordConsentEvents } from "@/lib/legal/consent-events";
import { DELETE_PHRASE } from "@/app/(finch)/(app)/settings/profile/constants";

export interface ConsentFormState {
  error: string | null;
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** 이 사용자의 동의 행이 있나 — 첫 가입(행 없음)과 약관 개정 재동의(행 있음)를 **서버가** 가른다(화면 값을 믿지 않는다) */
async function existingConsent(supabase: SupabaseServer, userId: string): Promise<"none" | "exists" | "error"> {
  const { data, error } = await supabase.from("user_consents").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return "none";
    console.error("[consent] 동의 행 조회 실패:", error.message);
    return "error";
  }
  return data ? "exists" : "none";
}

/**
 * 동의 저장 — 두 경우를 서버가 가른다.
 *
 *  · 첫 가입(행 없음): 만 14세 · 이용약관(운영정책 포함) · 개인정보 수집·이용 안내 확인 (+ 선택 광고성 정보 수신).
 *  · 약관 개정 재동의(행 있음): 바뀐 이용약관 동의 **하나만** 받는다. 만 14세 확인·방침 확인·광고성 정보 수신 값은 건드리지 않는다 —
 *    광고성 정보 수신을 이 화면에서 다시 묻거나 미리 체크하면 «새 동의»로 인정받기 어렵고 2년 재확인 기산점만 흔든다
 *    (2026-09-12 검토). 지금 상태만 보여 주고, 바꾸는 곳은 알림 설정이다.
 *
 * ⚠️ 클라이언트의 비활성 버튼을 믿지 않는다 — 필수 항목은 서버에서 다시 검사한다.
 * 폼 조작으로 체크 없이 제출하면 저장 없이 오류를 돌려준다(체크가 곧 동의의 증거다).
 */
export async function saveConsent(_prev: ConsentFormState, formData: FormData): Promise<ConsentFormState> {
  if (isDemoMode()) {
    // 데모에는 기록할 사용자가 없다 — 게이트도 데모를 안 세우므로 이 화면에 올 일 자체가 없다
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/onboarding/consent");
  }

  const has = await existingConsent(supabase, user.id);
  if (has === "error") {
    return { error: "동의 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
  }

  const terms = formData.get("terms") === "on";
  const now = new Date().toISOString();

  /* ── 약관 개정 재동의 ── */
  if (has === "exists") {
    if (!terms) return { error: "바뀐 이용약관에 동의해야 서비스를 계속 이용할 수 있어요." };
    const { data, error } = await supabase
      .from("user_consents")
      .update({ terms_at: now, terms_version: TERMS_VERSION })
      .eq("user_id", user.id)
      .select("user_id");
    if (error) {
      console.error("[consent] 재동의 저장 실패:", error.message);
      return { error: "동의 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
    }
    /* PostgREST 는 RLS 로 0행이 되어도 오류를 안 낸다 — 행 수를 확인한다(저장소 규칙) */
    if (!data || data.length === 0) {
      console.error("[consent] 재동의 저장 0행 — RLS 로 막혔을 가능성");
      return { error: "동의 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
    }
    await recordConsentEvents(user.id, [{ doc: "terms", version: TERMS_VERSION, action: "agree", source: "reconsent" }]);
    redirect("/onboarding");
  }

  /* ── 첫 가입 ── */
  const over14 = formData.get("over14") === "on";
  const privacy = formData.get("privacy") === "on";
  const marketing = formData.get("marketing") === "on";
  if (!over14 || !terms || !privacy) {
    return { error: "필수 항목에 모두 동의해야 서비스를 이용할 수 있어요." };
  }

  /* 행이 없을 때만 온다 — 그래도 upsert 로 둔다: 두 탭에서 동시에 누르면 두 번째가 insert 충돌로 실패하지 않게 */
  const { data, error } = await supabase
    .from("user_consents")
    .upsert(
      {
        user_id: user.id,
        over14_at: now,
        terms_at: now,
        terms_version: TERMS_VERSION,
        privacy_at: now,
        privacy_version: PRIVACY_VERSION,
        marketing_email_at: marketing ? now : null,
      },
      { onConflict: "user_id" },
    )
    .select("user_id");

  if (error) {
    /* 0079 미적용 — 사용자가 고칠 수 있는 일이 아니다. «다시 시도»라고 하면 계속 재시도만 한다. */
    if (isMissingTableError(error)) {
      console.error("[consent] user_consents 표 없음 — 0079 마이그레이션 미적용");
      return { error: "지금은 동의를 저장할 수 없어요. 잠시 후 다시 방문해 주세요." };
    }
    console.error("[consent] 동의 저장 실패:", error.message);
    return { error: "동의 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
  }
  if (!data || data.length === 0) {
    console.error("[consent] 동의 저장 0행 — RLS 로 막혔을 가능성");
    return { error: "동의 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
  }

  await recordConsentEvents(user.id, [
    { doc: "over14", action: "agree", source: "signup" },
    { doc: "terms", version: TERMS_VERSION, action: "agree", source: "signup" },
    { doc: "privacy", version: PRIVACY_VERSION, action: "acknowledge", source: "signup" },
    ...(marketing ? [{ doc: "marketing_email" as const, action: "agree" as const, source: "signup" as const }] : []),
  ]);
  /* 광고성 정보 수신 동의를 받았으면 처리 결과를 알린다(정보통신망법 §50⑦ — 14일 안).
     응답 뒤에 보낸다(after) — 메일 왕복을 가입 화면이 기다리지 않게. after 는 redirect 뒤에도 돈다(Next 문서). */
  if (marketing) {
    const email = user.email;
    after(() => notifyMarketingConsentResult(email, true));
  }

  redirect("/onboarding");
}

/**
 * 동의하지 않고 나가기(첫 가입 전용) — 계정을 지운다.
 *
 * 이게 없으면 **순환에 갇힌다**: 첫 로그인 순간 auth 트리거가 이메일을 이미 저장했는데,
 * 그걸 지우는 탈퇴 화면은 동의 게이트 «뒤»에 있다 — 동의를 거부한 사람이 자기 데이터를
 * 지우려면 먼저 동의해야 하는 모순이다(2026-09-02 감사 적발). 동의 화면에서 바로 지운다.
 * 삭제 루틴은 설정의 탈퇴와 **같은 코어**(lib/account/delete.ts)다.
 *
 * ⚠️ 동의 기록이 있는 회원(약관 개정 재동의)에게는 이 경로를 열지 않는다 — 확인 문구 없이 한 번에 지워지는
 *    버튼이라, 채널·프로필 링크·크레딧이 쌓인 기존 회원이 누르면 되돌릴 수 없다. 그 회원의 출구는
 *    로그아웃과, 확인 문구를 타이핑하는 withdrawFromConsent 다.
 */
export async function declineConsent(): Promise<void> {
  if (isDemoMode()) {
    redirect("/");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const has = await existingConsent(supabase, user.id);
  if (has !== "none") {
    /* 기존 회원(또는 확인 실패) — 확인 없는 삭제를 하지 않는다 */
    redirect("/onboarding/consent");
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("[consent] 미동의 삭제 실패: service role 키 미설정");
    redirect("/onboarding/consent?error=decline_failed");
  }

  const ok = await purgeAndDeleteUser(admin, user.id);
  if (!ok) {
    redirect("/onboarding/consent?error=decline_failed");
  }

  // 사용자는 지워졌는데 쿠키가 남으면 다음 요청이 «존재하지 않는 사용자»로 들어간다
  await supabase.auth.signOut();
  redirect("/goodbye");
}

/**
 * 재동의 화면의 회원 탈퇴 — 바뀐 약관에 동의하지 않는 기존 회원의 출구(약관 제3조⑤).
 *
 * 설정 > 개인정보의 탈퇴(deleteAccount)와 같은 3중 가드 — 확인 문구(이메일)를 서버에서 세션 값과 다시 대조한다.
 * 다른 점은 오류를 돌려보낼 곳뿐이다: 설정은 동의 게이트 «뒤»라, 거기로 보내면 다시 이 화면으로 튕겨 오류가 사라진다.
 */
export async function withdrawFromConsent(formData: FormData): Promise<void> {
  if (isDemoMode()) redirect("/");

  const typed = String(formData.get("confirm") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding/consent");

  const expected = (user.email ?? "").trim() || DELETE_PHRASE;
  if (typed.toLowerCase() !== expected.toLowerCase()) redirect("/onboarding/consent?error=withdraw_confirm");

  const admin = createAdminClient();
  if (!admin) {
    console.error("[consent] 재동의 화면 탈퇴 실패: service role 키 미설정");
    redirect("/onboarding/consent?error=withdraw_failed");
  }

  const ok = await purgeAndDeleteUser(admin, user.id);
  if (!ok) redirect("/onboarding/consent?error=withdraw_failed");

  await supabase.auth.signOut();
  redirect("/goodbye");
}
