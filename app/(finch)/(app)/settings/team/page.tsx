import type { Metadata } from "next";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getWorkspaceMembership, type WorkspaceMembership } from "@/lib/team";
import { SettingsShell } from "../_components/settings-shell";
import { TeamClient, type TeamRowVM } from "./_components/team-client";

export const metadata: Metadata = {
  title: "팀",
  robots: { index: false, follow: false },
};

/*
  팀 워크스페이스 (PRD PART 4.10) — 2026-09-03 재설계(요약 카드 + 멤버 행 + 초대 모달).
  - team_members(0012)에서 초대중·활성 멤버를 조회한다. 소유자만 초대·역할변경·제거 버튼을 본다.
  - 멤버로 보는 경우 RLS("member reads own membership")가 자기 행만 돌려주므로 다른 팀원 명단은 보이지 않는다(v1).
  - 조회 실패는 rows=null — «멤버 없음»과 가른다(전에는 빈 목록으로 그렸다).
  - 데모: 샘플 멤버로 화면 미리보기, 모든 액션은 비활성.
*/

const SAMPLE_MEMBERS: TeamRowVM[] = [
  { id: "sample-owner", email: "minji@finch.ai.kr", role: "owner", status: "active", isSelf: true, invitedAt: null },
  { id: "sample-editor", email: "jaehyun@finch.ai.kr", role: "editor", status: "active", isSelf: false, invitedAt: "2026-08-20T09:00:00.000Z" },
  { id: "sample-viewer", email: "soyeon@finch.ai.kr", role: "viewer", status: "invited", isSelf: false, invitedAt: "2026-09-01T09:00:00.000Z" },
];

async function loadTeamData(): Promise<{ role: WorkspaceMembership["role"]; rows: TeamRowVM[] | null }> {
  if (isDemoMode()) return { role: "owner", rows: SAMPLE_MEMBERS };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { role: "unknown", rows: [] };

  const membership = await getWorkspaceMembership(supabase, user.id);
  const isOwner = membership.role === "owner";

  const { data, error } = await supabase
    .from("team_members")
    .select("id, email, role, status, member_user_id, created_at")
    .eq("owner_user_id", membership.ownerId)
    .in("status", ["invited", "active"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[team] 팀 멤버 조회 실패:", error.message);
    return { role: membership.role, rows: null };
  }

  const rows: TeamRowVM[] = (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role === "editor" ? "editor" : "viewer",
    status: r.status === "active" ? "active" : "invited",
    isSelf: r.member_user_id === user.id,
    invitedAt: typeof r.created_at === "string" ? r.created_at : null,
  }));

  // 소유자 본인은 team_members 에 행이 없으므로 목록 맨 앞에 합성해 넣는다.
  if (isOwner) rows.unshift({ id: "self-owner", email: user.email ?? "", role: "owner", status: "active", isSelf: true, invitedAt: null });

  return { role: membership.role, rows };
}

export default async function TeamSettingsPage() {
  const { role, rows } = await loadTeamData();
  return (
    <SettingsShell title="팀" description="워크스페이스를 함께 쓰는 사람과 역할을 관리해요.">
      <TeamClient initialRows={rows} role={role} demoMode={isDemoMode()} />
    </SettingsShell>
  );
}
