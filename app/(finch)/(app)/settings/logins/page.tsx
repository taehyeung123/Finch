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
  연결된 로그인 계정 — 2026-09-03 신설(허브 항목).

  핀치는 Google·카카오 OAuth 로만 로그인한다. 한 사람이 두 계정을 다 쓰면 Supabase 는
  **같은 사용자에 identity 를 둘** 붙일 수 있다(수동 연결, docs/AUTH_SETUP.md E절).
  이 화면은 그 목록이다 — 어느 로그인이 붙어 있는지, 언제 마지막으로 그걸로 들어왔는지,
  그리고 하나 더 붙이거나(연결) 떼는(해제) 일.

  identities 가 로그인 **방식**의 단일 출처다. app_metadata.provider 는 마지막 로그인 하나만
  담아서, 구글과 카카오를 모두 연결한 사람에게 거짓말을 한다(프로필 화면 주석에서 옮겨 옴).
*/
const LINKED_LABEL: Record<string, string> = { google: "Google", kakao: "카카오" };

export default async function LoginsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const linked = typeof sp.linked === "string" ? (LINKED_LABEL[sp.linked] ?? null) : null;

  let identities: LoginIdentity[] = [];
  if (!isDemoMode()) {
    const user = await getAuthUser();
    identities = (user?.identities ?? []).map((i) => {
      const data = (i.identity_data ?? {}) as Record<string, unknown>;
      return {
        provider: i.provider,
        email: typeof data.email === "string" ? data.email : null,
        lastSignInAt: i.last_sign_in_at ?? null,
        createdAt: i.created_at ?? null,
      };
    });
  }

  return (
    <SettingsShell
      title="연결된 로그인 계정"
      description="핀치에 로그인할 때 쓰는 계정이에요. 둘 다 연결해 두면 어느 쪽으로도 들어올 수 있어요."
    >
      {linked ? (
        <p role="status" className="rounded-card border border-positive/40 bg-positive-weak p-4 text-[15px] text-positive-strong">
          {linked} 계정을 연결했어요.
        </p>
      ) : null}
      <LoginLinksClient identities={identities} demo={isDemoMode()} />
    </SettingsShell>
  );
}
