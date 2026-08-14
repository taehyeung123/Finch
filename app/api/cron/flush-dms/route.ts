import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { sendPrivateReply, replyToComment } from "@/lib/meta/graph";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import { parseButtons, parseReplies } from "@/lib/auto-dm/db";
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
  // buttons(0038)는 미적용 DB 폴백 — 실패 시 legacy 컬럼만으로 재조회.
  // 조회 "오류"를 빈 배열로 삼키면 안 된다 — 아래 루프가 rule 미스를 '규칙 삭제됨'으로
  // 해석해 보류 DM을 영구 종결(failed_permission)하므로, 오류면 이번 실행을 중단하고
  // 다음 크론이 재시도하게 한다 (댓글당 Private Reply 1회 기회 보호, 리뷰 확정 결함 수리).
  const RULE_SELECT_BASE = "id, status, is_advertising, dm_message, public_reply, button_label, button_url";
  interface FlushRule {
    id: string;
    status: string;
    is_advertising: boolean;
    dm_message: string;
    public_reply: string | null;
    public_replies?: unknown;
    button_label: string | null;
    button_url: string | null;
    buttons?: unknown;
  }
  const loadRules = async (): Promise<{ rules: FlushRule[]; error: string | null }> => {
    const first = await admin
      .from("auto_dm_rules")
      .select(`${RULE_SELECT_BASE}, buttons, public_replies`)
      .in("id", ruleIds);
    if (first.error && /buttons|public_replies/i.test(first.error.message)) {
      const fallback = await admin.from("auto_dm_rules").select(RULE_SELECT_BASE).in("id", ruleIds);
      return {
        rules: (fallback.data ?? []) as unknown as FlushRule[],
        error: fallback.error?.message ?? null,
      };
    }
    return { rules: (first.data ?? []) as unknown as FlushRule[], error: first.error?.message ?? null };
  };
  const [{ rules, error: rulesLoadErr }, { data: accounts }] = await Promise.all([
    loadRules(),
    admin
      .from("connected_accounts")
      .select("user_id, platform_user_id, access_token_cipher")
      .eq("channel", "instagram")
      .eq("connected", true)
      .in("user_id", userIds),
  ]);
  if (rulesLoadErr) {
    console.error("[cron:flush] 규칙 조회 실패 — 실행 중단(다음 크론 재시도):", rulesLoadErr);
    return NextResponse.json({ ok: false, error: rulesLoadErr }, { status: 500 });
  }
  const ruleById = new Map(rules.map((r) => [r.id, r]));
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
      buttons: parseButtons(rule),
      accessToken: token,
    });

    if (outcome.ok) {
      await finalize(admin, s.id, "sent", outcome.igMessageId, null);
      sent++;
      // 준비된 답글 중 랜덤 1개 — 같은 문구 반복 도배로 인한 스팸 신호를 피한다 (0042)
      const replies = parseReplies(rule);
      if (replies.length > 0) {
        const reply = replies[Math.floor(Math.random() * replies.length)];
        await replyToComment({ commentId: s.ig_comment_id, message: reply, accessToken: token }).catch(() => {});
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
