import { createBrowserClient } from "@supabase/ssr";

/**
 * 브라우저용 Supabase 클라이언트.
 * 호출 전 반드시 isSupabaseConfigured()로 설정 여부를 확인할 것 — 미설정 시 데모 모드.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
