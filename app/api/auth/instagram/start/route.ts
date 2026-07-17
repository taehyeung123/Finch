import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  buildAuthorizeUrl,
  getInstagramOAuthConfig,
  resolveCallbackUri,
} from "@/lib/meta/instagram-oauth";

/**
 * 인스타그램 연동 시작 — 로그인 사용자 확인 후 Instagram Login 인가 화면으로 리다이렉트.
 * CSRF 방지: state를 httpOnly 쿠키에 저장하고 콜백에서 대조한다.
 * 실 스펙: docs/REAL_API_SPEC.md 1절.
 */
export const runtime = "nodejs";

const STATE_COOKIE = "ig_oauth_state";

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

  const config = getInstagramOAuthConfig();
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

  const authorizeUrl = buildAuthorizeUrl({
    appId: config.appId,
    redirectUri: resolveCallbackUri(request),
    state,
  });
  return NextResponse.redirect(authorizeUrl);
}
