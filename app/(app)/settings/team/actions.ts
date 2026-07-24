"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { sendTeamInviteEmail } from "@/lib/email/resend";

/*
  팀 멤버 초대·역할·제거 (PART 4.10)
  - owner 판별은 별도 "owner 여부" 컬럼이 아니라 team_members.owner_user_id = auth.uid()로 한다 —
    RLS("owner manage members")가 이 조건일 때만 insert/update/delete를 허용하므로, 여기 코드는
    "본인 확인"만 하면 되고 실제 소유권 검증은 DB가 한다(이중 방어).
  - 데모 모드는 실 DB가 없으므로 전부 no-op.
*/

export type InviteMemberResult = { ok: true } | { ok: false; error: string };

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://finch.ai.kr").replace(/\/$/, "");
}

function inviterDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name : "";
  const name = typeof meta.name === "string" ? meta.name : "";
  return fullName || name || user.email?.split("@")[0] || "핀치 팀";
}

/** 팀 멤버 초대 — 소유자만(owner_user_id = auth.uid()). 이미 초대/참여 중인 이메일이면 에러. */
export async function inviteMember(formData: FormData): Promise<InviteMemberResult> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 팀 초대를 사용할 수 없어요." };

  const emailRaw = formData.get("email");
  const roleRaw = formData.get("role");
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  const role = roleRaw === "editor" ? "editor" : "viewer";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "올바른 이메일 주소를 입력해 주세요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (email === (user.email ?? "").toLowerCase()) {
    return { ok: false, error: "본인은 초대할 수 없어요." };
  }

  const { data: existing, error: findError } = await supabase
    .from("team_members")
    .select("id, status")
    .eq("owner_user_id", user.id)
    .eq("email", email)
    .maybeSingle();
  if (findError) {
    console.error("[team] 기존 초대 조회 실패:", findError.message);
    return { ok: false, error: "초대 처리 중 오류가 발생했어요. 다시 시도해 주세요." };
  }
  if (existing && existing.status !== "revoked") {
    return { ok: false, error: "이미 초대했거나 참여 중인 이메일이에요." };
  }

  const inviteToken = randomUUID();
  const now = new Date().toISOString();

  const { error } = existing
    ? await supabase
        .from("team_members")
        .update({
          role,
          status: "invited",
          invite_token: inviteToken,
          invited_at: now,
          member_user_id: null,
          joined_at: null,
        })
        .eq("id", existing.id)
    : await supabase.from("team_members").insert({
        owner_user_id: user.id,
        email,
        role,
        status: "invited",
        invite_token: inviteToken,
        invited_at: now,
      });

  if (error) {
    console.error("[team] 초대 저장 실패:", error.message);
    return { ok: false, error: "초대 저장 중 오류가 발생했어요. 다시 시도해 주세요." };
  }

  const acceptUrl = `${siteUrl()}/team/accept?token=${inviteToken}`;
  await sendTeamInviteEmail(email, inviterDisplayName(user), role, acceptUrl);

  revalidatePath("/settings/team");
  return { ok: true };
}

/** 멤버 제거 — 소유자 소유 행만 revoked로 전환한다(RLS로도 동일하게 이중 방어). */
export async function revokeMember(memberId: string): Promise<void> {
  if (isDemoMode() || !memberId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("team_members")
    .update({ status: "revoked" })
    .eq("id", memberId)
    .eq("owner_user_id", user.id);
  if (error) console.error("[team] 멤버 제거 실패:", error.message);
  revalidatePath("/settings/team");
}

/** 역할 변경 — 소유자 전용(RLS로도 이중 방어). */
export async function updateMemberRole(memberId: string, role: "editor" | "viewer"): Promise<void> {
  if (isDemoMode() || !memberId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("team_members")
    .update({ role })
    .eq("id", memberId)
    .eq("owner_user_id", user.id);
  if (error) console.error("[team] 역할 변경 실패:", error.message);
  revalidatePath("/settings/team");
}
