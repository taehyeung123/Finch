import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrimaryOwner } from "@/lib/channel-availability";

/**
 * IG_TEST_ACCESS_TOKEN(운영자 개인 계정의 개발용 토큰)은 **운영자 본인 계정에만** 쓴다.
 *
 * 예전엔 토큰 복호화가 안 되면 누구 계정이든 이 토큰으로 떨어졌다 — 남의 계정(entry.id)의 /messages 를 운영자 토큰으로
 * 부르면 메타가 권한 오류를 내고, 코드는 그걸 failed_permission 으로 **확정**했다. 폴백이 없었다면
 * pending/token_unavailable 로 남아 재연동 뒤 flush 가 보냈을 건이다(2026-09-09 감사).
 * «없으면 원래대로» 폴백이 곧 취약한 조건인 전형(CLAUDE.md 보안 규칙) — 소유자 확인 뒤에만 준다.
 * 운영자 목록(OWNER_EMAIL)의 **첫 주소(사장님)만**이다 — 메타 심사용 계정도 그 목록에 들어가는데(채널 열람용),
 * 그 계정의 토큰이 풀리지 않을 때 사장님 개인 토큰으로 대신 보내면 안 된다(2026-09-11).
 */
export async function ownerDevToken(admin: SupabaseClient, ownerId: string): Promise<string | null> {
  const dev = process.env.IG_TEST_ACCESS_TOKEN;
  if (!dev) return null;
  const { data } = await admin.auth.admin.getUserById(ownerId);
  return isPrimaryOwner(data?.user?.email) ? dev : null;
}
