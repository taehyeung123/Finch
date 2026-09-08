import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { fetchAccountInfo, refreshLongLivedToken } from "@/lib/meta/instagram-oauth";
import { refreshThreadsLongLivedToken } from "@/lib/meta/threads-oauth";
import { fetchThreadsFollowersCount } from "@/lib/meta/threads";
import { getTiktokOAuthConfig, refreshTiktokToken } from "@/lib/tiktok/oauth";
import { fetchTiktokUserInfo } from "@/lib/tiktok/api";
import { chargeBilling } from "@/lib/toss/billing";
import { PLAN_NAMES, PLAN_PRICES, isPaidPlan, type PaidPlan } from "@/lib/toss/config";
import { isAuthorizedCron } from "@/lib/cron";
import { notifyUser } from "@/lib/notify";
import { grantPlanCredits } from "@/lib/actions/credits";

/**
 * 토큰 자동 갱신 + 계정 스냅샷 크론 (매일 03:00 KST, vercel.json).
 *
 * 1) 토큰 갱신: 인스타·Threads 장기토큰은 60일 만료라, 사용자가 대시보드를 방문하지 않으면 갱신
 *    기회가 없어 연동이 조용히 끊기고(인스타는 자동 DM 웹훅도 함께) 죽는다. 만료 15일 이내면 갱신하고,
 *    갱신 실패·만료 임박(7일 이내)이면 token_expiry 알림을 넣는다(3일 중복 방지, 설정 존중).
 *    TikTok은 모델 자체가 다르다 — access_token이 24시간짜리라 사실상 매일 갱신 대상이고,
 *    IG/Threads처럼 "자기 자신을 갱신"하는 게 아니라 별도 refresh_token(365일)으로 갱신한다
 *    (lib/tiktok/oauth.ts, docs/REAL_API_SPEC.md 6절). 대시보드를 방문하지 않는 사용자도 이 크론이
 *    매일 돌아야 TikTok 연동이 24시간 뒤 조용히 끊기지 않는다.
 * 2) 팔로워 급변 감지: 매일 계정 정보를 새로 받아 전일 저장값과 비교, 급증/급감이면
 *    account_spike/account_drop 알림을 넣는다(24시간 중복 방지, 설정 'account' 키 존중).
 *    Threads는 팔로워 수만 갱신(총 게시물 수를 알려주는 공식 필드가 없다 — docs/REAL_API_SPEC.md 5절).
 *    TikTok은 video_count가 공식 필드로 확인돼 followers·posts 둘 다 갱신한다.
 * 3) 정기결제 청구·해지·사전고지 — processSubscriptions().
 * 알림은 전부 lib/notify.notifyUser로 생성해 인앱 설정·이메일 발송을 일관되게 처리한다.
 */
export const runtime = "nodejs";
/* 연동 계정 수만큼 외부 API 를 순차로 부르고 그다음 정기결제를 돌린다 — 선언이 없으면 플랫폼 기본값에
   걸려 함수가 도중에 강제 종료된다(publish-scheduled 가 같은 이유로 못 박아 둔 값). Pro 상한은 300. */
export const maxDuration = 300;

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
type Channel = "instagram" | "threads" | "tiktok";

interface TokenRow {
  id: string;
  user_id: string;
  channel: string;
  handle: string;
  followers: number | null;
  platform_user_id: string | null;
  access_token_cipher: string | null;
  /** 0011 마이그레이션 미적용 DB에서는 폴백 조회로 항상 null이 채워진다 — TikTok 전용 */
  refresh_token_cipher?: string | null;
  token_expires_at: string | null;
}

const CHANNEL_LABEL: Record<Channel, string> = { instagram: "인스타그램", threads: "Threads", tiktok: "TikTok" };

async function notifyTokenExpiry(admin: Admin, userId: string, channel: Channel, body: string) {
  await notifyUser(admin, {
    userId,
    type: "token_expiry",
    dedupeMs: 3 * 86_400_000,
    title: `${CHANNEL_LABEL[channel]} 연동 토큰 만료 임박`,
    body,
  });
}

/** IG/Threads 전용 장기토큰 리프레시 — "자기 자신을 갱신"하는 동일 시그니처로 통일.
 *  TikTok은 refresh_token이 별도라 이 함수를 쓸 수 없고 GET 핸들러 안에서 직접 분기한다. */
