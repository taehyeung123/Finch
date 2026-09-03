import type { Metadata } from "next";
import { getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { SettingsShell } from "../_components/settings-shell";
import { LoginLinksClient, type LoginIdentity } from "./_components/login-links-client";

export const metadata: Metadata = {
  title: "연결된 로그인 계정",
  robots: { index: false, follow: false },
};

/*
  연결된 로그인 계정 — 2026-09-03 신설 → 같은 날 재설계(요약 카드 + 행 + 모달 확인).

  핀치는 Google·카카오 OAuth 로만 로그인한다. 한 사람이 두 계정을 다 쓰면 Supabase 는 **같은 사용자에 identity 를 둘**
  붙일 수 있다(수동 연결, docs/AUTH_SETUP.md E절). identities 가 로그인 **방식**의 단일 출처다 —
  app_metadata.provider 는 마지막 로그인 하나만 담아서 둘 다 연결한 사람에게 거짓말을 한다.
  이 화면은 별도 쿼리 없이 레이아웃이 확보한 user 를 쓴다 — 그래서 «조회 실패» 상태를 따로 만들지 않는다(생길 수 없는 상태를 그리지 않는다).
*/
const DEMO_IDENTITIES: LoginIdentity[] = [
  { provider: "google", email: "demo@example.com", name: "핀치", avatarUrl: null, lastSignInAt: "2026-09-01T09:00:00.000Z", createdAt: "2026-06-12T09:00:00.000Z" },
];

function httpsOnly(v: unknown): string | null {
  return typeof v === "string" && /^https:\/\//i.test(v) ? v : null;
}

export default async function LoginsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const linked = typeof sp.linked === "string" ? sp.linked : null;
  const demo = isDemoMode();

  let identities: LoginIdentity[] = DEMO_IDENTITIES;
  if (!demo) {
    const user = await getAuthUser();
    identities = (user?.identities ?? []).map((i) => {
      const data = (i.identity_data ?? {}) as Record<string, unknown>;
      const name = [data.name, data.full_name, data.preferred_username, data.user_name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
      return {
        provider: i.provider,
        email: typeof data.email === "string" ? data.email : null,
        name: name ?? null,
        avatarUrl: httpsOnly(data.avatar_url) ?? httpsOnly(data.picture),
        lastSignInAt: i.last_sign_in_at ?? null,
        createdAt: i.created_at ?? null,
      };
    });
  }

  return (
    <SettingsShell title="연결된 로그인 계정" description="핀치에 들어올 때 쓰는 Google·카카오 계정이에요.">
      <LoginLinksClient identities={identities} demo={demo} linkedParam={linked} />
      <p className="px-1 text-[14px] text-fg-sub">비밀번호는 따로 없어요 — 핀치는 Google·카카오 계정으로만 로그인해요.</p>
    </SettingsShell>
  );
}
