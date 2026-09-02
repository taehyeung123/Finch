"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { isMissingColumnError } from "@/lib/publish-rules";

const PURPOSES = ["creator", "advertiser", "agency"] as const;
type Purpose = (typeof PURPOSES)[number];

/**
 * 온보딩 완료 기록 — 목적 저장 + onboarded_at 도장 (0080).
 *
 * «건너뛰기»도 이 액션을 탄다(purpose 없이) — 완료 도장을 안 찍으면
 * 건너뛴 사람에게 마법사가 영영 다시 뜬다.
 *
 * ⚠️ 기록 실패가 사용자를 막지 않는다. 온보딩은 법적 관문(동의)이 아니라 안내 화면이라,
 * 저장이 죽었다고 대시보드 진입을 막을 이유가 없다 — 로그만 남기고 보낸다.
 * (0080 미적용이면 컬럼이 없어 실패하는데, 그때도 같은 이유로 통과시킨다.)
 */
export async function completeOnboarding(formData: FormData): Promise<void> {
  if (isDemoMode()) {
    redirect("/dashboard");
  }

  const raw = formData.get("purpose");
  const purpose: Purpose | null =
    typeof raw === "string" && (PURPOSES as readonly string[]).includes(raw) ? (raw as Purpose) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const patch: Record<string, unknown> = {
      onboarded_at: new Date().toISOString(),
      /* 건너뛰기(purpose 없음)면 컬럼을 건드리지 않는다 — 예전에 골라 둔 값을 null 로 덮지 않기 위해 */
      ...(purpose ? { purpose } : {}),
    };
    const { data, error } = await supabase
      .from("users_profile")
      .update(patch)
      .eq("id", user.id)
      .select("id");
    if (error) {
      if (isMissingColumnError(error, /onboarded_at|purpose/i)) {
        // 0080 미적용 — 기록은 포기하고 사용자는 보낸다(위 주석). 적용되면 다음 완료 때 찍힌다.
        console.warn("[onboarding] 0080 미적용 — 완료 기록 생략");
      } else {
        console.error("[onboarding] 완료 기록 실패:", error.message);
      }
    } else if (!data || data.length === 0) {
      /* 프로필 행이 없다(가입 트리거 실패 등) — 도장이 안 찍혀 마법사가 또 뜬다.
         로그로 남겨야 «자꾸 온보딩이 떠요» 문의가 왔을 때 원인을 좁힐 수 있다. */
      console.error("[onboarding] 완료 기록 0행 — users_profile 행 없음:", user.id);
    }
  }

  redirect("/dashboard");
}
