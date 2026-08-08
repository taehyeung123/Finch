import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCollectionConfigured } from "@/lib/reference/scrapecreators";
import {
  acquireCollectLock,
  executeCollection,
  loadCollectSettings,
  releaseCollectLock,
} from "@/lib/reference/engine";
import { isAuthorizedCron } from "@/lib/cron";
import { notifyUser } from "@/lib/notify";

/**
 * 레퍼런스 매일 자동 수집 크론 (매일 06:30 KST, vercel.json).
 *
 * 수집 기준(키워드·계정·해시태그)을 등록해둔 사용자마다 수동 "지금 수집"과 동일한
 * 파이프라인(lib/reference/engine.executeCollection)을 돌린다 — "매일 아침 새 레퍼런스가
 * 자동으로 쌓이는" 경험이 목표. 정책:
 *  - 크레딧·월 한도를 차감하지 않는다(플랜 기본 제공 성격). 대신 저장 상한을 수동(40)의
 *    절반(20)으로 낮춰 공급사·AI 비용을 억제한다.
 *  - 수동 수집과 같은 락(reference_collect_locks)을 공유 — 사용자가 마침 수집 중이면
 *    이번 크론 회차는 그 사용자를 건너뛴다.
 *  - 신규 저장이 있으면 'trend' 알림 1건(중복 방지 20시간) — 아침에 들어올 이유를 만든다.
 *  - 사용자 하나의 실패가 전체를 멈추지 않는다(사용자 단위 try/catch).
 */
export const runtime = "nodejs";
export const maxDuration = 300;

/** 회차당 처리 사용자 상한 — maxDuration 안에서 안전하게 끝나는 규모로 제한 */
const MAX_USERS_PER_RUN = 50;
/** 자동 수집 1회 저장 상한 — 수동(MAX_TOTAL_PER_RUN=40)의 절반 */
const AUTO_MAX_TOTAL = 20;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }
  if (!isCollectionConfigured()) {
    // 공급사 키 미설정 — 자동 수집은 조용히 쉰다 (수동 쪽과 동일한 게이트)
    return NextResponse.json({ ok: true, skipped: "collector_not_configured" });
  }

  // 수집 기준을 하나라도 등록한 사용자 목록 (중복 제거)
  const { data: sourceRows, error: srcErr } = await admin
    .from("reference_sources")
    .select("user_id, id, channel, kind, value")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (srcErr) {
    console.error("[cron:collect] 수집 기준 조회 실패:", srcErr.message);
    return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });
  }

  const sourcesByUser = new Map<string, { id: string; channel: "instagram" | "tiktok" | "threads"; kind: string; value: string }[]>();
  for (const row of sourceRows ?? []) {
    const list = sourcesByUser.get(row.user_id) ?? [];
    list.push({ id: row.id, channel: row.channel, kind: row.kind, value: row.value });
    sourcesByUser.set(row.user_id, list);
  }
  const userIds = [...sourcesByUser.keys()].slice(0, MAX_USERS_PER_RUN);

  let processed = 0;
  let skippedLocked = 0;
  let failedUsers = 0;
  let totalAdded = 0;

  for (const userId of userIds) {
    const lock = await acquireCollectLock(admin, userId);
    if (lock !== "acquired") {
      skippedLocked++;
      continue;
    }
    try {
      const settings = await loadCollectSettings(admin, userId);
      const result = await executeCollection(admin, userId, sourcesByUser.get(userId)!, settings, {
        maxTotal: AUTO_MAX_TOTAL,
      });
      processed++;
      totalAdded += result.added;
      if (result.tableMissing) {
        // 스키마 미적용 — 다른 사용자도 같은 DB이므로 더 돌 이유가 없다
        console.error("[cron:collect] reference_items 미적용 — 회차 중단");
        break;
      }
      if (result.added > 0) {
        await notifyUser(admin, {
          userId,
          type: "trend",
          dedupeMs: 20 * 3_600_000,
          title: "아침 수집으로 새 레퍼런스가 도착했어요",
          body: `등록해둔 기준으로 새 레퍼런스 ${result.added}건을 모았어요. 수집함에서 확인해 보세요.`,
        });
      }
    } catch (e) {
      failedUsers++;
      console.error("[cron:collect] 사용자 수집 실패:", userId, e instanceof Error ? e.message : String(e));
    } finally {
      await releaseCollectLock(admin, userId);
    }
  }

  return NextResponse.json({
    ok: true,
    users: userIds.length,
    processed,
    skippedLocked,
    failedUsers,
    totalAdded,
  });
}
