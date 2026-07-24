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
