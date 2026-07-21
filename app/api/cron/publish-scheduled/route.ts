import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { publishCardNews } from "@/lib/meta/instagram-publish";
import { notifyUser } from "@/lib/notify";
import { isAuthorizedCron } from "@/lib/cron";

/**
 * 예약 발행 크론 (매일 06:00 KST, vercel.json).
 * Vercel Hobby 크론은 하루 1회 빈도 제한이라 '예약일의 아침 배치' 단위로 처리한다
 * (분 단위 정시 발행 아님 — UI에도 이렇게 고지한다).
 * 발행 성공/실패는 studio 알림 유형으로 통지한다.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }

  const { data: due, error } = await admin
    .from("scheduled_posts")
    .select("id, user_id, caption, image_urls, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(50);
  if (error) {
    console.error("[cron:publish] 조회 실패:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let published = 0;
  let failed = 0;

  for (const post of due ?? []) {
    // publishing으로 먼저 점유 — 동시 실행/재시도 시 중복 발행 방지
    const { data: claimed } = await admin
      .from("scheduled_posts")
      .update({ status: "publishing" })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const fail = async (reason: string) => {
      await admin.from("scheduled_posts").update({ status: "failed", error: reason }).eq("id", post.id);
      await notifyUser(admin, {
        userId: post.user_id,
        type: "studio",
        title: "예약 발행에 실패했어요",
        body: `예약한 카드뉴스 발행이 실패했어요 (${reason}). 스튜디오에서 다시 예약해 주세요.`,
      });
      failed++;
    };

    const { data: account } = await admin
      .from("connected_accounts")
      .select("platform_user_id, access_token_cipher")
      .eq("user_id", post.user_id)
      .eq("channel", "instagram")
      .eq("connected", true)
      .maybeSingle();
    const token = decryptToken(account?.access_token_cipher ?? null);
    if (!account?.platform_user_id || !token) {
      await fail("인스타그램 연동이 끊겼어요");
      continue;
    }

    const result = await publishCardNews({
      igUserId: account.platform_user_id,
      accessToken: token,
      caption: post.caption,
      imageUrls: post.image_urls,
    });

    if (!result.ok) {
      console.error("[cron:publish] 발행 실패:", post.id, result.error);
      await fail(result.error);
      continue;
    }

    await admin.from("scheduled_posts").update({ status: "published", ig_media_id: result.mediaId }).eq("id", post.id);
    await notifyUser(admin, {
      userId: post.user_id,
      type: "studio",
      title: "예약한 카드뉴스가 발행됐어요",
      body: "인스타그램에 카드뉴스가 정상적으로 게시되었어요.",
    });
    published++;
  }

  return NextResponse.json({ ok: true, total: due?.length ?? 0, published, failed });
}
