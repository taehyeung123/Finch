import type { Metadata } from "next";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "시작 설정",
  description: "사용 목적을 선택하고 인스타그램·틱톡·쓰레드 채널을 연동해 핀치 대시보드를 준비하세요.",
};

export default function OnboardingPage() {
  return <OnboardingForm />;
}
