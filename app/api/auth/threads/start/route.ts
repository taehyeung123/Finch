import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { getConsentStatus } from "@/lib/legal/consent";
import {
  buildThreadsAuthorizeUrl,
  getThreadsOAuthConfig,
  resolveThreadsCallbackUri,
} from "@/lib/meta/threads-oauth";

/**
 * Threads 연동 시작 — 로그인 사용자 확인 후 Threads 인가 화면으로 리다이렉트.
 * app/api/auth/instagram/start/route.ts와 동일 구조(CSRF state 쿠키).
 * 실 스펙: docs/REAL_API_SPEC.md 5절.
 */
export const runtime = "nodejs";

const STATE_COOKIE = "th_oauth_state";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  /* 연동은 로그인 사용자에 귀속된다 — 세션 없으면 로그인으로.
     ⚠️ isDemoMode 도 막는다. 데모가 켜져 있으면 lib/data/live.ts 가 통째로 목데이터를 쓰므로
     (loadAccountRow 첫 줄이 isDemoMode 면 null), 연동에 **성공해도 그 계정이 화면에 영영 안 나온다.**
     예전엔 여기서 isSupabaseConfigured 만 봐서, 데모를 못 끈 상태로 진짜 인가를 통과하고
     토큰까지 저장한 뒤 «연동 완료» 배너를 보는데 카드는 계속 목 계정인 상황이 만들어졌다.
     NEXT_PUBLIC_ 변수는 빌드 시점에 박히므로 «껐는데 왜 그대로냐»는 재배포 문제이기도 하다. */
  if (!isSupabaseConfigured() || isDemoMode()) {
    return NextResponse.redirect(`${origin}/settings?connect=error&reason=demo_mode`);
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  /* 동의 게이트 — 채널 연동은 이 제품에서 개인정보 수집의 본체다. 페이지 게이트만으로는
     이 라우트를 직접 열면(주소 입력·/login?next=/api/... 트릭) 동의 없이 수집이 시작된다
     (2026-09-02 감사 적발). unknown(0079 미적용·장애)은 페이지 게이트와 같은 이유로 통과. */
  if ((await getConsentStatus(user.id)) === "missing") {
    return NextResponse.redirect(`${origin}/onboarding/consent`);
  }

  const config = getThreadsOAuthConfig();
  if (!config) {
    // 앱 자격증명 미설정 — 심사/키 발급 전 단계
    return NextResponse.redirect(`${origin}/settings?connect=unconfigured`);
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10분
  });

  const authorizeUrl = buildThreadsAuthorizeUrl({
    appId: config.appId,
    redirectUri: resolveThreadsCallbackUri(request),
    state,
  });
  return NextResponse.redirect(authorizeUrl);
}
