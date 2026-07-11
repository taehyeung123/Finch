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

/**
 * 데모 모드 강제 스위치 — NEXT_PUBLIC_DEMO_MODE=true 이면 Supabase 키가 있어도
 * 인증을 건너뛰고 전체 화면을 열어준다. Supabase 프로젝트가 일시정지/한도초과로
 * 죽어 있어 로그인이 막힐 때, 배포 환경변수 한 줄로 사이트를 다시 열 수 있는 탈출구.
 */
export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  return !isSupabaseConfigured();
}
