"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { isInviteExpired, sameInvitee } from "@/lib/team/invite";

/*
  팀 초대 «수락» — 반드시 사용자가 버튼을 눌러야 실행된다.

  왜 서버 액션으로 옮겼나 (2026-09-07 보안 감사, Medium):
  예전엔 /team/accept?token=… 을 **여는 것만으로** 편입이 확정됐다. 페이지 렌더(GET) 안에서
  service_role 이 team_members 를 UPDATE 했기 때문이다. 그래서
   · 링크를 전달받아 눌러 본 사람이 동의 없이 워크스페이스에 편입되고,
   · 편입되면 대시보드·연동 계정·광고 화면의 스코프가 초대자 소유로 바뀌며(lib/team.ts getWorkspaceOwnerId),
   · 피해자는 자기 화면에서 되돌릴 수 없다(revokeMember 는 소유자만 부른다).
  상태를 바꾸는 동작이 GET 이라 뒤로가기·주소 공유·프리페치로도 반복 실행됐다.

  서버 액션은 Next 가 Origin 을 검증하므로 CSRF 도 함께 닫힌다.
  ⚠️ "use server" 파일은 async 함수만 export 할 수 있다 — 순수 판정은 lib/team/invite.ts 에 둔다.
*/

function back(token: string, reason: string): never {
  redirect(`/team/accept?token=${encodeURIComponent(token)}&e=${reason}`);
}

export async function acceptInvite(formData: FormData): Promise<void> {
  const raw = formData.get("token");
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) redirect("/team/accept");
  if (isDemoMode()) back(token, "demo");

  const admin = createAdminClient();
  if (!admin) back(token, "unavailable");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/team/accept?token=${token}`)}`);

  const { data: invite, error } = await admin
    .from("team_members")
    .select("id, email, status, invited_at")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) {
    console.error("[team] 초대 토큰 조회 실패:", error.message);
    back(token, "unavailable");
  }
  if (!invite || invite.status === "revoked") back(token, "invalid");
  if (!sameInvitee(invite.email as string | null, user.email)) back(token, "mismatch");
  /* 이미 참여 중이면 만료를 보지 않는다 — invited_at 은 수락해도 안 바뀌므로 오래된 팀원이 전부
     «만료»로 튕긴다(소넷 점검). 화면 쪽 판정과 같은 순서여야 두 곳이 같은 말을 한다. */
  if (invite.status === "active") redirect("/dashboard");
  if (isInviteExpired(invite.invited_at as string | null)) back(token, "expired");

  if (invite.status === "invited") {
    /* status='invited' 를 조건에 남겨 둔다 — 같은 링크를 두 번 눌러도 두 번 쓰이지 않는다.
       수락과 동시에 토큰을 비워 링크를 일회용으로 만든다(메일함에 남은 주소가 다시 안 먹는다). */
    const { error: updateError } = await admin
      .from("team_members")
      .update({
        member_user_id: user.id,
        joined_at: new Date().toISOString(),
        status: "active",
        invite_token: null,
      })
      .eq("id", invite.id)
      .eq("status", "invited");
    if (updateError) {
      console.error("[team] 초대 수락 처리 실패:", updateError.message);
      back(token, "failed");
    }
  }

  redirect("/dashboard");
}
