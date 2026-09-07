import { createBrowserClient } from "@supabase/ssr";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

/**
 * 브라우저용 Supabase 클라이언트.
 * 호출 전 반드시 isSupabaseConfigured()로 설정 여부를 확인할 것 — 미설정 시 데모 모드.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    /* 서버·프록시와 **같은 속성**으로 쓴다 — 한 곳만 다르면 그쪽 갱신이 secure 를 지운다(2026-09-07 감사) */
    { cookieOptions: SESSION_COOKIE_OPTIONS },
  );
}
