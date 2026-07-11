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
  const next =
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.includes("\\")
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
