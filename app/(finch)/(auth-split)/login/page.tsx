import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
  description: "핀치 계정으로 로그인하고 인스타그램·틱톡·쓰레드 분석을 시작하세요.",
};

export default function LoginPage() {
  return <LoginForm />;
}
