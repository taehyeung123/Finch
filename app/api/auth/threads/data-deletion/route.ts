import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThreadsOAuthConfig } from "@/lib/meta/threads-oauth";
import { parseSignedRequest } from "@/lib/meta/signed-request";

/**
 * Threads 데이터 삭제 요청 콜백 — 사용자가 Threads 쪽에서 "앱의 내 데이터 삭제"를 요청하면
 * Meta가 signed_request를 담아 POST로 호출한다. 응답은 Meta 스펙대로 반드시
 * { url, confirmation_code } JSON이어야 하고, url은 사용자가 삭제 상태를 확인할 수 있는
 * 공개 페이지여야 한다(로그인 불필요 — Threads 쪽에서 링크만 보여준다).
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

  const confirmationCode = randomUUID().replace(/-/g, "").slice(0, 16);

  const admin = createAdminClient();
  if (admin) {
    // 데이터 삭제 요청이므로 비활성화가 아니라 행 자체를 제거한다(토큰 포함 완전 삭제).
    const { error } = await admin
      .from("connected_accounts")
      .delete()
      .eq("channel", "threads")
      .eq("platform_user_id", payload.user_id);
    if (error) console.error("[threads-data-deletion] 삭제 반영 실패:", error.message);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return NextResponse.json({
    url: `${siteUrl}/threads/data-deletion-status?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