function refreshTokenForChannel(channel: "instagram" | "threads", token: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  return channel === "threads" ? refreshThreadsLongLivedToken(token) : refreshLongLivedToken(token);
}

/**
 * 정기결제 청구 처리 (뷰스코프 검증 패턴 이식 — Toss는 스케줄링 미제공이라 직접 구현).
 * - 결제 예정일 도래(active/past_due) 구독을 청구. orderId는 주기+재시도 결정적 생성 →
 *   Toss Idempotency-Key로 이중 청구 방지 (재시도 카운트는 '청구 실패'에만 증가하므로,
 *   청구 성공 후 DB 반영 실패 시 같은 키로 안전 재실행된다).
 * - 3회 연속 실패 → 해지 + free 강등 + 알림. 해지 구독은 기간 종료일에 만료 처리.
 * - 갱신 3일 전 사전 고지 (전자상거래법 갱신 고지 — 인앱 + 설정 시 이메일).
 */
async function processSubscriptions(admin: Admin) {
  const nowIso = new Date().toISOString();
  let chargedCount = 0;
  let failedCount = 0;
  let expiredCount = 0;

  // 1) 결제 예정일 도래 청구
  // pending_plan: 0013_plan_change.sql. 스키마 캐시가 아직 반영 전이라 컬럼 조회가 실패하면
  // (미적용 DB) 이 컬럼 없이 폴백 조회한다 — 그래야 기존 정기결제가 조용히 전부 건너뛰어지지 않는다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin 클라이언트는 Database 제네릭 미지정(any) 기준
  let due: any[] | null = null;
  {
    const { data, error } = await admin
      .from("subscriptions")
      .select("id, user_id, plan, pending_plan, toss_customer_key, billing_key_cipher, next_billing_at, billing_retry_count")
      .in("status", ["active", "past_due"])
      .lte("next_billing_at", nowIso)
      .limit(100);
    if (error && /pending_plan/i.test(error.message)) {
      const fallback = await admin
        .from("subscriptions")
        .select("id, user_id, plan, toss_customer_key, billing_key_cipher, next_billing_at, billing_retry_count")
        .in("status", ["active", "past_due"])
        .lte("next_billing_at", nowIso)
        .limit(100);
      due = (fallback.data ?? []).map((r) => ({ ...r, pending_plan: null }));
    } else {
      due = data;
    }
  }

  for (const sub of due ?? []) {
    const subPlan = sub.plan;
    if (!isPaidPlan(subPlan)) continue;
    // 다운그레이드 예약(pending_plan)이 있으면 이번 청구부터 그 플랜 금액을 적용한다
    // (app/(app)/settings/billing/actions.ts의 changePlan에서 즉시 청구 없이 여기만 예약해 둔 값).
    const subPendingPlan = sub.pending_plan;
    const billedPlan: PaidPlan = isPaidPlan(subPendingPlan) ? subPendingPlan : subPlan;
    const amount = PLAN_PRICES[billedPlan];
    const planName = PLAN_NAMES[billedPlan];
    const billingKey = decryptToken(sub.billing_key_cipher, { userId: sub.user_id, field: "subscriptions.billing_key_cipher" });

    const failCharge = async (reason: string) => {
      const nextRetry = (sub.billing_retry_count ?? 0) + 1;
      if (nextRetry >= 3) {
        // 3회 실패 — 해지 + 강등 + 알림 (billing 알림은 중요도가 높아 dedupe 없이 즉시 발송)
        await admin.from("subscriptions").update({ status: "canceled", canceled_at: nowIso, billing_retry_count: nextRetry }).eq("id", sub.id);
        await admin.from("users_profile").update({ plan: "free" }).eq("id", sub.user_id);
        await notifyUser(admin, {
          userId: sub.user_id,
          type: "billing",
          mandatory: true, // 법정 고지 — 수신 설정으로 끌 수 없다(전자상거래법 갱신 고지·결제 실패·구독 종료)
          title: "정기결제 실패로 구독이 해지되었어요",
          body: `${planName} 플랜 결제가 3회 실패해 구독이 해지되고 무료 플랜으로 전환되었어요. 요금제에서 다시 구독할 수 있습니다.`,
        });
      } else {
        await admin.from("subscriptions").update({ status: "past_due", billing_retry_count: nextRetry }).eq("id", sub.id);
        await notifyUser(admin, {
          userId: sub.user_id,
          type: "billing",
          mandatory: true, // 법정 고지 — 수신 설정으로 끌 수 없다(전자상거래법 갱신 고지·결제 실패·구독 종료)
          title: "정기결제에 실패했어요",
          body: `${planName} 플랜 결제가 실패했어요(${reason}). 내일 다시 시도합니다. 카드 한도·유효기간을 확인해 주세요.`,
        });
      }
      failedCount++;
    };

    if (!billingKey) {
      await failCharge("결제 수단 확인 불가");
      continue;
    }

    const cycle = String(sub.next_billing_at ?? nowIso).slice(0, 10).replaceAll("-", "");
    const orderId = `sub-${sub.id.replaceAll("-", "").slice(0, 12)}-${cycle}-r${sub.billing_retry_count ?? 0}`;
    const charged = await chargeBilling(billingKey, {
      customerKey: sub.toss_customer_key,
      amount,
      orderId,
      orderName: `핀치 ${planName} 플랜 (정기결제)`,
    });

    if (!charged.ok) {
      console.error("[cron:billing] 청구 실패:", sub.id, charged.code, charged.message);
      await failCharge(charged.message);
      continue;
    }

    const next = new Date(sub.next_billing_at ?? nowIso);
    next.setMonth(next.getMonth() + 1);
    const { error: upErr } = await admin
      .from("subscriptions")
      .update({
        status: "active",
        billing_retry_count: 0,
        next_billing_at: next.toISOString(),
        plan: billedPlan,
        pending_plan: null,
      })
      .eq("id", sub.id);
    if (upErr) {
      // 청구는 성공 — 반영 실패 시 다음 실행에서 같은 orderId(Idempotency)로 안전 재실행
      console.error("[cron:billing] 구독 갱신 반영 실패:", sub.id, upErr.message);
      continue;
    }
    const { error: orderErr } = await admin.from("payment_orders").insert({
      user_id: sub.user_id,
      order_id: orderId,
      plan: billedPlan,
      amount,
      order_name: `핀치 ${planName} 플랜 (정기결제)`,
      status: "paid",
      payment_key: charged.data.paymentKey,
      method: charged.data.method ?? "billing",
      approved_at: charged.data.approvedAt ?? nowIso,
      raw: charged.data as unknown as Record<string, unknown>,
    });
    if (orderErr) console.error("[cron:billing] 주문 기록 실패:", sub.id, orderErr.message);
    // past_due에서 복구된 경우 대비, 그리고 다운그레이드 예약이 적용된 경우 대비 플랜 재적용
    await admin.from("users_profile").update({ plan: billedPlan }).eq("id", sub.user_id);
    // 정기갱신 청구 성공 — 크레딧을 이번 달 지급량으로 리셋(다운그레이드였다면 새 플랜 지급량 기준)
    await grantPlanCredits(sub.user_id, billedPlan);
    chargedCount++;
  }

  // 2) 해지 구독의 기간 종료 — 만료 처리 + free 강등
  const { data: ended } = await admin
    .from("subscriptions")
    .select("id, user_id, plan")
    .eq("status", "canceled")
    .lte("next_billing_at", nowIso)
    .limit(100);
  for (const sub of ended ?? []) {
    await admin.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
    /* ⚠️ 강등은 «이 사람에게 살아 있는 다른 구독이 없을 때»만 한다. 예전엔 무조건 free 로 썼는데,
       해지 뒤 새로 구독한 사람이 옛 구독의 종료일에 **방금 결제한 유료 플랜을 잃었다**(2026-09-07 감사).
       조회가 실패하면(null) 강등하지 않는다 — 잘못 내리는 쪽이 잘못 두는 쪽보다 나쁘다. */
    const { data: alive, error: aliveErr } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", sub.user_id)
      .in("status", ["active", "past_due"])
      .limit(1);
    if (aliveErr) {
      console.error("[cron:subs] 잔여 구독 확인 실패 — 강등 보류:", sub.user_id, aliveErr.message);
      expiredCount++;
      continue;
    }
    if (alive && alive.length > 0) {
      expiredCount++;
      continue; // 새 구독이 살아 있다 — 플랜도 알림도 건드리지 않는다
    }
    await admin.from("users_profile").update({ plan: "free" }).eq("id", sub.user_id);
    await notifyUser(admin, {
      userId: sub.user_id,
      type: "billing",
      mandatory: true, // 법정 고지 — 수신 설정으로 끌 수 없다(전자상거래법 갱신 고지·결제 실패·구독 종료)
      title: "구독 기간이 끝났어요",
      body: "해지한 구독의 이용 기간이 종료되어 무료 플랜으로 전환되었어요.",
    });
    expiredCount++;
  }

  // 3) 갱신 3일 전 사전 고지 — 5일 중복 방지로 주기당 1회
  const from = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 4 * 86_400_000).toISOString();
  const { data: upcoming } = await admin
    .from("subscriptions")
    .select("id, user_id, plan, next_billing_at")
    .eq("status", "active")
    .gte("next_billing_at", from)
    .lte("next_billing_at", to)
    .limit(200);
  for (const sub of upcoming ?? []) {
    if (!isPaidPlan(sub.plan)) continue;
    await notifyUser(admin, {
      userId: sub.user_id,
      type: "billing",
      mandatory: true, // 법정 고지 — 수신 설정으로 끌 수 없다(전자상거래법 갱신 고지·결제 실패·구독 종료)
      dedupeMs: 5 * 86_400_000,
      title: "곧 정기결제가 예정되어 있어요",
      body: `${PLAN_NAMES[sub.plan]} 플랜이 ${String(sub.next_billing_at).slice(0, 10)}에 ${PLAN_PRICES[sub.plan].toLocaleString("ko-KR")}원 자동 결제될 예정이에요. 해지는 설정 > 요금제에서 가능합니다.`,
    });
  }

  return { charged: chargedCount, chargeFailed: failedCount, expired: expiredCount };
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }

  // refresh_token_cipher: TikTok 전용(0011 마이그레이션) — select("*") 대신 명시적으로 나열하는 이 쿼리는
  // 컬럼이 없으면 통째로 실패하므로, 0011 미적용 DB에서도 인스타/Threads 갱신은 계속 동작하도록
  // 별도로 폴백 조회한다.
  let accounts: TokenRow[] | null = null;
  /* 계정 조회가 실패했는가 — 응답에 남겨 «토큰은 못 돌았지만 청구는 돌았다»를 운영자가 구분할 수 있게 한다 */
  let accountsFailed: string | null = null;
  {
    const { data, error } = await admin
      .from("connected_accounts")
      .select("id, user_id, channel, handle, followers, platform_user_id, access_token_cipher, refresh_token_cipher, token_expires_at")
      .in("channel", ["instagram", "threads", "tiktok"])
      .eq("connected", true)
      .not("access_token_cipher", "is", null);
    if (error && /refresh_token_cipher/i.test(error.message)) {
      const fallback = await admin
        .from("connected_accounts")
        .select("id, user_id, channel, handle, followers, platform_user_id, access_token_cipher, token_expires_at")
        .in("channel", ["instagram", "threads", "tiktok"])
        .eq("connected", true)
        .not("access_token_cipher", "is", null);
      if (fallback.error) {
        /* ⚠️ 여기서 500 으로 조기 반환하면 **그날 정기결제가 통째로 안 돈다** — 청구는 이 함수 맨 끝에 있다.
           부수적인 스냅샷 작업 하나가 매출 경로를 인질로 잡던 자리다(2026-09-07 감사).
           토큰 루프만 건너뛰고 청구·해지만료·사전고지는 그대로 진행한다. */
        console.error("[cron:refresh] 계정 조회 실패 — 토큰 갱신만 건너뛴다:", fallback.error.message);
        accountsFailed = fallback.error.message;
        accounts = [];
      } else {
        accounts = (fallback.data ?? []).map((r) => ({ ...r, refresh_token_cipher: null }));
      }
    } else if (error) {
      console.error("[cron:refresh] 계정 조회 실패 — 토큰 갱신만 건너뛴다:", error.message);
      accountsFailed = error.message;
      accounts = [];
    } else {
      accounts = data;
    }
  }

  let refreshed = 0;
  let failed = 0;
  let notified = 0;
  let spikes = 0;

  for (const acc of accounts ?? []) {
    const channel = acc.channel as Channel;

    if (channel === "tiktok") {
      // TikTok access_token은 24시간짜리라 daysUntil(하루 단위 올림)로는 갱신 시점을 안정적으로
      // 판별할 수 없다(경계에서 0/음수가 흔하다) — "이미 만료" 조기 종료를 타지 않고 매번
      // refresh_token(365일)으로 갱신을 시도한다. 사실상 이 크론이 매일 하는 일이 된다.
      const config = getTiktokOAuthConfig();
      const refreshToken = decryptToken(acc.refresh_token_cipher ?? null, { userId: acc.user_id, field: "connected_accounts.refresh_token_cipher" });
      if (!config || !refreshToken) {
        await notifyTokenExpiry(
          admin,
          acc.user_id,
          channel,
          `${acc.handle} 연동 토큰을 확인할 수 없어요. 설정에서 다시 연동해 주세요.`,
        );
        notified++;
        continue;
      }

      let token: string;
      try {
        const next = await refreshTiktokToken(refreshToken, config);
        const accessCipher = encryptToken(next.accessToken, { userId: acc.user_id, field: "connected_accounts.access_token_cipher" });
        const refreshCipher = encryptToken(next.refreshToken, { userId: acc.user_id, field: "connected_accounts.refresh_token_cipher" });
        if (!accessCipher || !refreshCipher) throw new Error("encrypt_failed");
        const { error: upErr } = await admin
          .from("connected_accounts")
          .update({
            access_token_cipher: accessCipher,
            refresh_token_cipher: refreshCipher,
            token_expires_at: new Date(Date.now() + next.expiresInSeconds * 1000).toISOString(),
          })
          .eq("id", acc.id);
        if (upErr) throw new Error(upErr.message);
        token = next.accessToken;
        refreshed++;
      } catch (e) {
        failed++;
        console.error("[cron:refresh] TikTok 갱신 실패:", acc.id, e instanceof Error ? e.message : String(e));
        // 액세스 토큰이 24시간짜리라 갱신 실패 시 이미 만료됐을 공산이 커 스냅샷 단계도 신뢰할 수 없다
        await notifyTokenExpiry(
          admin,
          acc.user_id,
          channel,
          `${acc.handle} 연동 토큰 갱신에 실패했어요. 설정에서 다시 연동해 주세요.`,
        );
        notified++;
        continue;
      }

      // 일일 계정 스냅샷 — 팔로워 급변 감지 + followers·posts(video_count) 최신화
      try {
        const info = await fetchTiktokUserInfo(token);
        /* ⚠️ 통계 넷은 null 일 수 있다 = «확인 불가»(사용자가 user.info.stats 만 거부한 경우).
           그때 0 으로 치면 진짜 값을 0 으로 덮어쓰고 「하루 사이 수천 명 감소」 알림까지 나간다.
           모르면 아무것도 하지 않는다 — 알림도, 갱신도. */
        const prev = acc.followers ?? 0;
        const delta = info.followerCount === null ? null : info.followerCount - prev;
        if (delta !== null && prev > 0 && Math.abs(delta) >= Math.max(SPIKE_MIN_ABS, Math.round(prev * SPIKE_MIN_PCT))) {
          const up = delta > 0;
          const sent = await notifyUser(admin, {
            userId: acc.user_id,
            type: up ? "account_spike" : "account_drop",
            settingKey: "account",
            dedupeMs: 86_400_000,
            title: up ? "팔로워가 크게 늘고 있어요" : "팔로워가 크게 줄었어요",
            body: `${acc.handle} 팔로워가 하루 사이 ${up ? "+" : ""}${delta.toLocaleString("ko-KR")}명 변동했어요 (현재 ${(prev + delta).toLocaleString("ko-KR")}명).`,
          });
          if (sent) spikes++;
        }
        /* null 인 컬럼은 아예 안 건드린다 — 마지막으로 알던 값이 남는 게 0 보다 정직하다 */
        const snapshot = {
          ...(info.followerCount !== null ? { followers: info.followerCount } : {}),
          ...(info.videoCount !== null ? { posts: info.videoCount } : {}),
        };
        if (Object.keys(snapshot).length > 0) {
          await admin.from("connected_accounts").update(snapshot).eq("id", acc.id);
        }
      } catch (e) {
        // 스냅샷 실패는 치명적이지 않다 — 다음 실행에서 재시도
        console.warn("[cron:refresh] TikTok 계정 스냅샷 실패:", acc.id, e instanceof Error ? e.message : String(e));
      }
      continue;
    }

    // ── 이하 인스타그램/Threads 경로 (channel은 위 tiktok 분기 이후 "instagram" | "threads"로 좁혀진다) ──
    const remaining = daysUntil(acc.token_expires_at);
    if (remaining === null) continue;

    if (remaining <= 0) {
      // 이미 만료 — 갱신 불가, 재연동 안내만
      await notifyTokenExpiry(admin, acc.user_id, channel, `${acc.handle} 연동이 만료되었어요. 설정에서 다시 연동해 주세요.`);
      notified++;
      continue;
    }

    let token = decryptToken(acc.access_token_cipher, { userId: acc.user_id, field: "connected_accounts.access_token_cipher" });
    if (!token) {
      // 암호화 키 불일치 등 — 복호화 불가면 재연동 외 방법 없음
      await notifyTokenExpiry(admin, acc.user_id, channel, `${acc.handle} 연동 토큰을 확인할 수 없어요. 설정에서 다시 연동해 주세요.`);
      notified++;
      continue;
    }

    // 1) 만료 임박 시 토큰 갱신
    if (remaining <= REFRESH_WINDOW_DAYS) {
      try {
        const next = await refreshTokenForChannel(channel, token);
        const cipher = encryptToken(next.accessToken, { userId: acc.user_id, field: "connected_accounts.access_token_cipher" });
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
            channel,
            `${acc.handle} 연동 토큰이 ${remaining}일 후 만료돼요. 설정에서 다시 연동해 주세요.`,
          );
          notified++;
        }
      }
    }

    // 2) 일일 계정 스냅샷 — 팔로워 급변 감지 + followers(·인스타그램은 posts도) 최신화
    // Threads는 프로필 필드에 총 게시물 수가 없어(스펙 5절) followers만 갱신한다.
    try {
      /* ⚠️ null = «플랫폼이 안 알려준다». 0 이 아니다.
         이걸 0 으로 받으면 아래 급변 감지가 «팔로워가 전부 빠져나갔다»고 읽고
         사용자에게 거짓 알림을 쏜다 — 100팔로워 미만 계정에서 매일 일어난다. */
      let followersCount: number | null;
      let postsCount: number | null = null;
      if (channel === "threads") {
        followersCount = await fetchThreadsFollowersCount(acc.platform_user_id ?? "", token);
      } else {
        const info = await fetchAccountInfo(token);
        followersCount = info.followersCount;
        postsCount = info.mediaCount;
      }
      const prev = acc.followers ?? 0;
      const delta = followersCount === null ? 0 : followersCount - prev;
      if (followersCount !== null && prev > 0 && Math.abs(delta) >= Math.max(SPIKE_MIN_ABS, Math.round(prev * SPIKE_MIN_PCT))) {
        const up = delta > 0;
        const sent = await notifyUser(admin, {
          userId: acc.user_id,
          type: up ? "account_spike" : "account_drop",
          settingKey: "account",
          dedupeMs: 86_400_000,
          title: up ? "팔로워가 크게 늘고 있어요" : "팔로워가 크게 줄었어요",
          body: `${acc.handle} 팔로워가 하루 사이 ${up ? "+" : ""}${delta.toLocaleString("ko-KR")}명 변동했어요 (현재 ${followersCount.toLocaleString("ko-KR")}명).`,
        });
        if (sent) spikes++;
      }
      /* null 인 컬럼은 아예 빼고 갱신한다 — 모르는 값으로 아는 값을 덮지 않는다.
         둘 다 null 이면 갱신 자체를 건너뛴다(빈 update 는 updated_at 만 흔든다). */
      const snapshot = {
        ...(followersCount !== null ? { followers: followersCount } : {}),
        ...(postsCount !== null ? { posts: postsCount } : {}),
      };
      if (Object.keys(snapshot).length > 0) {
        await admin.from("connected_accounts").update(snapshot).eq("id", acc.id);
      }
    } catch (e) {
      // 스냅샷 실패는 치명적이지 않다 — 다음 실행에서 재시도
      console.warn("[cron:refresh] 계정 스냅샷 실패:", acc.id, e instanceof Error ? e.message : String(e));
    }
  }

  // 정기결제 청구·만료·사전고지 (같은 일일 크론에 통합 — 크론 개수는 별도 제한 없지만 관련 로직 응집)
  const billing = await processSubscriptions(admin);

  return NextResponse.json({
    ok: accountsFailed === null,
    ...(accountsFailed ? { accountsError: accountsFailed } : {}),
    total: accounts?.length ?? 0,
    refreshed,
    failed,
    notified,
    spikes,
    billing,
  });
}
