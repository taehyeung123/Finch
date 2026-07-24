import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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

  // 연동은 로그인 사용자에 귀속된다 — 세션 없으면 로그인으로
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/settings?connect=unconfigured`);
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
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
