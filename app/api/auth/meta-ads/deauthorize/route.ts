import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMetaAdsOAuthConfig } from "@/lib/meta/ads-oauth";
import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * 메타 광고 앱 제거(Deauthorize) 콜백 — 사용자가 페이스북 «비즈니스 통합» 설정에서
 * 핀치 연동을 끊으면 Meta 가 signed_request 를 담아 POST 한다.
 * 토큰을 즉시 지워 만료된 토큰으로 계속 호출하는 것을 막는다.
 *
 * signed_request 는 **Facebook 앱 시크릿**으로 서명된다 — 인스타 제품 시크릿이 아니다.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getMetaAdsOAuthConfig();
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
    /* 연동만 끊고 광고 계정 행은 남긴다 — 재연동하면 기본 계정 선택이 그대로 살아난다.
       토큰은 반드시 지운다(연동 해제인데 자격증명이 남아 있으면 안 된다). */
    const { error } = await admin
      .from("meta_ad_connections")
      .update({ connected: false, access_token_cipher: null })
      .eq("fb_user_id", payload.user_id);
    if (error) console.error("[meta-ads-deauthorize] 연동 해제 반영 실패:", error.message);
  }

  return NextResponse.json({ ok: true });
}
