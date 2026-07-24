import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinchLogo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";

/*
  팀 초대 수락 (PART 4.10) — (app) 그룹 밖 최상위 라우트다.
  이유: (app)/layout.tsx의 인증 가드는 미로그인 시 next 파라미터 없이 무조건 /login으로
  보내 초대 토큰을 잃어버린다. 이 페이지는 자체적으로 로그인 여부를 확인해 토큰을 보존한 채
  /login?next=/team/accept?token=... 로 보낸다(app/(auth)/login/login-form.tsx가 이 next를
  OAuth 콜백까지 이어받는다).

  초대 토큰 조회·수락 처리는 admin client(RLS 우회)로만 한다 — 로그인 전이거나 이메일이
  아직 어느 team_members 행과도 연결되지 않은 시점엔 auth.uid()로 걸 수 있는 RLS 조건이
  없기 때문이다(supabase/migrations/0012_team.sql 주석 참고).
*/

export const metadata: Metadata = {
  title: "팀 초대 수락",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <Link
        href="/"
        aria-label="핀치 홈으로 이동"
        className="rounded-card focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        <FinchLogo />
      </Link>
      <div className="w-full max-w-md rounded-card border border-line bg-body p-8 text-center">{children}</div>
    </div>
  );
}

export default async function TeamAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">잘못된 초대 링크예요</h1>
        <p className="mt-2 text-[14px] text-fg-sub">
          초대 링크에 토큰이 없습니다. 받으신 메일의 링크를 다시 확인해 주세요.
        </p>
      </Shell>
    );
  }

  if (isDemoMode()) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">데모 모드예요</h1>
        <p className="mt-2 text-[14px] text-fg-sub">팀 초대 수락은 실 서비스 환경에서만 동작합니다.</p>
      </Shell>
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">잠시 후 다시 시도해 주세요</h1>
        <p className="mt-2 text-[14px] text-fg-sub">서버 설정 문제로 초대를 처리할 수 없어요.</p>
      </Shell>
    );
  }

  const { data: invite, error: inviteError } = await admin
    .from("team_members")
    .select("id, email, role, status")
    .eq("invite_token", token)
    .maybeSingle();

  if (inviteError) {
    console.error("[team] 초대 토큰 조회 실패:", inviteError.message);
  }

  if (!invite || invite.status === "revoked") {
    return (
      <Shell>
        <h1 className="text-xl font-bold">유효하지 않은 초대예요</h1>
        <p className="mt-2 text-[14px] text-fg-sub">
          링크가 취소됐거나 잘못됐어요. 워크스페이스 소유자에게 새 초대를 요청해 주세요.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/team/accept?token=${token}`)}`);
  }

  const inviteEmail = invite.email.toLowerCase();
  const userEmail = (user.email ?? "").toLowerCase();

  if (inviteEmail !== userEmail) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">계정이 일치하지 않아요</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-sub">
          이 초대는 <span className="font-semibold text-fg">{invite.email}</span> 주소로만 수락할 수 있어요.
          지금은 <span className="font-semibold text-fg">{user.email}</span>(으)로 로그인돼 있어요.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button type="submit" className="text-[14px] font-semibold text-primary underline underline-offset-2">
            로그아웃하고 다른 계정으로 로그인
          </button>
        </form>
      </Shell>
    );
  }

  if (invite.status === "invited") {
    const { error: updateError } = await admin
      .from("team_members")
      .update({ member_user_id: user.id, joined_at: new Date().toISOString(), status: "active" })
      .eq("id", invite.id)
      .eq("status", "invited");
    if (updateError) {
      console.error("[team] 초대 수락 처리 실패:", updateError.message);
      return (
        <Shell>
          <h1 className="text-xl font-bold">처리 중 오류가 발생했어요</h1>
          <p className="mt-2 text-[14px] text-fg-sub">잠시 후 다시 시도해 주세요.</p>
        </Shell>
      );
    }
  }

  redirect("/dashboard");
}
