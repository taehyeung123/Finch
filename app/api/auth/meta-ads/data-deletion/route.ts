import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMetaAdsOAuthConfig } from "@/lib/meta/ads-oauth";
import { parseSignedRequest } from "@/lib/meta/signed-request";

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
       식별자는 해시로 — 삭제 이력에 지운 값을 그대로 두면 앞뒤가 안 맞는다. */
    const { error: logErr } = await admin.from("data_deletion_requests").insert({
      confirmation_code: confirmationCode,
      channel: "meta_ads",
      platform_user_hash: createHash("sha256").update(payload.user_id).digest("hex").slice(0, 32),
      deleted_rows: removed?.length ?? 0,
    });
    if (logErr) console.error("[meta-ads-data-deletion] 요청 기록 실패(0077 미적용 가능):", logErr.message);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return NextResponse.json({
    url: `${siteUrl}/meta-ads/data-deletion-status?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
