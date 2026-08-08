import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * 서버(RSC·라우트 핸들러)용 Supabase 클라이언트.
 * - Next 16에서 cookies()는 async — 반드시 await.
 * - 인증 판단은 항상 supabase.auth.getUser() 사용 (getSession() 금지 — 쿠키 무검증 신뢰).
 * - 호출 전 isSupabaseConfigured() 확인 필수.
 * - 렌더 경로(레이아웃·페이지·페이지가 부르는 조회 함수)에서는 아래 getAuthUser()를 쓸 것 —
 *   같은 요청 안에서 Auth 서버 왕복을 1회로 메모이즈한다(cache()는 요청 단위라 사용자 간 누수 없음).
 *   getUser() 직접 호출은 라우트 핸들러·인증 콜백처럼 요청 중간에 세션이 바뀌는 곳에만 남긴다.
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

/**
 * 요청당 1회만 Auth 서버를 왕복하는 사용자 조회 — 렌더 경로 전용.
 * 페이지 하나가 레이아웃 가드 + 상단바 + 데이터 조회 함수들에서 getUser()를 3~5번
 * 반복 호출하던 것을 요청 단위로 합친다(실측: 내비게이션 지연의 주범).
 * 인증 실패·미설정 시 null — 판단 규칙(getUser 기반, getSession 금지)은 그대로다.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
