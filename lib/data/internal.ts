/**
 * 서비스 내부 데이터 프로바이더 (서버 전용) — 알림·사용량·리포트를 Supabase에서 조회.
 *
 * 데모 모드: 목데이터. 실 모드: 로그인 사용자의 DB 행(없으면 빈 배열).
 * next/headers(createClient) 경유라 서버 컨텍스트에서만 동작한다.
 */

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import {
  notifications as mockNotifications,
  usageStats as mockUsageStats,
  reports as mockReports,
} from "@/lib/mock/data";
import type { AppNotification, UsageStat, ReportItem, Channel } from "@/lib/types";

async function getUser() {
  const supabase = await createClient();
  const user = await getAuthUser(); // 요청당 1회 메모이즈 — 레이아웃 가드와 왕복 공유
  return { supabase, user };
}

/*
  ⚠️ 이 파일의 규칙 — **조회 실패는 «없음»이 아니다.**

  예전엔 조회가 실패하면 console.error 를 찍고 바로 []를 돌려줬다. 그러면 화면은
  「아직 없어요」를 그린다 — 결제한 고객이 「결제 내역이 없습니다」를 보고, 리포트를
  만든 사람이 「리포트가 없습니다」를 본다. 서버 로그에만 남고 화면은 거짓말을 한다.

  그래서 목록 조회는 **실패하면 null**, «진짜 비었음»은 [] 로 가른다. 단일 값도 같은
  규칙을 따른다(각 함수 주석). 타입이 null 을 강제하므로 새 화면이 이 규칙을
  조용히 빠뜨릴 수 없다.
*/

/* ── 알림 ─────────────────────────────────────────────────── */

/** 알림 목록 — **null 이면 조회 실패**(«알림 없음»은 빈 배열) */
export async function getNotifications(): Promise<AppNotification[] | null> {
  if (isDemoMode()) return mockNotifications;
  const { supabase, user } = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, read, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[internal] 알림 조회 실패:", error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body ?? "",
    read: Boolean(r.read),
    createdAt: r.created_at,
  }));
}

/* ── 사용량 ───────────────────────────────────────────────── */

// 사용량 지표 코드 → 표시 라벨/단위 (use_quota의 metric과 일치)
/* 지표 키 → 사람이 읽는 라벨. **여기 없는 키는 DB 컬럼명이 그대로 화면에 노출된다**
   (실제로 'reference_collect 11/1000회'가 결제 화면에 새어 나갔다 — 2026-08-15).
   lib/pricing/credit-config.ts 의 FREE_MONTHLY_LIMITS 에 지표를 추가하면 이 표에도 같이 넣는다. */
const USAGE_META: Record<string, { label: string; unit: string }> = {
  content_analysis: { label: "콘텐츠 분석", unit: "회" },
  ai_cardnews: { label: "AI 카드뉴스", unit: "회" },
  auto_dm_send: { label: "자동 DM 발송", unit: "건" },
  competitor_track: { label: "경쟁사 추적", unit: "개" },
  reference_collect: { label: "레퍼런스 수집", unit: "회" },
  ad_collect: { label: "메타광고 수집", unit: "회" },
  reference_transcript: { label: "대본 추출", unit: "회" },
  ai_agent_chat: { label: "AI 챗", unit: "회" },
  ai_video_analysis: { label: "영상 분석", unit: "회" },
  growth_diagnosis: { label: "성장 진단", unit: "회" },
  ai_ideas: { label: "아이디어 추천", unit: "회" },
  ai_brand_tone: { label: "브랜드 톤 학습", unit: "회" },
};

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** 이번 달 사용량 — **null 이면 조회 실패**. (2026-08-25 현재 호출부 없음) */
export async function getUsageStats(): Promise<UsageStat[] | null> {
  if (isDemoMode()) return mockUsageStats;
  const { supabase, user } = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("usage_counters")
    .select("metric, used, limit_value, period_month")
    .eq("period_month", currentMonthStart());
  if (error) {
    console.error("[internal] 사용량 조회 실패:", error.message);
    return null;
  }
  return (data ?? []).map((r) => {
    const meta = USAGE_META[r.metric] ?? { label: r.metric, unit: "회" };
    return { label: meta.label, used: r.used ?? 0, limit: r.limit_value ?? 0, unit: meta.unit };
  });
}

/* ── 현재 플랜 · 결제 내역 ────────────────────────────────── */

export type PlanKey = "free" | "creator" | "pro" | "agency" | "enterprise";

/** 현재 플랜 — users_profile.plan. 데모는 creator, 비로그인/조회실패는 free. */
/**
 * 현재 플랜 — **null 이면 조회 실패**(«무료»와 다르다).
 * 예전엔 실패를 "free" 로 폴백해서 유료 고객의 화면이 잠긐 무료로 읽혔다 —
 * 기능이 잠기고 업그레이드 권유가 뜨는, 가장 민망한 종류의 오동작이다.
 * 권한 판정은 여전히 fail-closed 로(호출부가 ?? "free"), 표시만 «확인 못 함»으로 가른다.
 */
