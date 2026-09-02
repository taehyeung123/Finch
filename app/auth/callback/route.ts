import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth 콜백 — Supabase가 발급한 code를 세션으로 교환한다.
 * next 파라미터는 same-origin 검증("/"로 시작 + "//" 금지) 후에만 사용 (오픈 리다이렉트 방지).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  /* /api 는 목적지로 받지 않는다 — 로그인이 화면 없이 API 라우트로 직행하면
     동의 게이트(페이지 렌더)가 한 번도 안 걸린 채 연동·수집이 시작될 수 있다
     (/login?next=/api/auth/instagram/start 트릭, 2026-09-02 감사 적발).
     정상 흐름에서 로그인 목적지가 API 라우트인 경우는 없다. */
  const next =
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.includes("\\") &&
    !nextParam.startsWith("/api")
      ? nextParam
      : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
