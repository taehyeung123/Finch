import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { getConsentStatus } from "@/lib/legal/consent";
import {
  buildAdsAuthorizeUrl,
  getMetaAdsOAuthConfig,
  resolveAdsCallbackUri,
} from "@/lib/meta/ads-oauth";

/**
 * 메타 광고 연동 시작 — Facebook Login 인가 화면으로 리다이렉트.
 * 인스타 start 와 같은 규칙: 로그인 확인 → 데모 차단 → state 쿠키 → 인가 URL.
 */
export const runtime = "nodejs";

const STATE_COOKIE = "meta_ads_oauth_state";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  /* 데모 모드에서도 막는다 — 켜져 있으면 화면이 목데이터를 그리므로
     연동에 성공해도 그 계정이 영영 안 나온다(인스타에서 실제로 겪은 함정). */
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

  const config = getMetaAdsOAuthConfig();
  if (!config) {
    return NextResponse.redirect(`${origin}/settings?connect=unconfigured`);
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(
    buildAdsAuthorizeUrl({
      appId: config.appId,
      redirectUri: resolveAdsCallbackUri(request),
      state,
    }),
  );
}