export async function getCurrentPlan(): Promise<PlanKey | null> {
  if (isDemoMode()) return "creator";
  const { supabase, user } = await getUser();
  if (!user) return "free";
  const { data, error } = await supabase
    .from("users_profile")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[internal] 플랜 조회 실패:", error.message);
    return null;
  }
  const plan = data?.plan;
  return plan === "creator" || plan === "pro" || plan === "agency" || plan === "enterprise" ? plan : "free";
}

export interface SubscriptionView {
  id: string;
  plan: string;
  status: "active" | "past_due" | "canceled";
  nextBillingAt: string | null;
  cardSummary: string | null;
  /** 다운그레이드 예약된 목표 플랜 — 다음 결제일부터 적용된다(0013_plan_change.sql). 예약 없으면 null. */
  pendingPlan: string | null;
}

/**
 * 현재 구독(정기결제) — 만료·초안 제외 최신 1건.
 *
 * 반환값이 **두 격**인 이유: 예전엔 «구독 없음»과 «조회 실패»가 둘 다 null 이었다.
 * 정기결제 중인 고객의 조회가 한 번 실패하면 결제 화면이 「구독 없음」으로 보이고
 * 해지·재결제 버튼이 통째로 사라졌다.
 *   바깥 null   = 조회 실패
 *   { sub: null } = 구독 없음(데모·비로그인 포함)
 */
export async function getSubscription(): Promise<{ sub: SubscriptionView | null } | null> {
  if (isDemoMode()) return { sub: null };
  const { supabase, user } = await getUser();
  if (!user) return { sub: null };
  let { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan, status, next_billing_at, card_summary, pending_plan")
    .in("status", ["active", "past_due", "canceled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && /pending_plan/i.test(error.message)) {
    // 0013_plan_change.sql 미적용 DB 폴백 — pending_plan 없이 재조회
    const fallback = await supabase
      .from("subscriptions")
      .select("id, plan, status, next_billing_at, card_summary")
      .in("status", ["active", "past_due", "canceled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    data = fallback.data ? { ...fallback.data, pending_plan: null } : null;
    error = fallback.error;
  }
  if (error) {
    /* 0009 미적용 등 — «구독 없음»으로 폴백하지 않는다(위 주석) */
    console.warn("[internal] 구독 조회 실패:", error.message);
    return null;
  }
  if (!data) return { sub: null };
  return {
    sub: {
      id: data.id,
      plan: data.plan,
      status: data.status as SubscriptionView["status"],
      nextBillingAt: data.next_billing_at,
      cardSummary: data.card_summary,
      pendingPlan: data.pending_plan ?? null,
    },
  };
}

export interface PaymentOrderView {
  id: string;
  plan: string;
  orderName: string;
  amount: number;
  status: "paid" | "failed" | "canceled";
  approvedAt: string | null;
  createdAt: string;
  /** 토스 영수증 URL — 승인 원본(raw.receipt.url)에서 꺼낸다. 없으면 null */
  receiptUrl: string | null;
}

/**
 * 결제 내역 — ready(결제창만 열고 이탈한 주문)는 제외. 최신순 20건.
 * **null 이면 조회 실패** — 돈이 오간 화면에서 「내역이 없습니다」는 가장 나쁜 거짓말이다.
 */
export async function getPaymentOrders(): Promise<PaymentOrderView[] | null> {
  if (isDemoMode()) return [];
  const { supabase, user } = await getUser();
  if (!user) return [];
  /* receipt_url — jsonb 경로 선택(raw->receipt->>url). raw 는 0005 부터 있던 컬럼이라 별도 폴백은 없다 */
  const { data, error } = await supabase
    .from("payment_orders")
    .select("id, plan, order_name, amount, status, approved_at, created_at, receipt_url:raw->receipt->>url")
    .neq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[internal] 결제 내역 조회 실패:", error.message);
    return null;
  }
  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      plan: string;
      order_name: string;
      amount: number;
      status: string;
      approved_at: string | null;
      created_at: string;
      receipt_url?: unknown;
    };
    return {
      id: row.id,
      plan: row.plan,
      orderName: row.order_name,
      amount: row.amount,
      status: row.status as PaymentOrderView["status"],
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      receiptUrl:
        typeof row.receipt_url === "string" && /^https:\/\//.test(row.receipt_url) ? row.receipt_url : null,
    };
  });
}

/* ── 리포트 ───────────────────────────────────────────────── */

/** 리포트 목록 — **null 이면 조회 실패** */
export async function getReports(): Promise<ReportItem[] | null> {
  if (isDemoMode()) return mockReports;
  const { supabase, user } = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("reports")
    .select("id, title, period, channels, format, scheduled, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[internal] 리포트 조회 실패:", error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    period: r.period,
    channels: (r.channels ?? []) as Channel[],
    format: r.format as "pdf" | "excel",
    createdAt: r.created_at,
    scheduled: Boolean(r.scheduled),
  }));
}
