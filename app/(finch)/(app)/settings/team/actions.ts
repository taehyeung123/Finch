"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { sendTeamInviteEmail } from "@/lib/email/resend";
import { getCurrentPlan } from "@/lib/data/internal";
import { teamSeatsFor } from "@/lib/pricing/team-seats";

/** 한 워크스페이스가 1시간에 보낼 수 있는 초대 수 — 진짜 팀 구성에는 넉넉하고, 메일 발사대로는 못 쓰는 값 */
const INVITE_PER_HOUR = 20;

/*
  팀 멤버 초대·역할·제거 (PART 4.10)
  - owner 판별은 별도 "owner 여부" 컬럼이 아니라 team_members.owner_user_id = auth.uid()로 한다 —
    RLS("owner manage members")가 이 조건일 때만 insert/update/delete를 허용하므로, 여기 코드는
    "본인 확인"만 하면 되고 실제 소유권 검증은 DB가 한다(이중 방어).
  - 데모 모드는 실 DB가 없으므로 전부 no-op.
*/

/* 모든 팀 액션은 동일한 결과 타입을 반환한다 — 실패를 UI에 표시할 수 있도록
   (2026-08 감사: revoke/updateRole만 void 반환이라 실패가 조용히 삼켜지던 비대칭 수리). */
export type TeamActionResult = { ok: true } | { ok: false; error: string };
export type InviteMemberResult = TeamActionResult;

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
  if (isDemoMode()) return { ok: false, error: "지금은 예시 화면이라 팀 초대를 할 수 없어요." };

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

  /* 플랜별 좌석 상한 — 요금제 표가 「Pro 최대 3인 / Agency 최대 10인」을 차별점으로 파는데 이 액션에는
     plan 검사가 아예 없었다. Free 도 무제한으로 썼고, 산 것과 준 것이 달랐다(2026-09-07 감사).
     조회 실패(null)면 막지 않는다 — 유료 고객을 무료 상한으로 잠그는 쪽이 더 나쁘다(teamSeatsFor). */
  const seats = teamSeatsFor(await getCurrentPlan());
  if (seats <= 0) {
    return { ok: false, error: "팀 초대는 Pro 플랜부터 쓸 수 있어요. 요금제에서 플랜을 올리면 팀원을 초대할 수 있습니다." };
  }
  const { count: usedSeats, error: seatErr } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .in("status", ["invited", "active"]);
  if (seatErr) {
    console.error("[team] 좌석 수 확인 실패:", seatErr.message);
    return { ok: false, error: "초대 처리 중 오류가 발생했어요. 다시 시도해 주세요." };
  }
  if ((usedSeats ?? 0) >= seats) {
    return {
      ok: false,
      error: `팀원 자리를 모두 썼어요(${usedSeats}/${seats}명). 플랜을 올리거나 기존 팀원을 제거한 뒤 다시 초대해 주세요.`,
    };
  }

  /* 초대는 **우리 도메인으로 메일을 쏘는 버튼**이다. 횟수 제한이 없으면 가입 30초짜리 계정 하나로
     임의 주소에 핀치 발신 메일을 무제한 보낼 수 있다 — 발신 도메인 평판이 타고 복구에 수 주가 걸린다
     (2026-09-07 감사). 카운터는 DB 로 센다 — 서버리스는 인스턴스가 여러 개라 메모리 카운터는 의미가 없다.
     invited_at 은 신규 초대와 재초대 양쪽이 찍으므로 두 경로가 같은 창을 공유한다. */
  const { count: recentInvites, error: rateErr } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .gte("invited_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (rateErr) {
    console.error("[team] 초대 횟수 확인 실패:", rateErr.message);
    return { ok: false, error: "초대 처리 중 오류가 발생했어요. 다시 시도해 주세요." };
  }
  if ((recentInvites ?? 0) >= INVITE_PER_HOUR) {
    return { ok: false, error: "초대를 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요." };
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
        /* member_user_id 는 보내지 않는다 — 0084 가 그 컬럼의 쓰기 권한을 사용자에게서 회수했다.
           (그 권한이 열려 있으면 남을 자기 워크스페이스의 활성 팀원으로 끌어올 수 있었다.)
           status 가 'invited' 로 돌아가면 활성 조회(getWorkspaceOwnerId)에 안 걸리므로 옛 값이 남아도 무해하고,
           수락 경로(app/(finch)/team/accept, service_role)가 수락 시점에 올바른 사람으로 덮어쓴다. */
        .update({
          role,
          status: "invited",
          invite_token: inviteToken,
          invited_at: now,
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
export async function revokeMember(memberId: string): Promise<TeamActionResult> {
  if (isDemoMode()) return { ok: false, error: "지금은 예시 화면이라 멤버를 제거할 수 없어요." };
  if (!memberId) return { ok: false, error: "잘못된 요청이에요. 화면을 새로고침해 주세요." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("team_members")
    .update({ status: "revoked" })
    .eq("id", memberId)
    .eq("owner_user_id", user.id);
  if (error) {
    console.error("[team] 멤버 제거 실패:", error.message);
    return { ok: false, error: "멤버 제거 중 오류가 발생했어요. 다시 시도해 주세요." };
  }
  revalidatePath("/settings/team");
  return { ok: true };
}

/** 역할 변경 — 소유자 전용(RLS로도 이중 방어). */
export async function updateMemberRole(
  memberId: string,
  role: "editor" | "viewer",
): Promise<TeamActionResult> {
  if (isDemoMode()) return { ok: false, error: "지금은 예시 화면이라 역할을 변경할 수 없어요." };
  if (!memberId) return { ok: false, error: "잘못된 요청이에요. 화면을 새로고침해 주세요." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("team_members")
    .update({ role })
    .eq("id", memberId)
    .eq("owner_user_id", user.id);
  if (error) {
    console.error("[team] 역할 변경 실패:", error.message);
    return { ok: false, error: "역할 변경 중 오류가 발생했어요. 다시 시도해 주세요." };
  }
  revalidatePath("/settings/team");
  return { ok: true };
}
