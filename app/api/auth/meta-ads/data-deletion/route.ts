import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMetaAdsOAuthConfig } from "@/lib/meta/ads-oauth";
import { parseSignedRequest } from "@/lib/meta/signed-request";
import { recordDeletionRequest } from "@/lib/legal/deletion-log";

/**
 * 메타 광고 데이터 삭제 요청 콜백. 응답은 Meta 스펙대로 { url, confirmation_code } JSON.
 * url 은 로그인 없이 열리는 상태 확인 페이지여야 한다(심사관이 실제로 연다).
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

  const confirmationCode = randomUUID().replace(/-/g, "").slice(0, 16);

  const admin = createAdminClient();
  if (admin) {
    /* 삭제 요청이므로 행 자체를 지운다(토큰 포함 완전 삭제).
       meta_ad_accounts 는 connection_id 외래키의 on delete cascade 로 함께 사라진다. */
    const { data: removed, error } = await admin
      .from("meta_ad_connections")
      .delete()
      .eq("fb_user_id", payload.user_id)
      .select("id");
    if (error) console.error("[meta-ads-data-deletion] 삭제 반영 실패:", error.message);

    /* 확인 코드를 남기지 않으면 상태 페이지가 조회할 것이 없어 아무 코드에나 «완료»를 확언하게 된다(0076).
       식별자는 해시로 — 삭제 이력에 지운 값을 그대로 두면 앞뒤가 안 맞는다.
       ⚠️ 삭제가 **실패했으면 그렇게 적는다.** 예전엔 실패해도 deleted_rows=0 이 들어갔고,
       0 의 뜻은 «지울 것이 없었다» 라서 공개 상태 페이지가 「저장된 정보가 없었습니다」 라고
       확언했다 — 토큰이 그대로 남아 있는데도. 실패는 «없음»이 아니다. */
    await recordDeletionRequest(admin, {
      confirmationCode,
      channel: "meta_ads",
      platformUserId: payload.user_id,
      deletedRows: removed?.length ?? 0,
      failed: Boolean(error),
    });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return NextResponse.json({
    url: `${siteUrl}/meta-ads/data-deletion-status?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
