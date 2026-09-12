import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/supabase/config";
import { getAuthUser } from "@/lib/supabase/server";
import { getConsentSnapshot } from "@/lib/legal/consent";
import { ConsentForm } from "./consent-form";

/*
  가입 필수 동의 화면 — 첫 로그인 직후 (app) 레이아웃 게이트가 여기로 보낸다.
  경로가 /onboarding/ 아래인 이유: 루트에 새 이름을 만들면 예약어(lib/links/reserved.ts +
  DB 마이그레이션)에 넣어야 하는데, onboarding 은 이미 예약돼 있다 — 이름 공간을 안 늘린다.

  2026-09 약관 개정부터 두 모양이다:
   · join   — 동의 기록이 없는 첫 가입(만 14세·약관·방침 확인 + 선택 광고성 정보)
   · update — 옛 약관에 동의한 기존 회원(바뀐 약관 동의 하나만). 공고 기간(notice)엔 «나중에»로 돌아갈 수 있고,
              시행일 뒤(gate)엔 동의·로그아웃·탈퇴 중 하나를 고른다 — 사람을 가두지 않는다.
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

  // 이미 현행 기준으로 동의했으면 다시 물을 이유가 없다
  const snap = await getConsentSnapshot(user.id);
  if (snap.status === "ok") redirect("/onboarding");

  const { error } = await searchParams;
  return (
    <ConsentForm
      mode={snap.record ? "update" : "join"}
      phase={snap.status === "pending" ? "notice" : "gate"}
      marketingOn={Boolean(snap.record?.marketingAt)}
      email={user.email ?? ""}
      error={error ?? null}
    />
  );
}
