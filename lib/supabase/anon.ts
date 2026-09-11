import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 세션 없는 익명(anon 키) 서버 클라이언트 — **창고(ISR)에 굳힐 공개 화면 전용**(2026-09-11).
 *
 * 공개 프로필은 처음 한 번 그린 완성 화면을 Vercel CDN 에 넣어 두고 모든 방문자에게 같은 것을 준다
 * (lib/links/public-cache.ts). 그 화면은 «누가 요청했든 처음 온 익명 방문자가 보는 것»이어야 한다.
 * 이 클라이언트는 쿠키를 읽지 않으므로 그 조건을 코드 모양으로 지킨다.
 *
 * service_role 이 아니라 anon 키인 이유: RLS 가 그대로 걸린다(0059 — 발행·비잠금 행만, 공개 컬럼만).
 * 창고용 조회에서 코드 한 줄을 잘못 써도 비공개·잠금 페이지 내용은 DB 가 내주지 않는다 — 두 번째 안전장치다.
 *
 * 로그인·주인 판정이 필요한 곳엔 쓰지 말 것 — 그건 lib/supabase/server.ts 의 createClient 가 정본이다.
 */
export function createAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createSupabaseClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
