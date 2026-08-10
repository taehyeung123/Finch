import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillThumbs } from "@/lib/pool/thumbs";

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
export const maxDuration = 300;

const THUMBS_PER_RUN = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("not_configured", { status: 503 });

  const started = new Date().toISOString();
  const thumbs = await fillThumbs(THUMBS_PER_RUN);

  const { error: rollupErr } = await admin.rpc("rollup_industry_stats");
  if (rollupErr) console.error("[pool] 업종 롤업 실패", rollupErr.message);

  const { data: visibleCount } = await admin.rpc("visible_industry_count");

  // 저장 수 반영 — 담아간 소재를 상단으로. 상한 300건은 매 회차 조금씩 밀어올리는 수준이다.
  let boosted = 0;
  const { data: hot } = await admin
    .from("creative_stats")
    .select("creative_id, save_count")
    .gt("save_count", 0)
    .order("save_count", { ascending: false })
    .limit(300);
  for (const s of hot ?? []) {
    const { data: c } = await admin
      .from("creatives")
      .select("heat_score")
      .eq("id", s.creative_id)
      .maybeSingle();
    if (!c) continue;
    const base = Number(c.heat_score ?? 0);
    const next = Math.min(100, Math.round(base * (1 + Math.min(0.35, Number(s.save_count) * 0.02)) * 10) / 10);
    if (next !== base) {
      await admin.from("creatives").update({ heat_score: next }).eq("id", s.creative_id);
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
    note: `thumbs ok=${thumbs.ok} fail=${thumbs.failed} · boosted=${boosted} · visible=${visibleCount ?? "?"}`,
  });

  return NextResponse.json({
    ok: true,
    thumbs,
    visibleIndustries: visibleCount ?? null,
    boosted,
    purgedJobs: purged ?? 0,
  });
}
