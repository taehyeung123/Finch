/* 이 저장소에서 가장 민감한 파일이다 — 아래 주석이 «클라이언트에서 import 금지» 라고 적어 두고
   정작 그걸 강제하는 한 줄이 없었다(2026-09-07 감사). 이 import 가 있으면 이 모듈이 클라이언트
   그래프에 닿는 순간 **빌드가 실패한다** — 규칙을 사람이 아니라 빌드가 지킨다. */
import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 관리자(service role) 클라이언트 — 웹훅 라우트처럼 사용자 세션이 없는 곳에서만 사용.
 *
 * - RLS를 우회하므로 절대 클라이언트 코드에서 import 하지 않는다 ("server-only" 경로에서만).
 * - SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두사 금지. 미설정이면 null을 반환하고
 *   호출측(웹훅 등)은 처리를 건너뛴다 — 연동 전 빌드·런타임이 깨지지 않게.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
