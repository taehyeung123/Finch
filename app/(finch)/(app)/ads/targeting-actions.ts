"use server";

import { getAdsWriteContext } from "@/lib/data/ads";
import { buildTargeting, parseTargetingInput, type GeoRegion } from "@/lib/ads/adset-rules";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";
import { writeErrorCode, type AdAccountUsage, type AdsWriteError } from "@/lib/meta/ads-write";
import { estimateReach, searchAdInterests, searchAdRegions, type FbInterestHit } from "@/lib/meta/ads-targeting";

/**
 * 타겟팅 검색·도달 추정 서버 액션 — 2단계 슬라이스 4.
 *
 * - 토큰은 여기서만 산다. 반환값에는 검색 결과와 «잠시 쉬어야 할 초»만 있다.
 * - 쓰기 컨텍스트(getAdsWriteContext)를 그대로 쓴다: 마법사 안에서만 불리고, viewer·미동의·만료는 같은 이유로 막는다.
 * - 결과를 DB 에 넣지 않는다. 세션 캐시는 클라이언트(use-remote-search)가 든다.
 * - «읽기도 점수를 쓴다»(§13-17): 응답 usage 가 70% 를 넘으면 pauseSeconds 를 실어 클라이언트가 잠시 검색을 멈춘다.
 */

const QUERY_MIN = 2;
const QUERY_MAX = 60;
const PAUSE_UTIL_PCT = 70;
const PAUSE_SECONDS = 60;

export type TargetingActionFail = { ok: false; code: AdsWriteFailCode };

function cleanQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim().replace(/\s+/g, " ");
  if (q.length < QUERY_MIN || q.length > QUERY_MAX) return null;
  for (let i = 0; i < q.length; i++) {
    const c = q.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }
  return q;
}

function pauseFor(usage: AdAccountUsage | null): number {
  if (!usage || usage.utilPct === null || usage.utilPct < PAUSE_UTIL_PCT) return 0;
  return Math.max(PAUSE_SECONDS, usage.resetSeconds ?? 0);
}

/** 읽기 실패의 사용자 코드 — 토큰·권한은 그대로 말하고, 나머지는 «확인 못 함»(«없음»이 아니다) */
function readFailCode(e: AdsWriteError): AdsWriteFailCode {
  if (e.rateLimited) return "search_paused";
  const c = writeErrorCode(e);
  if (c === "token_expired") return c;
  /* 검색은 쓰기가 아니다 — «쓰기 권한 없음» 대신 «관리 권한 없음(재연동)»으로 */
  if (c === "write_denied") return "scope_missing";
  return "search_unverified";
}

type ReadCtx = { ok: true; token: string; adAccountId: string } | TargetingActionFail;
async function readCtx(): Promise<ReadCtx> {
  const ctx = await getAdsWriteContext();
  if (ctx.state === "blocked") return { ok: false, code: ctx.code };
  return { ok: true, token: ctx.accessToken, adAccountId: ctx.adAccountId };
}

/* ── 시·도 검색 ─────────────────────────────────────────────── */

export type SearchRegionsResult = { ok: true; regions: GeoRegion[]; pauseSeconds: number } | TargetingActionFail;

export async function searchAdRegionsAction(rawQuery: string): Promise<SearchRegionsResult> {
  const q = cleanQuery(rawQuery);
  if (!q) return { ok: false, code: "invalid_request" };
  const c = await readCtx();
  if (!c.ok) return c;
  const res = await searchAdRegions(q, c.token);
  if (!res.ok) return { ok: false, code: readFailCode(res.error) };
  return {
    ok: true,
    regions: res.data.map((r) => ({ key: r.key, name: r.name })),
    pauseSeconds: pauseFor(res.usage),
  };
}

/* ── 관심사 검색 ────────────────────────────────────────────── */

export type InterestHit = FbInterestHit;
export type SearchInterestsResult = { ok: true; interests: InterestHit[]; pauseSeconds: number } | TargetingActionFail;

export async function searchAdInterestsAction(rawQuery: string): Promise<SearchInterestsResult> {
  const q = cleanQuery(rawQuery);
  if (!q) return { ok: false, code: "invalid_request" };
  const c = await readCtx();
  if (!c.ok) return c;
  const res = await searchAdInterests(q, c.token);
  if (!res.ok) return { ok: false, code: readFailCode(res.error) };
  return { ok: true, interests: res.data, pauseSeconds: pauseFor(res.usage) };
}

/* ── 예상 도달 ──────────────────────────────────────────────── */

export type ReachEstimateResult =
  | {
      ok: true;
      lower: number;
      upper: number;
      /** nationwide = 시·도만 보낸 추정이 안 나와 **전국 기준 상한**을 대신 준 것(§13-23) — 화면이 그렇게 말한다 */
      basis: "targeting" | "nationwide";
    }
  | TargetingActionFail;

function usable(d: { ready: boolean; lower: number | null; upper: number | null }): d is { ready: true; lower: number; upper: number } {
  /* 0 은 보여 주지 않는다 — «너무 좁음» 판정을 우리가 만들지 않는다(§1.2). 숨긴다 */
  return d.ready && d.lower !== null && d.upper !== null && d.lower > 0 && d.upper >= d.lower;
}

export async function estimateReachAction(rawTargeting: unknown): Promise<ReachEstimateResult> {
  const input = parseTargetingInput(rawTargeting);
  if (!input) return { ok: false, code: "invalid_request" };
  const c = await readCtx();
  if (!c.ok) return c;

  const first = await estimateReach(c.adAccountId, buildTargeting(input), c.token);
  if (first.ok && usable(first.data)) {
    return { ok: true, lower: first.data.lower, upper: first.data.upper, basis: "targeting" };
  }
  if (!first.ok && first.error.rateLimited) return { ok: false, code: "search_paused" };
  if (!first.ok && writeErrorCode(first.error) === "token_expired") return { ok: false, code: "token_expired" };

  /* 시·도만 보낸 요청이 «국가 필수»에 걸릴 수 있다(§13-23) — 전국 기준으로 한 번 더 묻고, 그렇게 말한다 */
  if (input.geo.mode === "regions") {
    const second = await estimateReach(c.adAccountId, buildTargeting({ ...input, geo: { mode: "country" } }), c.token);
    if (second.ok && usable(second.data)) {
      return { ok: true, lower: second.data.lower, upper: second.data.upper, basis: "nationwide" };
    }
  }
  return { ok: false, code: "estimate_unavailable" };
}
