import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 팀 워크스페이스 소유자 판별 (PART 4.10) — 로그인한 유저가 활성 상태로 소속된 팀이 있으면
 * 그 소유자(owner_user_id)를 반환하고, 없으면 본인이 곧 워크스페이스 소유자다.
 *
 * v1 단순화: 한 유저는 최대 하나의 팀에만 소속된다고 가정(supabase/migrations/0012_team.sql).
 * 대시보드·연동 계정 조회(lib/data/live.ts)가 이 값을 owner 스코프로 써서, 멤버가 보면
 * 소유자의 데이터가 보이게 한다. 알림·리포트·결제·사용량(lib/data/internal.ts)은 이 함수를
 * 쓰지 않는다 — 그건 항상 로그인한 본인 소유로 유지한다.
 */
export async function getWorkspaceOwnerId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("team_members")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[team] 워크스페이스 소유자 조회 실패:", error.message);
    return userId;
  }
  return (data?.owner_user_id as string | undefined) ?? userId;
}

export interface WorkspaceMembership {
  ownerId: string;
  /** owner = 본인 워크스페이스. 팀원이면 0012 의 role(editor/viewer). unknown = 조회 실패 */
  role: "owner" | "editor" | "viewer" | "unknown";
}

/**
 * 소유자 + 내 역할 — **돈이 걸린 쓰기**(광고 켜기 등)의 권한 판정용.
 *
 * 왜 필요한가: 0077 RLS 는 활성 팀원에게 소유자의 광고 연동 «읽기»를 의도적으로 열어 준다.
 * 그대로 두면 viewer 팀원이 소유자 토큰으로 광고를 켤 수 있다 — RLS 위반이 아니라
 * 의도된 읽기 허용이라 DB 가 못 막는다. 서버 액션이 이 role 로 명시적으로 막는다.
 *
 * ⚠️ 조회 실패는 «viewer»가 아니라 «unknown»이다 — 다만 쓰기 권한 판정에서는
 * unknown 을 **거부**로 다룬다(읽기의 fail-open 과 반대 — 모르는 채로 돈을 쓰게 두지 않는다).
 */
export async function getWorkspaceMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorkspaceMembership> {
  const { data, error } = await supabase
    .from("team_members")
    .select("owner_user_id, role")
    .eq("member_user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[team] 워크스페이스 역할 조회 실패:", error.message);
    return { ownerId: userId, role: "unknown" };
  }
  if (!data) return { ownerId: userId, role: "owner" };
  const row = data as { owner_user_id: string; role?: string };
  return {
    ownerId: row.owner_user_id,
    role: row.role === "editor" ? "editor" : "viewer",
  };
}
