/**
 * Supabase 설정 여부 판별 — 환경변수(.env.local)가 없으면 데모 모드로 동작한다.
 * NEXT_PUBLIC_ 접두사 변수는 빌드 시 인라인되므로 클라이언트/서버 양쪽에서 호출 가능.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
