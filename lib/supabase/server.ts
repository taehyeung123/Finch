import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * 서버(RSC·라우트 핸들러)용 Supabase 클라이언트.
 * - Next 16에서 cookies()는 async — 반드시 await.
 * - 인증 판단은 항상 supabase.auth.getUser() 사용 (getSession() 금지 — 쿠키 무검증 신뢰).
 * - 호출 전 isSupabaseConfigured() 확인 필수.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 호출되면 쿠키 쓰기가 불가 — proxy.ts가 세션을 갱신하므로 무시 가능
          }
        },
      },
    },
  );
}
