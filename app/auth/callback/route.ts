import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

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
  /* 판정은 lib/auth/safe-next.ts 한 곳에서 — 접두 문자열 검사는 탭·개행으로 뚫렸다(2026-09-07 감사).
     로그인 폼(login-form.tsx)도 같은 함수를 쓴다. 두 벌로 두면 한쪽만 고쳐 다시 벌어진다. */
  const next = safeNext(url.searchParams.get("next"), url.origin);

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
