import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/supabase/config";
import { getAuthUser } from "@/lib/supabase/server";
import { getConsentStatus } from "@/lib/legal/consent";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "시작 설정",
  description: "사용 목적을 선택하고 인스타그램·틱톡·쓰레드 채널을 연동해 핀치 대시보드를 준비하세요.",
};

export default async function OnboardingPage() {
  /* 동의 게이트 — 온보딩 2단계가 채널 연동(개인정보 수집의 시작)이라 여기도 세운다.
     (app) 레이아웃과 같은 규칙: 데모는 통과, unknown 도 통과(«모름»으로 가두지 않는다). */
  if (!isDemoMode()) {
    const user = await getAuthUser();
    if (user && (await getConsentStatus(user.id)) === "missing") {
      redirect("/onboarding/consent");
    }
  }
  return <OnboardingForm />;
}
