import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FinchLogo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { INVITE_TTL_DAYS, isInviteExpired, sameInvitee } from "@/lib/team/invite";
import { acceptInvite } from "./actions";

/*
  팀 초대 수락 (PART 4.10) — (app) 그룹 밖 최상위 라우트다.
  이유: (app)/layout.tsx의 인증 가드는 미로그인 시 next 파라미터 없이 무조건 /login으로
  보내 초대 토큰을 잃어버린다. 이 페이지는 자체적으로 로그인 여부를 확인해 토큰을 보존한 채
  /login?next=/team/accept?token=... 로 보낸다(app/(auth-split)/login/login-form.tsx가 이 next를
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

/** 액션이 되돌려 보낸 이유(?e=) → 화면 문구. 운영 용어는 쓰지 않는다. */
const ERROR_COPY: Record<string, string> = {
  invalid: "링크가 취소됐거나 잘못됐어요. 워크스페이스 소유자에게 새 초대를 요청해 주세요.",
  mismatch: "이 초대는 초대받은 주소로 로그인했을 때만 수락할 수 있어요.",
  expired: "초대 링크가 만료됐어요. 소유자에게 새 초대를 요청해 주세요.",
  unavailable: "지금은 초대를 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
  failed: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
  demo: "지금은 예시 화면이라 팀 초대를 수락할 수 없어요.",
};

export default async function TeamAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; e?: string }>;
}) {
  const { token, e } = await searchParams;

  if (!token) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">잘못된 초대 링크예요</h1>
        <p className="mt-2 text-[15px] text-fg-sub">
          초대 링크에 토큰이 없습니다. 받으신 메일의 링크를 다시 확인해 주세요.
        </p>
      </Shell>
    );
  }

  if (isDemoMode()) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">지금은 예시 화면이에요</h1>
        <p className="mt-2 text-[15px] text-fg-sub">지금은 예시 화면이라 팀 초대를 수락할 수 없어요.</p>
      </Shell>
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">잠시 후 다시 시도해 주세요</h1>
        <p className="mt-2 text-[15px] text-fg-sub">서버 설정 문제로 초대를 처리할 수 없어요.</p>
      </Shell>
    );
  }

  const { data: invite, error: inviteError } = await admin
    .from("team_members")
    .select("id, email, role, status, invited_at, owner_user_id")
    .eq("invite_token", token)
    .maybeSingle();

  if (inviteError) {
    console.error("[team] 초대 토큰 조회 실패:", inviteError.message);
  }

  if (!invite || invite.status === "revoked") {
    return (
      <Shell>
        <h1 className="text-xl font-bold">유효하지 않은 초대예요</h1>
        <p className="mt-2 text-[15px] text-fg-sub">
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

  /* ⚠️ 빈 값끼리의 «일치»를 원천 차단한다 — 판정은 lib/team/invite.ts 한 곳이다(액션과 같은 규칙) */
  if (!sameInvitee(invite.email as string | null, user.email)) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">계정이 일치하지 않아요</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-sub">
          이 초대는 <span className="font-semibold text-fg">{invite.email || "다른 주소"}</span> 주소로만 수락할 수
          있어요. 지금은 <span className="font-semibold text-fg">{user.email || "이메일이 없는 계정"}</span>(으)로
          로그인돼 있어요.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button type="submit" className="text-[15px] font-semibold text-primary underline underline-offset-2">
            로그아웃하고 다른 계정으로 로그인
          </button>
        </form>
      </Shell>
    );
  }

  /* ⚠️ «이미 참여 중»을 만료보다 **먼저** 본다(소넷 점검). 순서가 반대면, 이 배포 전에 수락해 둔
     기존 팀원이 옛 링크를 다시 열었을 때 「만료됐어요」를 본다 — invited_at 은 수락해도 안 바뀌므로
     14일이 지난 거의 모든 실제 팀원이 그렇다. 참여 중인 사람에게 할 말은 만료가 아니라 «들어오세요»다. */
  if (invite.status === "active") redirect("/dashboard");

  if (isInviteExpired(invite.invited_at as string | null)) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">초대 링크가 만료됐어요</h1>
        <p className="mt-2 text-[15px] text-fg-sub">
          초대는 보낸 뒤 {INVITE_TTL_DAYS}일 동안만 유효해요. 워크스페이스 소유자에게 새 초대를 요청해 주세요.
        </p>
      </Shell>
    );
  }

  /* ⚠️ **여기서 쓰지 않는다.** 예전엔 이 렌더 안에서 service_role 이 편입을 확정해서,
     주소를 여는 것만으로 동의 없이 워크스페이스에 편입됐다(2026-09-07 감사).
     실제 편입은 아래 버튼(서버 액션)이 눌렸을 때만 일어난다. */
  const roleLabel = invite.role === "editor" ? "편집" : "보기";
  return (
    <Shell>
      <h1 className="text-xl font-bold">팀 초대를 받았어요</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-fg-sub">
        <span className="font-semibold text-fg">{user.email}</span> 계정으로 이 워크스페이스에 <br />
        <span className="font-semibold text-fg">{roleLabel} 권한</span>으로 참여합니다.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-faint">
        참여하면 이 워크스페이스의 지표와 연동 계정을 보게 되고, 내 대시보드는 이 워크스페이스 기준으로 바뀌어요.
      </p>
      {e && ERROR_COPY[e] ? <p className="mt-4 text-[14px] text-negative">{ERROR_COPY[e]}</p> : null}
      <form action={acceptInvite} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="trans-state w-full rounded-card bg-primary px-4 py-3 text-[15px] font-semibold text-on-primary hover:opacity-90"
        >
          참여하기
        </button>
      </form>
      <Link href="/" className="mt-3 inline-block text-[14px] text-fg-sub underline underline-offset-2">
        지금은 참여하지 않기
      </Link>
    </Shell>
  );
}
