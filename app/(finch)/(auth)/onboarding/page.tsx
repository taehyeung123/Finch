import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getConsentStatus } from "@/lib/legal/consent";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "시작 설정",
  description: "사용 목적을 선택하고 인스타그램·틱톡·쓰레드 채널을 연동해 핀치 대시보드를 준비하세요.",
};

export default async function OnboardingPage() {
  if (!isDemoMode()) {
    const user = await getAuthUser();
    /* 동의 게이트 — 필수 동의(0079) 전에는 어떤 안내 화면도 먼저다.
       (app) 레이아웃과 같은 규칙: 데모는 통과, unknown 도 통과(«모름»으로 가두지 않는다). */
    if (user && (await getConsentStatus(user.id)) === "missing") {
      redirect("/onboarding/consent");
    }
    /* 완료 게이트 — 이미 마친 사람에게 «처음 오셨나요?» 마법사를 또 보여주지 않는다(0080).
       회원가입 버튼으로 재로그인해도, 동의 화면에서 넘어와도 여기서 대시보드로 빠진다.
       조회 실패·0080 미적용은 통과(마법사 노출) — 안내 화면이라 갇혀도 «건너뛰기»로 나갈 수 있고,
       기록이 안 되는 상태에서 대시보드로 숨겨 버리면 신규가 목적 선택을 영영 못 한다. */
    if (user) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("users_profile")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();
      if ((data as { onboarded_at?: string | null } | null)?.onboarded_at) {
        redirect("/dashboard");
      }
    }
  }
  return <OnboardingForm />;
}
