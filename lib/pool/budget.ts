import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/*
  예산 게이트 — 공용 풀에서 돈이 나가는 **유일한 문**.

  왜 코드가 아니라 DB 함수인가:
  크론은 동시에 두 번 뜰 수 있고(재시도·수동 트리거), 서버리스 인스턴스는 여러 개다.
  자바스크립트 쪽에서 카운터를 세면 두 인스턴스가 같은 잔량을 읽고 둘 다 통과시킨다.
  claim_crawl_budget() 는 UPDATE ... RETURNING 한 문장이라 원자적이다 —
  1만 명이 쓰든 크론이 폭주하든 하루 지출은 calls_limit 을 못 넘는다.

  사용 규칙: **호출 전에 청구한다.** 성공하고 나서 깎으면 실패한 호출이 공짜가 되어
  공급사에는 과금됐는데 우리 장부에는 안 잡힌다.
*/

/** 하루 공급사 호출 상한의 기본값. DB 의 crawl_budget.calls_limit 이 실제 값이다. */
export const DEFAULT_DAILY_CALLS = 420;

export interface BudgetStatus {
  callsLimit: number;
  callsUsed: number;
  aiItemsLimit: number;
  aiItemsUsed: number;
}

/**
 * 공급사 호출 n 회를 미리 청구한다.
 * @returns 실제로 허용된 횟수. 잔량이 모자라면 남은 만큼만(부분 허용), 0이면 즉시 중단해야 한다.
 */
export async function claimCalls(n: number): Promise<number> {
  if (n <= 0) return 0;
  const db = createAdminClient();
  if (!db) return 0; // 서비스 키 미설정 = 크롤 비활성. 데모 모드에서 조용히 멈춘다.
  const { data, error } = await db.rpc("claim_crawl_budget", { p_calls: n });
  if (error) {
    console.error("[pool] 예산 청구 실패", error.message);
    return 0; // 실패 시 0 — 못 세면 안 쓴다 (fail-closed)
  }
  return typeof data === "number" ? data : 0;
}

/** AI enrich 대상 소재 수를 미리 청구한다. 크레딧이 아니라 "건수" 단위다. */
export async function claimAiItems(n: number): Promise<number> {
  if (n <= 0) return 0;
  const db = createAdminClient();
  if (!db) return 0;
  const { data, error } = await db.rpc("claim_ai_budget", { p_items: n });
  if (error) {
    console.error("[pool] AI 예산 청구 실패", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/**
 * 청구했는데 못 쓴 호출을 되돌린다 (공급사 오류로 조기 종료한 경우).
 * 음수 청구로 처리한다 — 별도 함수를 만들면 반환 경로만 원자성이 깨진다.
 */
export async function refundCalls(n: number): Promise<void> {
  if (n <= 0) return;
  const db = createAdminClient();
  if (!db) return;
  await db.rpc("claim_crawl_budget", { p_calls: -n });
}

/** 청구했는데 AI 호출이 통째로 실패한 건수를 되돌린다 (refundCalls 와 동일 규약). */
export async function refundAiItems(n: number): Promise<void> {
  if (n <= 0) return;
  const db = createAdminClient();
  if (!db) return;
  await db.rpc("claim_ai_budget", { p_items: -n });
}

export async function readBudget(): Promise<BudgetStatus | null> {
  const db = createAdminClient();
  if (!db) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("crawl_budget")
    .select("calls_limit, calls_used, ai_items_limit, ai_items_used")
    .eq("day", today)
    .maybeSingle();
  if (!data) {
    return {
      callsLimit: DEFAULT_DAILY_CALLS,
      callsUsed: 0,
      aiItemsLimit: 1200,
      aiItemsUsed: 0,
    };
  }
  return {
    callsLimit: data.calls_limit as number,
    callsUsed: data.calls_used as number,
    aiItemsLimit: data.ai_items_limit as number,
    aiItemsUsed: data.ai_items_used as number,
  };
}
