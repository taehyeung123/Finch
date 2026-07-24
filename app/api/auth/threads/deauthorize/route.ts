import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThreadsOAuthConfig } from "@/lib/meta/threads-oauth";
import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * Threads 앱 제거(Deauthorize) 콜백 — 사용자가 Threads 앱 설정에서 핀치 연동을 해제하면
 * Meta가 signed_request를 담아 POST로 호출한다(사용자가 핀치 화면에서 해제한 게 아니라
 * Threads 쪽에서 먼저 끊은 경우). 우리 쪽 connected_accounts도 즉시 미연동으로 반영해야
 * 만료된 토큰으로 계속 API를 호출하는 걸 막는다.
 * 실 스펙: https://developers.facebook.com/docs/development/create-an-app/threads-use-case/
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getThreadsOAuthConfig();
  if (!config) return new NextResponse("not_configured", { status: 503 });

  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") {
    return new NextResponse("bad_request", { status: 400 });
  }

  const payload = parseSignedRequest(signedRequest, config.appSecret);
  if (!payload?.user_id) {
    return new NextResponse("invalid_signature", { status: 400 });
  }

  const admin = createAdminClient();
  if (admin) {
    const { error } = await admin
      .from("connected_accounts")
      .update({ connected: false, access_token_cipher: null, refresh_token_cipher: null })
      .eq("channel", "threads")
      .eq("platform_user_id", payload.user_id);
    if (error) console.error("[threads-deauthorize] 연동 해제 반영 실패:", error.message);
  }

  return NextResponse.json({ ok: true });
}
