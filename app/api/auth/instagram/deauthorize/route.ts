import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstagramOAuthConfig } from "@/lib/meta/instagram-oauth";
import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * Instagram 앱 제거(Deauthorize) 콜백 — 사용자가 Instagram/Meta 앱 설정에서 핀치 연동을 해제하면
 * Meta가 signed_request를 담아 POST로 호출한다(사용자가 핀치 화면에서 해제한 게 아니라
 * 인스타그램 쪽에서 먼저 끊은 경우).
 *
 * 없으면 무슨 일이 나나: 우리 DB는 계속 "연동됨"으로 남는다. 죽은 토큰으로 지표 조회가
 * 매 요청 실패하고, 예약 발행 크론은 매일 새벽 실패 알림을 보내며, 토큰 갱신 크론도 계속
 * 재시도한다. 사용자는 이미 인스타 쪽에서 끊었으므로 우리 화면의 안내를 볼 이유가 없다.
 * Threads엔 이 라우트가 있는데 Instagram만 없어서 2026-08-31에 추가했다.
 *
 * 데이터 삭제(data-deletion)와는 다르다 — 그쪽은 행을 통째로 지우고 확인 URL을 돌려주지만,
 * 이건 "연동만 끊긴" 상태라 행은 남기고 토큰만 버린다(같은 사용자가 다시 연동할 수 있게).
 * 실 스펙: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getInstagramOAuthConfig();
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
      .eq("channel", "instagram")
      .eq("platform_user_id", payload.user_id);
    if (error) console.error("[instagram-deauthorize] 연동 해제 반영 실패:", error.message);
  }

  return NextResponse.json({ ok: true });
}
