import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveAudience, getLiveDashboard } from "@/lib/data/live";

/**
 * 리포트 다운로드 — 생성 시점이 아니라 다운로드 시점에 라이브 데이터로 CSV를 만든다.
 * (저장소 비용 0, 항상 최신. PDF 렌더링은 후속 — UI는 Excel(CSV)만 활성.)
 * CSV는 UTF-8 BOM을 붙여 한글 엑셀 호환을 보장한다.
 */
export const runtime = "nodejs";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function rows(...lines: (string | number)[][]): string {
  return lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  // RLS로 내 리포트만 조회된다 — 타인 id를 넣어도 not_found
  const { data: report } = await supabase
    .from("reports")
    .select("id, title, period, channels, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!report) {
    return new NextResponse("not_found", { status: 404 });
  }

  const [dashboard, audience] = await Promise.all([getLiveDashboard(), getLiveAudience()]);
  if (!dashboard) {
    return new NextResponse("인스타그램 계정을 먼저 연동해 주세요.", { status: 400 });
  }

  const s = dashboard.summaries.instagram;
  const sections: string[] = [];

  sections.push(
    rows(
      ["핀치 성과 리포트"],
      ["제목", report.title],
      ["기간", report.period],
      ["생성 시각", new Date().toISOString()],
      ["데이터 기준", "Instagram 공식 API · 일별 지표는 최근 14일 제공 범위"],
    ),
  );

  sections.push(
    rows(
      ["[계정 요약]"],
      ["지표", "값"],
      ["팔로워", s.followers],
      ["팔로워 증감(7일)", s.followersDelta],
      ["조회수(7일)", s.weeklyViews],
      ["게시물 수", s.postCount],
      ["평균 좋아요(최근 게시물)", s.avgLikes],
      ["평균 댓글(최근 게시물)", s.avgComments],
      ["참여율 % (자체 산출: 상호작용/도달)", s.engagementRate],
    ),
  );

  if (audience && audience.daily.length > 0) {
    sections.push(
      rows(
        ["[일별 지표 (최근 14일)]"],
        ["날짜", "도달", "팔로워 순증감"],
        ...audience.daily.map((d) => [d.date, d.reach, d.followerNet] as (string | number)[]),
      ),
    );
  }

  if (dashboard.posts.length > 0) {
    sections.push(
      rows(
        ["[최근 게시물]"],
        ["게시일", "유형", "캡션", "조회수", "좋아요", "댓글", "공유"],
        ...dashboard.posts.map(
          (p) => [p.publishedAt.slice(0, 10), p.type, p.caption, p.views, p.likes, p.comments, p.shares] as (string | number)[],
        ),
      ),
    );
  }

  const csv = "﻿" + sections.join("\r\n\r\n") + "\r\n";
  const filename = `finch-report-${report.created_at?.slice(0, 10) ?? "export"}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
