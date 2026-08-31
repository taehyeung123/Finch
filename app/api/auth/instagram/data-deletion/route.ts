import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstagramOAuthConfig } from "@/lib/meta/instagram-oauth";
import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * Instagram 데이터 삭제 요청 콜백 — 사용자가 Instagram/Meta 쪽에서 "앱의 내 데이터 삭제"를
 * 요청하면 Meta가 signed_request를 담아 POST로 호출한다. 응답은 Meta 스펙대로 반드시
 * { url, confirmation_code } JSON이어야 하고, url은 사용자가 삭제 상태를 확인할 수 있는
 * 공개 페이지여야 한다(로그인 불필요). app/api/auth/threads/data-deletion과 동일 구조.
 * 실 스펙: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
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

  const confirmationCode = randomUUID().replace(/-/g, "").slice(0, 16);

  const admin = createAdminClient();
  if (admin) {
    // 데이터 삭제 요청이므로 비활성화가 아니라 행 자체를 제거한다(토큰 포함 완전 삭제).
    const { data: removed, error } = await admin
      .from("connected_accounts")
      .delete()
      .eq("channel", "instagram")
      .eq("platform_user_id", payload.user_id)
      .select("id");
    if (error) console.error("[instagram-data-deletion] 삭제 반영 실패:", error.message);

    /* 확인 코드를 기록한다 — 안 남기면 상태 페이지가 조회할 것이 없어
       아무 코드에나 «삭제 완료» 를 확언하게 된다(0076).
       식별자는 원문 대신 해시로 — 삭제 이력에 지운 값을 그대로 두면 앞뒤가 안 맞는다.
       기록 실패가 삭제를 되돌리지는 않는다(삭제는 이미 끝났다) — 로그만 남긴다. */
    const { error: logErr } = await admin.from("data_deletion_requests").insert({
      confirmation_code: confirmationCode,
      channel: "instagram",
      platform_user_hash: createHash("sha256").update(payload.user_id).digest("hex").slice(0, 32),
      deleted_rows: removed?.length ?? 0,
    });
    if (logErr) console.error("[instagram-data-deletion] 요청 기록 실패(0076 미적용 가능):", logErr.message);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return NextResponse.json({
    url: `${siteUrl}/instagram/data-deletion-status?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
