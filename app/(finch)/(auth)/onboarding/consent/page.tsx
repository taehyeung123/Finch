import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/supabase/config";
import { getAuthUser } from "@/lib/supabase/server";
import { getConsentSnapshot } from "@/lib/legal/consent";
import { canQuickDecline } from "@/lib/legal/quick-decline";
import { ConsentForm } from "./consent-form";

/*
  가입 필수 동의 화면 — 첫 로그인 직후 (app) 레이아웃 게이트가 여기로 보낸다.
  경로가 /onboarding/ 아래인 이유: 루트에 새 이름을 만들면 예약어(lib/links/reserved.ts +
  DB 마이그레이션)에 넣어야 하는데, onboarding 은 이미 예약돼 있다 — 이름 공간을 안 늘린다.

  2026-09 약관 개정부터 두 모양이다:
   · join   — 동의 기록이 없는 첫 가입(만 14세·약관·방침 확인 + 선택 광고성 정보)
   · update — 옛 약관에 동의한 기존 회원(바뀐 약관 동의 하나만). 공고 기간(notice)엔 «나중에»로 돌아갈 수 있고,
              시행일 뒤(gate)엔 동의·로그아웃·탈퇴 중 하나를 고른다 — 사람을 가두지 않는다.
  그리고 조회 실패(unknown)엔 어느 모양도 그리지 않는다(아래).
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

  /* 조회 실패 — 기록이 있는지 모르는데 «첫 가입» 모양을 그리면 기존 회원이 전체 동의·즉시 삭제 버튼을 본다
     (제출하면 서버가 재동의로 돌리며 광고성 정보 체크를 버리고, «나가기»는 말없이 튕긴다 — 2026-09-12 점검).
     레이아웃 게이트도 unknown 은 통과시키므로 같은 규칙으로 서비스로 보내 준다. */
  if (snap.status === "unknown") {
    return (
      <div className="rounded-card border border-line bg-body p-8">
        <h1 className="text-[20px] font-bold leading-tight">지금은 동의 상태를 확인할 수 없어요</h1>
        <p className="mt-2 break-keep text-[15px] leading-relaxed text-fg-sub">
          일시적인 문제로 동의 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 그동안 서비스는 그대로 이용할 수 있어요.
        </p>
        <p className="mt-5 flex flex-wrap gap-x-5 text-[15px] font-medium">
          {/* 같은 주소로 다시 온다 — 동적 화면이라 클라이언트 캐시에 굳지 않고 서버에서 다시 조회한다(staleTimes.dynamic 기본 0) */}
          <Link href="/onboarding/consent" className="-my-2 inline-block py-2.5 underline underline-offset-2 hover:text-primary-ink">
            다시 시도
          </Link>
          <Link href="/dashboard" className="-my-2 inline-block py-2.5 text-fg-sub underline underline-offset-2 hover:text-fg">
            서비스로 가기
          </Link>
        </p>
      </div>
    );
  }

  const { error } = await searchParams;
  return (
    <ConsentForm
      mode={snap.record ? "update" : "join"}
      phase={snap.status === "pending" ? "notice" : "gate"}
      marketingOn={Boolean(snap.record?.marketingAt)}
      /* 확인 없는 즉시 삭제는 막 로그인한 계정에만 — 오래된 계정은 확인 문구를 타이핑하는 탈퇴로(lib/legal/quick-decline.ts) */
      quickDecline={canQuickDecline(user.created_at)}
      email={user.email ?? ""}
      error={error ?? null}
    />
  );
}
