import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillThumbs } from "@/lib/pool/thumbs";
import { saveBoost } from "@/lib/pool/heat";
import { backfillEmbeddings, enrichPool } from "@/lib/pool/enrich";

/**
 * 공용 풀 — 마감 회차 (매일 1회, 실행 회차 뒤).
 *
 * 공급사 크레딧을 쓰지 않는 뒷정리만 한다:
 *   1) 썸네일 캐시 (대역폭·스토리지만 소모)
 *   2) 업종 노출 자격 롤업 — 브랜드 4곳·소재 40건을 넘긴 업종만 화면에 켠다
 *   3) 저장 수 반영 (사람이 담아간 소재를 상단으로)
 *   4) 죽은 job 정리
 *
 * 2번이 "빈 업종이 보이는" 사고를 막는 장치다. is_visible 을 사람이 켜지 않는다.
 */
export const runtime = "nodejs";
export const maxDuration = 60; // Hobby 상한. Pro 전환 시 300 으로.

const THUMBS_PER_RUN = 40; // 60초 안에 끝나는 규모

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("not_configured", { status: 503 });

  const started = new Date().toISOString();
  const t0 = Date.now();

  /* AI 태깅을 **썸네일보다 먼저** 돌린다 (2026-08-12 실측: 썸네일을 먼저 두면
     실패 장당 10초 타임아웃이 시간을 다 먹어 enrich 가 매번 굶었다 — enriched=0).
     enrich 는 청크당 20초 API 상한이 있어 40건 = 최악 ~25초로 유계다.
     이 뒤 단계들 몫은 아래 썸네일 건수 조절이 지킨다. */
  let enriched = 0;
  try {
    enriched = (await enrichPool(admin, 40, t0 + 48_000)).enriched;
  } catch (e) {
    console.error("[pool] 마감 AI 태깅 실패(마감은 계속):", e instanceof Error ? e.message : String(e));
  }

  /* 임베딩 백필 잔여분 — 건당 ~0원. 시간 게이트+데드라인 필수: 순차 청크(각 15초 상한)라
     느린 날엔 게이트 없이 60초를 넘겨 뒤의 롤업·부스트·회차 기록까지 죽는다(리뷰 확정). */
  let embedded = 0;
  if (Date.now() - t0 < 20_000) {
    try {
      embedded = await backfillEmbeddings(admin, 100, t0 + 48_000);
    } catch (e) {
      console.error("[pool] 임베딩 백필 실패(마감은 계속):", e instanceof Error ? e.message : String(e));
    }
  }

  // 남은 시간에 맞춰 썸네일 건수를 줄인다 — 장당 250ms 낙관치지만 상한 역할은 한다
  const thumbBudget = Math.max(0, Math.min(THUMBS_PER_RUN, Math.floor((40_000 - (Date.now() - t0)) / 250)));
  const thumbs = thumbBudget > 0 ? await fillThumbs(thumbBudget) : { ok: 0, failed: 0, skipped: 0 };

  const { error: rollupErr } = await admin.rpc("rollup_industry_stats");
  if (rollupErr) console.error("[pool] 업종 롤업 실패", rollupErr.message);

  const { data: visibleCount } = await admin.rpc("visible_industry_count");

  /* 저장 수 반영 — 담아간 소재를 상단으로.

     예전에는 heat_score 에 배수를 곱해 **덮어썼다.** 그런데 이 크론은 매일 돌고,
     다음 날에는 이미 부스트된 값에 또 곱한다. 며칠이면 복리로 100 상한에 붙어버려서
     집행 기간·조회 배수 같은 원래 신호가 저장 수 하나로 뭉개진다.
     그래서 원본을 heat_base 에 따로 남기고, 매번 **원본에서 다시 계산**한다. */
  let boosted = 0;
  const { data: hot } = await admin
    .from("creative_stats")
    .select("creative_id, save_count")
    .gt("save_count", 0)
    .order("save_count", { ascending: false })
    .limit(300);

  /* heat_base 컬럼(0034)이 아직 없을 수도 있다. 없으면 부스트를 **건너뛴다** —
     예전처럼 heat_score 를 덮어쓰면 매일 복리로 쌓여 며칠 만에 상한에 붙는다.
     하루 이틀 부스트가 안 붙는 건 되돌릴 수 있지만, 복리로 뭉개진 점수는 못 되돌린다.
     마이그레이션 적용 여부로 크론이 죽지 않게 한 번만 확인하고 넘어간다. */
  let hasHeatBase = true;
  if ((hot?.length ?? 0) > 0) {
    const { error: probeErr } = await admin.from("creatives").select("heat_base").limit(1);
    if (probeErr) {
      hasHeatBase = false;
      console.warn("[pool] heat_base 컬럼 없음(0034 미적용) — 저장수 부스트를 건너뜁니다:", probeErr.message);
    }
  }

  for (const s of hasHeatBase ? (hot ?? []) : []) {
    const { data: c } = await admin
      .from("creatives")
      .select("heat_score, heat_base")
      .eq("id", s.creative_id)
      .maybeSingle();
    if (!c) continue;
    const current = Number(c.heat_score ?? 0);
    // 첫 회차에는 heat_base 가 비어 있다 — 그때의 heat_score 가 곧 원본이다
    const base = c.heat_base === null || c.heat_base === undefined ? current : Number(c.heat_base);
    const next = Math.min(100, Math.round(base * saveBoost(Number(s.save_count)) * 10) / 10);
    if (next !== current || c.heat_base === null || c.heat_base === undefined) {
      await admin.from("creatives").update({ heat_score: next, heat_base: base }).eq("id", s.creative_id);
      boosted += 1;
    }
  }

  // 7일 지난 완료·실패 job 을 지운다. 놔두면 dedupe 인덱스와 무관하게 표만 부푼다.
  const { count: purged } = await admin
    .from("crawl_jobs")
    .delete({ count: "estimated" })
    .in("state", ["done", "failed"])
    .lt("finished_at", new Date(Date.now() - 7 * 86_400_000).toISOString());

  await admin.from("crawl_runs").insert({
    run_kind: "finalize",
    started_at: started,
    ended_at: new Date().toISOString(),
    note: `thumbs ok=${thumbs.ok} fail=${thumbs.failed} · enrich=${enriched} · boosted=${boosted}${hasHeatBase ? "" : "(heat_base 미적용)"} · visible=${visibleCount ?? "?"}`,
  });

  return NextResponse.json({
    ok: true,
    thumbs,
    enriched,
    embedded,
    visibleIndustries: visibleCount ?? null,
    boosted,
    purgedJobs: purged ?? 0,
  });
}
