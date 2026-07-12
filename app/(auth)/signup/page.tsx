import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "무료로 시작하기",
  description: "신용카드 없이 소셜 계정으로 3초 만에 가입하고 인스타그램·틱톡·쓰레드 분석과 메타광고 관리를 시작하세요.",
};

export default function SignupPage() {
  return <SignupForm />;
}
