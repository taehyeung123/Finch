import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { refreshLongLivedToken } from "@/lib/meta/instagram-oauth";
import { isAuthorizedCron } from "@/lib/cron";

/**
 * 토큰 자동 갱신 크론 (매일 03:00 KST, vercel.json).
 *
 * 문제: 인스타 장기토큰은 60일 만료라, 사용자가 대시보드를 방문하지 않으면 갱신 기회가 없어
 * 연동이 조용히 끊기고 자동 DM 웹훅도 함께 죽는다. 이 크론이 방문과 무관하게 갱신한다.
 *
 * 동작: 만료 15일 이내 계정을 갱신하고, 갱신 실패·만료 임박(7일 이내)이면 token_expiry
 * 알림을 넣는다(사용자별 3일 내 중복 방지, 알림 설정 존중).
 */
export const runtime = "nodejs";

const REFRESH_WINDOW_DAYS = 15;
const NOTIFY_WINDOW_DAYS = 7;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** token_expiry 알림 — 설정에서 끈 사용자·최근 3일 내 중복은 건너뛴다 */
async function notifyTokenExpiry(admin: Admin, userId: string, body: string) {
  const { data: setting } = await admin
    .from("notification_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const pref = (setting?.settings as Record<string, { inapp?: boolean }> | null)?.token_expiry;
  if (pref && pref.inapp === false) return;

  const { data: recent } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "token_expiry")
    .gte("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return;

  const { error } = await admin.from("notifications").insert({
    user_id: userId,
    type: "token_expiry",
    title: "인스타그램 연동 토큰 만료 임박",
    body,
  });
  if (error) console.error("[cron:refresh] 알림 생성 실패:", userId, error.message);
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }

  const { data: accounts, error } = await admin
    .from("connected_accounts")
    .select("id, user_id, handle, access_token_cipher, token_expires_at")
    .eq("channel", "instagram")
    .eq("connected", true)
    .not("access_token_cipher", "is", null);
  if (error) {
    console.error("[cron:refresh] 계정 조회 실패:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let refreshed = 0;
  let failed = 0;
  let notified = 0;

  for (const acc of accounts ?? []) {
    const remaining = daysUntil(acc.token_expires_at);
    if (remaining === null) continue;

    if (remaining <= 0) {
      // 이미 만료 — 갱신 불가, 재연동 안내만
      await notifyTokenExpiry(admin, acc.user_id, `${acc.handle} 연동이 만료되었어요. 설정에서 다시 연동해 주세요.`);
      notified++;
      continue;
    }
    if (remaining > REFRESH_WINDOW_DAYS) continue;

    const token = decryptToken(acc.access_token_cipher);
    if (!token) {
      // 암호화 키 불일치 등 — 복호화 불가면 재연동 외 방법 없음
      await notifyTokenExpiry(admin, acc.user_id, `${acc.handle} 연동 토큰을 확인할 수 없어요. 설정에서 다시 연동해 주세요.`);
      notified++;
      continue;
    }

    try {
      const next = await refreshLongLivedToken(token);
      const cipher = encryptToken(next.accessToken);
      if (!cipher) throw new Error("encrypt_failed");
      const { error: upErr } = await admin
        .from("connected_accounts")
        .update({
          access_token_cipher: cipher,
          token_expires_at: new Date(Date.now() + next.expiresInSeconds * 1000).toISOString(),
        })
        .eq("id", acc.id);
      if (upErr) throw new Error(upErr.message);
      refreshed++;
    } catch (e) {
      failed++;
      console.error("[cron:refresh] 갱신 실패:", acc.id, e instanceof Error ? e.message : String(e));
      if (remaining <= NOTIFY_WINDOW_DAYS) {
        await notifyTokenExpiry(
          admin,
          acc.user_id,
          `${acc.handle} 연동 토큰이 ${remaining}일 후 만료돼요. 설정에서 다시 연동해 주세요.`,
        );
        notified++;
      }
    }
  }

  return NextResponse.json({ ok: true, total: accounts?.length ?? 0, refreshed, failed, notified });
}
