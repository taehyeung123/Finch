import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendNotificationEmail } from "@/lib/email/resend";
import { readBudget } from "@/lib/pool/budget";

/*
  운영 경보 — 크롤이 멈췄을 때 사람에게 알린다.

  이게 없으면 공급사 크레딧이 떨어져도 **아무 일도 안 일어난 것처럼 보인다.**
  워커는 402 를 받고 조용히 멈추고, 화면은 어제 데이터를 계속 보여준다.
  며칠 뒤 "왜 새 광고가 안 들어오지?" 하고 알아채는 게 최악의 시나리오다.

  받는 사람은 OWNER_EMAIL 이다. 사용자 알림(notifications)이 아니라 이메일인 이유:
  이건 고객이 아니라 운영자에게 가야 하고, 운영자는 앱에 상시 접속해 있지 않다.

  중복 발송 방지는 crawl_runs 를 그대로 쓴다(별도 표를 만들지 않는다).
  같은 종류 경보가 최근 20시간 안에 있으면 보내지 않는다 — 2시간마다 도는 크론이
  같은 메일을 하루 12통 보내면 그 순간부터 아무도 안 읽는다.
*/

const DEDUPE_MS = 20 * 3_600_000;

export type PoolAlertKind = "credits_exhausted" | "budget_exhausted";

const COPY: Record<PoolAlertKind, { title: string; body: (extra: string) => string }> = {
  credits_exhausted: {
    title: "레퍼런스 수집이 멈췄어요 — 공급사 크레딧 소진",
    body: (extra) =>
      `데이터 공급사(ScrapeCreators) 크레딧이 모두 소진돼 자동 수집이 멈췄습니다. ` +
      `크레딧을 채우면 다음 회차부터 자동으로 다시 시작합니다 — 따로 켜실 것은 없습니다. ` +
      `대기 중인 작업은 그대로 남아 있어 유실은 없습니다.<br><br>${extra}`,
  },
  budget_exhausted: {
    title: "오늘 수집 예산을 다 썼어요",
    body: (extra) =>
      `설정해 둔 하루 상한(crawl_budget.calls_limit)에 도달해 오늘 수집을 멈췄습니다. ` +
      `내일 자동으로 재개됩니다. 더 빨리 채우고 싶으시면 상한을 올리시면 됩니다.<br><br>${extra}`,
  },
};

/**
 * 경보를 보낸다. 이미 최근에 같은 경보를 보냈으면 아무것도 하지 않는다.
 * @returns 실제로 발송했으면 true
 */
export async function alertPool(db: SupabaseClient, kind: PoolAlertKind): Promise<boolean> {
  const runKind = `alert:${kind}`;

  const { data: recent } = await db
    .from("crawl_runs")
    .select("id")
    .eq("run_kind", runKind)
    .gte("started_at", new Date(Date.now() - DEDUPE_MS).toISOString())
    .limit(1);
  if (recent && recent.length > 0) return false;

  // 경보 기록은 메일 발송보다 **먼저** 남긴다. 메일이 실패했다고 매 회차 다시 시도하면
  // 공급사가 살아난 뒤에도 경보가 계속 쌓인다.
  await db.from("crawl_runs").insert({ run_kind: runKind, note: kind });

  const to = process.env.OWNER_EMAIL;
  if (!to) {
    console.warn(`[pool] 경보(${kind}) 발생했으나 OWNER_EMAIL 미설정 — 메일을 보내지 못했습니다`);
    return false;
  }

  const budget = await readBudget();
  const extra = budget
    ? `오늘 사용: ${budget.callsUsed} / ${budget.callsLimit}회`
    : "예산 정보를 읽지 못했습니다.";

  const copy = COPY[kind];
  return sendNotificationEmail(to, copy.title, copy.body(extra));
}
