import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCollectionConfigured } from "@/lib/reference/scrapecreators";
import { runCrawlWorker } from "@/lib/pool/worker";
import { readBudget } from "@/lib/pool/budget";
import { alertPool } from "@/lib/pool/alert";
import { fillThumbs, type ThumbResult } from "@/lib/pool/thumbs";
import { backfillEmbeddings, enrichPool, type EnrichRunResult } from "@/lib/pool/enrich";

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
/* Hobby 플랜 함수 실행 상한이 60초다. Pro 로 올리면 300 으로 되돌리고
   아래 두 숫자(MAX_JOBS_PER_RUN·TIME_BUDGET_MS)도 함께 키운다. */
export const maxDuration = 60;

/** 회차당 job 상한 — job 하나가 최대 2콜 */
const MAX_JOBS_PER_RUN = 8;
/** 실행시간 상한(60초)에서 마무리 DB 쓰기 몫을 뺀 값 */
const TIME_BUDGET_MS = 45_000;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("not_configured", { status: 503 });
  if (!isCollectionConfigured()) {
    return NextResponse.json({ ok: true, skipped: "collector_not_configured" });
  }

  const started = new Date().toISOString();
  const t0 = Date.now();
  const result = await runCrawlWorker(MAX_JOBS_PER_RUN, TIME_BUDGET_MS);

  /* 남은 시간에 썸네일을 채운다.

     이미지는 이 제품의 본체다 — 레퍼런스 도구에서 이미지 없는 카드는 반쪽이다.
     그런데 썸네일 캐시를 마감 크론(하루 1회 × 40장)에만 맡겨두면, 수집은 하루
     수백 장씩 들어오는데 캐시는 40장/일로 굳는다. 영원히 못 따라잡는다.
     실행 회차는 하루 8번 돌고 대부분 예산보다 시간이 남으므로, 그 자투리로 채운다.
     공급사 크레딧은 0 — 나가는 건 이미지 대역폭뿐이다.

     장당 ~250ms 로 잡고 남은 시간만큼만. 10초 미만이면 시작하지 않는다 —
     Hobby 60초 상한을 넘겨 강제 종료되면 이 회차 기록까지 날아간다. */
  /* 남은 시간 1순위: AI 태깅(enrich). 후킹·주제 태그가 필터와 상세 화면을 살리는
     제품 신호라 썸네일보다 먼저다. 60건 = Haiku 3청크 병렬 ≈ 10~15초.
     공급사 크레딧 0 — Claude 토큰만 나가고, 하루 상한은 claim_ai_budget 이 잡는다.
     시작 게이트 25초 + 내부 데드라인(t0+52초): 태깅 청크 상한 20초에 더해
     임베딩 편승이 순차 청크(각 15초 상한)를 돌 수 있어, 게이트만으론 60초를 못 지킨다.
     데드라인이 임베딩 청크를 중간에 끊어 회차 기록·경보를 지킨다. */
  let enrich: EnrichRunResult | null = null;
  if (55_000 - (Date.now() - t0) > 25_000) {
    try {
      enrich = await enrichPool(admin, 60, t0 + 52_000);
    } catch (e) {
      console.error("[pool] AI 태깅 실패(회차는 계속):", e instanceof Error ? e.message : String(e));
    }
  }

  /* 임베딩 백필 — 태깅됐는데 벡터 없는 소재. 호출당 ~1초, 건당 ~0원. */
  let embedded = 0;
  if (55_000 - (Date.now() - t0) > 20_000) {
    try {
      embedded = await backfillEmbeddings(admin, 100, t0 + 52_000);
    } catch (e) {
      console.error("[pool] 임베딩 백필 실패(회차는 계속):", e instanceof Error ? e.message : String(e));
    }
  }

  let thumbs: ThumbResult | null = null;
  const remainMs = 55_000 - (Date.now() - t0);
  if (remainMs > 10_000) {
    try {
      thumbs = await fillThumbs(Math.min(100, Math.floor(remainMs / 250)));
    } catch (e) {
      console.error("[pool] 썸네일 채우기 실패(회차는 계속):", e instanceof Error ? e.message : String(e));
    }
  }

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
    note: result.stoppedBy + (enrich && enrich.enriched > 0 ? ` · enrich=${enrich.enriched}` : ""),
  });

  return NextResponse.json({ ok: true, ...result, enrich, embedded, thumbs, budget: await readBudget() });
}
