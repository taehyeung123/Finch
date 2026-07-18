"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import type { Channel, ReportItem } from "@/lib/types";

/**
 * 리포트 생성 — reports 테이블 insert (RLS: 내 행만).
 * 파일은 미리 만들지 않고, 다운로드 시점에 라이브 데이터로 CSV를 생성한다
 * (/api/reports/[id]/download — 저장소 비용 0, 항상 최신 지표).
 * 데모 모드는 { demo: true } 반환 → 클라이언트가 로컬 행으로 미리보기.
 */
export type CreateReportResult =
  | { ok: true; report: ReportItem }
  | { ok: false; demo?: boolean; error?: string };

export async function createReport(input: {
  title: string;
  period: string;
  channels: Channel[];
  format: "pdf" | "excel";
}): Promise<CreateReportResult> {
  if (isDemoMode()) return { ok: false, demo: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      title: input.title,
      period: input.period,
      channels: input.channels,
      format: input.format,
      scheduled: false,
    })
    .select("id, title, period, channels, format, scheduled, created_at")
    .single();
  if (error || !data) {
    console.error("[reports] 생성 실패:", error?.message);
    return { ok: false, error: "리포트 생성에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }

  return {
    ok: true,
    report: {
      id: data.id,
      title: data.title,
      period: data.period,
      channels: (data.channels ?? []) as Channel[],
      format: data.format as "pdf" | "excel",
      createdAt: data.created_at,
      scheduled: Boolean(data.scheduled),
    },
  };
}
