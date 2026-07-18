import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { fetchAccountInfo, refreshLongLivedToken } from "@/lib/meta/instagram-oauth";
import { isAuthorizedCron } from "@/lib/cron";

/**
 * 토큰 자동 갱신 + 계정 스냅샷 크론 (매일 03:00 KST, vercel.json).
 *
 * 1) 토큰 갱신: 인스타 장기토큰은 60일 만료라, 사용자가 대시보드를 방문하지 않으면 갱신 기회가
 *    없어 연동이 조용히 끊기고 자동 DM 웹훅도 함께 죽는다. 만료 15일 이내면 갱신하고,
 *    갱신 실패·만료 임박(7일 이내)이면 token_expiry 알림을 넣는다(3일 중복 방지, 설정 존중).
 * 2) 팔로워 급변 감지: 매일 계정 정보를 새로 받아 전일 저장값과 비교, 급증/급감이면
 *    account_spike/account_drop 알림을 넣는다(24시간 중복 방지, 설정 'account' 키 존중).
 */
export const runtime = "nodejs";

const REFRESH_WINDOW_DAYS = 15;
const NOTIFY_WINDOW_DAYS = 7;
// 급변 기준: 최소 30명 이상이면서 전일 대비 3% 이상 변화 (소규모 계정 노이즈 방지)
const SPIKE_MIN_ABS = 30;
const SPIKE_MIN_PCT = 0.03;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * 알림 생성 공통 — 설정에서 해당 유형을 끈 사용자·중복 창 내 재발송은 건너뛴다.
 * settingKey: notification_settings.settings의 키 (token_expiry / account 등)
 */
async function notifyOnce(
  admin: Admin,
  params: {
    userId: string;
    type: string;
    settingKey: string;
    dedupeMs: number;
    title: string;
    body: string;
  },
) {
  const { data: setting } = await admin
    .from("notification_settings")
    .select("settings")
    .eq("user_id", params.userId)
    .maybeSingle();
  const pref = (setting?.settings as Record<string, { inapp?: boolean }> | null)?.[params.settingKey];
  if (pref && pref.inapp === false) return false;

  const { data: recent } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", params.userId)
    .eq("type", params.type)
    .gte("created_at", new Date(Date.now() - params.dedupeMs).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return false;

  const { error } = await admin.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
  });
  if (error) {
    console.error("[cron:refresh] 알림 생성 실패:", params.userId, error.message);
    return false;
  }
  return true;
}

async function notifyTokenExpiry(admin: Admin, userId: string, body: string) {
  await notifyOnce(admin, {
    userId,
    type: "token_expiry",
    settingKey: "token_expiry",
    dedupeMs: 3 * 86_400_000,
    title: "인스타그램 연동 토큰 만료 임박",
    body,
  });
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
    .select("id, user_id, handle, followers, access_token_cipher, token_expires_at")
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
  let spikes = 0;

  for (const acc of accounts ?? []) {
    const remaining = daysUntil(acc.token_expires_at);
    if (remaining === null) continue;

    if (remaining <= 0) {
      // 이미 만료 — 갱신 불가, 재연동 안내만
      await notifyTokenExpiry(admin, acc.user_id, `${acc.handle} 연동이 만료되었어요. 설정에서 다시 연동해 주세요.`);
      notified++;
      continue;
    }

    let token = decryptToken(acc.access_token_cipher);
    if (!token) {
      // 암호화 키 불일치 등 — 복호화 불가면 재연동 외 방법 없음
      await notifyTokenExpiry(admin, acc.user_id, `${acc.handle} 연동 토큰을 확인할 수 없어요. 설정에서 다시 연동해 주세요.`);
      notified++;
      continue;
    }

    // 1) 만료 임박 시 토큰 갱신
    if (remaining <= REFRESH_WINDOW_DAYS) {
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
        token = next.accessToken;
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

    // 2) 일일 계정 스냅샷 — 팔로워 급변 감지 + followers 최신화
    try {
      const info = await fetchAccountInfo(token);
      const prev = acc.followers ?? 0;
      const delta = info.followersCount - prev;
      if (prev > 0 && Math.abs(delta) >= Math.max(SPIKE_MIN_ABS, Math.round(prev * SPIKE_MIN_PCT))) {
        const up = delta > 0;
        const sent = await notifyOnce(admin, {
          userId: acc.user_id,
          type: up ? "account_spike" : "account_drop",
          settingKey: "account",
          dedupeMs: 86_400_000,
          title: up ? "팔로워가 크게 늘고 있어요" : "팔로워가 크게 줄었어요",
          body: `${acc.handle} 팔로워가 하루 사이 ${up ? "+" : ""}${delta.toLocaleString("ko-KR")}명 변동했어요 (현재 ${info.followersCount.toLocaleString("ko-KR")}명).`,
        });
        if (sent) spikes++;
      }
      await admin
        .from("connected_accounts")
        .update({ followers: info.followersCount, posts: info.mediaCount })
        .eq("id", acc.id);
    } catch (e) {
      // 스냅샷 실패는 치명적이지 않다 — 다음 실행에서 재시도
      console.warn("[cron:refresh] 계정 스냅샷 실패:", acc.id, e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true, total: accounts?.length ?? 0, refreshed, failed, notified, spikes });
}
