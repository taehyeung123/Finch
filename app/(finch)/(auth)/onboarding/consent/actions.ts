"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isMissingTableError } from "@/lib/supabase/errors";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/consent";

export interface ConsentFormState {
  error: string | null;
}

/**
 * 필수 동의 저장 — 만 14세 · 이용약관 · 개인정보 수집·이용 (+ 선택 마케팅).
 *
 * ⚠️ 클라이언트의 비활성 버튼을 믿지 않는다 — 필수 세 개는 서버에서 다시 검사한다.
 * 폼 조작으로 체크 없이 제출하면 저장 없이 오류를 돌려준다(체크가 곧 동의의 증거다).
 */
export async function saveConsent(
  _prev: ConsentFormState,
  formData: FormData,
): Promise<ConsentFormState> {
  if (isDemoMode()) {
    // 데모에는 기록할 사용자가 없다 — 게이트도 데모를 안 세우므로 이 화면에 올 일 자체가 없다
    redirect("/onboarding");
  }

  const over14 = formData.get("over14") === "on";
  const terms = formData.get("terms") === "on";
  const privacy = formData.get("privacy") === "on";
  const marketing = formData.get("marketing") === "on";
  if (!over14 || !terms || !privacy) {
    return { error: "필수 항목에 모두 동의해야 서비스를 이용할 수 있어요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/onboarding/consent");
  }

  const now = new Date().toISOString();
  /* 재동의(문서 개정)면 같은 행을 갱신한다 — user_id 가 PK 라 upsert 로 한 번에.
     ⚠️ 마케팅은 재동의 화면에서 체크를 안 했다고 기존 동의를 지우면 안 되나,
     이 화면은 «지금 화면에 보이는 체크 상태 = 저장되는 상태»가 맞다 —
     화면에 체크가 비어 있는데 DB 에만 동의가 남아 있으면 사용자가 철회했다고 믿은 것과 어긋난다. */
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
  /* PostgREST 는 RLS 로 0행이 되어도 오류를 안 낸다 — 행 수를 확인한다(저장소 규칙) */
  if (!data || data.length === 0) {
    console.error("[consent] 동의 저장 0행 — RLS 로 막혔을 가능성");
    return { error: "동의 저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
  }

  redirect("/onboarding");
}
