import type { Metadata } from "next";
import { isPaidPlan } from "@/lib/toss/config";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "무료로 시작하기",
  description:
    "신용카드 없이 소셜 계정으로 3초 만에 가입하고 인스타그램·틱톡·쓰레드 분석과 메타광고 관리를 시작하세요.",
  alternates: { canonical: "/signup" },
};

/**
 * 요금제 페이지에서 유료 플랜을 고르고 온 사람은 `?plan=pro` 를 달고 온다.
 * 그 의사를 가입 뒤까지 들고 가서 바로 결제 화면으로 보낸다 — 앞서는 전원이
 * /onboarding 으로 떨어져서, 결제하겠다고 누른 사람이 설정 > 요금제를 스스로
 * 찾아 들어가 처음부터 다시 고르게 돼 있었다.
 *
 * plan 은 **화이트리스트 검증**만 통과시킨다. 검증 없이 next 를 조립하면
 * 오픈 리다이렉트가 된다(app/auth/callback/route.ts 도 same-origin 을 다시 본다).
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.plan === "string" ? sp.plan : "";
  const nextPath = isPaidPlan(raw) ? `/settings/billing/subscribe?plan=${raw}` : "/onboarding";

  return <SignupForm nextPath={nextPath} />;
}
