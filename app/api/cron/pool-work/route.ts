import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCollectionConfigured } from "@/lib/reference/scrapecreators";
import { runCrawlWorker } from "@/lib/pool/worker";
import { readBudget } from "@/lib/pool/budget";
import { alertPool } from "@/lib/pool/alert";

/**
 * 공용 풀 — 실행 회차 (하루 여러 번).
 *
 * **서비스에서 공급사 크레딧이 나가는 유일한 경로다.**
 * 한 회차가 쓸 수 있는 상한이 두 겹으로 걸려 있다:
 *   1) maxJobs — 서버리스 실행시간 안에 끝나게 하는 상한
 *   2) crawl_budget — DB 원자적 하루 상한. 크론이 몇 번 뜨든 이걸 못 넘는다.
 * 2번이 핵심이다. 사용자가 1만 명이 되어도 이 숫자가 그대로면 하루 지출도 그대로다.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

/** 회차당 job 상한 — job 하나가 최대 2콜, 콜당 최대 45초를 잡는다 */
const MAX_JOBS_PER_RUN = 12;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("not_configured", { status: 503 });
  if (!isCollectionConfigured()) {
    return NextResponse.json({ ok: true, skipped: "collector_not_configured" });
  }

  const started = new Date().toISOString();
  const result = await runCrawlWorker(MAX_JOBS_PER_RUN);

  /* 수집이 멈췄으면 운영자에게 메일. 이게 없으면 크레딧이 떨어져도 아무 일도
     안 일어난 것처럼 보이고, 화면은 어제 데이터를 계속 보여준다. */
  if (result.stoppedBy === "credits") await alertPool(admin, "credits_exhausted");
  else if (result.stoppedBy === "budget") await alertPool(admin, "budget_exhausted");

  await admin.from("crawl_runs").insert({
    run_kind: "work",
    started_at: started,
    ended_at: new Date().toISOString(),
    jobs_done: result.jobsDone,
    calls_used: result.callsUsed,
    new_creatives: result.newCreatives,
    new_brands: result.newBrands,
    errors: result.errors,
    note: result.stoppedBy,
  });

  return NextResponse.json({ ok: true, ...result, budget: await readBudget() });
}
