/**
 * 서비스 내부 데이터 프로바이더 (서버 전용) — 알림·사용량·리포트를 Supabase에서 조회.
 *
 * 데모 모드: 목데이터. 실 모드: 로그인 사용자의 DB 행(없으면 빈 배열).
 * next/headers(createClient) 경유라 서버 컨텍스트에서만 동작한다.
 */

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import {
  notifications as mockNotifications,
  usageStats as mockUsageStats,
  reports as mockReports,
} from "@/lib/mock/data";
import type { AppNotification, UsageStat, ReportItem, Channel } from "@/lib/types";

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/* ── 알림 ─────────────────────────────────────────────────── */

export async function getNotifications(): Promise<AppNotification[]> {
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
    return [];
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
const USAGE_META: Record<string, { label: string; unit: string }> = {
  content_analysis: { label: "콘텐츠 분석", unit: "회" },
  ai_cardnews: { label: "AI 카드뉴스", unit: "회" },
  auto_dm_send: { label: "자동 DM 발송", unit: "건" },
  competitor_track: { label: "경쟁사 추적", unit: "개" },
};

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function getUsageStats(): Promise<UsageStat[]> {
  if (isDemoMode()) return mockUsageStats;
  const { supabase, user } = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("usage_counters")
    .select("metric, used, limit_value, period_month")
    .eq("period_month", currentMonthStart());
  if (error) {
    console.error("[internal] 사용량 조회 실패:", error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const meta = USAGE_META[r.metric] ?? { label: r.metric, unit: "회" };
    return { label: meta.label, used: r.used ?? 0, limit: r.limit_value ?? 0, unit: meta.unit };
  });
}

/* ── 현재 플랜 · 결제 내역 ────────────────────────────────── */

export type PlanKey = "free" | "creator" | "pro" | "agency" | "enterprise";

/** 현재 플랜 — users_profile.plan. 데모는 creator, 비로그인/조회실패는 free. */
export async function getCurrentPlan(): Promise<PlanKey> {
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
    return "free";
  }
  const plan = data?.plan;
  return plan === "creator" || plan === "pro" || plan === "agency" || plan === "enterprise" ? plan : "free";
}

export interface PaymentOrderView {
  id: string;
  plan: string;
  orderName: string;
  amount: number;
  status: "paid" | "failed" | "canceled";
  approvedAt: string | null;
  createdAt: string;
}

/** 결제 내역 — ready(결제창만 열고 이탈한 주문)는 제외. 최신순 20건. */
export async function getPaymentOrders(): Promise<PaymentOrderView[]> {
  if (isDemoMode()) return [];
  const { supabase, user } = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("payment_orders")
    .select("id, plan, order_name, amount, status, approved_at, created_at")
    .neq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[internal] 결제 내역 조회 실패:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    plan: r.plan,
    orderName: r.order_name,
    amount: r.amount,
    status: r.status as PaymentOrderView["status"],
    approvedAt: r.approved_at,
    createdAt: r.created_at,
  }));
}

/* ── 리포트 ───────────────────────────────────────────────── */

export async function getReports(): Promise<ReportItem[]> {
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
    return [];
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
