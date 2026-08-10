import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { planCrawl } from "@/lib/pool/planner";
import { readBudget } from "@/lib/pool/budget";

/**
 * 공용 풀 — 계획 회차 (매일 1회).
 *
 * 무엇을 수집할지만 정해 crawl_jobs 에 넣는다. **공급사를 호출하지 않으므로 돈이 안 나간다.**
 * 계획과 실행을 나눈 이유가 이것이다 — 큐를 먼저 눈으로 보고, 이상하면 실행 전에 지울 수 있다.
 *
 * 폐기된 collect-references 크론과의 차이:
 *   구: 사용자별로 돈다 → 사용자 수 × 키워드 수만큼 호출. 100명이 같은 말을 등록하면 100배.
 *   신: 전원 몫으로 한 번 돈다 → 호출 수가 키워드 수에만 비례. 1만 명이어도 같다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("not_configured", { status: 503 });

  const started = new Date().toISOString();
  const plan = await planCrawl(120);
  const budget = await readBudget();

  await admin.from("crawl_runs").insert({
    run_kind: "plan",
    started_at: started,
    ended_at: new Date().toISOString(),
    jobs_done: plan.queued,
    note: JSON.stringify(plan.byReason),
  });

  return NextResponse.json({
    ok: true,
    queued: plan.queued,
    skippedDuplicate: plan.skippedDuplicate,
    byReason: plan.byReason,
    budget,
  });
}
