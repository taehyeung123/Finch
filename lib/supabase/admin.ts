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
