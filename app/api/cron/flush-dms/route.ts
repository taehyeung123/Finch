import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { sendPrivateReply, replyToComment } from "@/lib/meta/graph";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import { isNightInKST } from "@/lib/auto-dm/match";
import { isAuthorizedCron } from "@/lib/cron";

/**
 * 보류 DM 재처리 크론 (매일 08:10 KST — 야간 보류 해제 직후, vercel.json).
 *
 * 대상: held_night(광고 야간 보류)·pending(토큰 미확보/일시 오류) 상태의 dm_sends.
 * Private Reply는 댓글 후 7일 이내 1회만 가능하므로:
 *  - 6.5일 이내 행만 재발송 시도 (여유 반나절)
 *  - 그보다 오래된 행은 failed_window_expired로 종결(한도 반납은 finalize가 처리)
 * 규칙이 비활성화됐으면 발송하지 않고 종결한다.
 */
export const runtime = "nodejs";

const BATCH = 100;
const WINDOW_MS = 6.5 * 86_400_000;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function finalize(admin: Admin, sendId: string, status: string, igMessageId: string | null, errorMsg: string | null) {
  const { error } = await admin.rpc("finalize_dm_send", {
    p_send_id: sendId,
    p_status: status,
    p_ig_message_id: igMessageId,
    p_error: errorMsg,
  });
  if (error) console.error("[cron:flush] 결과 확정 실패:", sendId, status, error.message);
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }
  if (isNightInKST()) {
    // 광고성 DM 발송 금지 시간대(21~08 KST) — 다음 실행에서 처리
    return NextResponse.json({ ok: true, skipped: "night_window" });
  }

  const { data: sends, error } = await admin
    .from("dm_sends")
    .select("id, rule_id, user_id, ig_comment_id, status, created_at")
    .in("status", ["held_night", "pending"])
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("[cron:flush] 대상 조회 실패:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!sends || sends.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // 규칙·계정(토큰)을 사용자 단위로 한 번에 로드
  const ruleIds = [...new Set(sends.map((s) => s.rule_id))];
  const userIds = [...new Set(sends.map((s) => s.user_id))];
  const [{ data: rules }, { data: accounts }] = await Promise.all([
    admin
      .from("auto_dm_rules")
      .select("id, status, is_advertising, dm_message, public_reply, button_label, button_url")
      .in("id", ruleIds),
    admin
      .from("connected_accounts")
      .select("user_id, platform_user_id, access_token_cipher")
      .eq("channel", "instagram")
      .eq("connected", true)
      .in("user_id", userIds),
  ]);
  const ruleById = new Map((rules ?? []).map((r) => [r.id, r]));
  const accountByUser = new Map((accounts ?? []).map((a) => [a.user_id, a]));

  let sent = 0;
  let expired = 0;
  let skipped = 0;
  let failedCount = 0;

  for (const s of sends) {
    // 7일 창 초과 — 재시도 불가, 종결
    if (Date.now() - new Date(s.created_at).getTime() > WINDOW_MS) {
      await finalize(admin, s.id, "failed_window_expired", null, "flush_expired");
      expired++;
      continue;
    }

    const rule = ruleById.get(s.rule_id);
    if (!rule || rule.status !== "active") {
      // 규칙 삭제/비활성 — 발송하지 않고 종결 (한도 반납)
      await finalize(admin, s.id, "failed_permission", null, "rule_inactive");
      failedCount++;
      continue;
    }

    const account = accountByUser.get(s.user_id);
    const token = decryptToken(account?.access_token_cipher ?? null) ?? process.env.IG_TEST_ACCESS_TOKEN ?? null;
    if (!account?.platform_user_id || !token) {
      // 토큰 여전히 없음 — pending 유지 (7일 창 내 다음 실행에서 재시도)
      skipped++;
      continue;
    }

    const message = applyAdDisclosure(rule.dm_message, rule.is_advertising);
    const outcome = await sendPrivateReply({
      igUserId: account.platform_user_id,
      commentId: s.ig_comment_id,
      message,
      buttonLabel: rule.button_label,
      buttonUrl: rule.button_url,
      accessToken: token,
    });

    if (outcome.ok) {
      await finalize(admin, s.id, "sent", outcome.igMessageId, null);
      sent++;
      if (rule.public_reply) {
        await replyToComment({ commentId: s.ig_comment_id, message: rule.public_reply, accessToken: token }).catch(() => {});
      }
    } else if (outcome.retryable) {
      // 일시 오류 — pending 유지 후 다음 실행에서 재시도
      await finalize(admin, s.id, "pending", null, outcome.error);
      skipped++;
    } else {
      await finalize(admin, s.id, outcome.status, null, outcome.error);
      failedCount++;
    }
  }

  return NextResponse.json({ ok: true, processed: sends.length, sent, expired, skipped, failed: failedCount });
}
