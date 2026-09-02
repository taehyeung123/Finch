import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/supabase/config";
import { getAuthUser } from "@/lib/supabase/server";
import { getConsentStatus } from "@/lib/legal/consent";
import { ConsentForm } from "./consent-form";

/*
  가입 필수 동의 화면 — 첫 로그인 직후 (app) 레이아웃 게이트가 여기로 보낸다.
  경로가 /onboarding/ 아래인 이유: 루트에 새 이름을 만들면 예약어(lib/links/reserved.ts +
  DB 마이그레이션)에 넣어야 하는데, onboarding 은 이미 예약돼 있다 — 이름 공간을 안 늘린다.
*/

export const metadata: Metadata = {
  title: "서비스 이용 동의",
  robots: { index: false, follow: false },
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // 데모에는 기록할 사용자가 없다 — 게이트도 안 세우므로 직접 온 경우만 돌려보낸다
  if (isDemoMode()) redirect("/onboarding");

  const user = await getAuthUser();
  if (!user) redirect("/login?next=/onboarding/consent");

  // 이미 현행 버전으로 동의했으면 다시 물을 이유가 없다
  if ((await getConsentStatus(user.id)) === "ok") redirect("/onboarding");

  const { error } = await searchParams;
  return <ConsentForm declineFailed={error === "decline_failed"} />;
}
