"use server";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { logSearch, searchPool, type PoolPlatformFilter, type PoolSort } from "@/lib/pool/search";
import { poolItemToAd, poolItemToReference } from "@/lib/pool/bridge";
import type { ReferenceAd, ReferenceItem } from "@/lib/types";

/*
  공용 풀 검색 서버 액션.

  **여기서 공급사를 호출하지 않는다.** 검색은 순수한 DB 조회다 — 그게 이번 구조 변경의 핵심이다.
  풀에 없는 검색어는 0건으로 돌려주고 search_history 에 남긴다. 그 기록을 플래너가 읽어
  다음 크롤의 최우선 대상으로 올린다(lib/pool/planner.ts). 없다고 그 자리에서 사오지 않는다.

  왜 클라이언트 필터링으로 안 되는가: 풀은 수백만 행이다. 첫 40건만 받아 브라우저에서
  거르면 "검색해도 처음 40건 안에서만 찾는" 가짜 검색이 된다.
*/

export interface PoolSearchInput {
  query: string;
  /** 화면의 검색 대상 탭 값 */
  target: "all" | "instagram" | "tiktok" | "threads" | "ads";
  /** 업종 id 배열 — 라벨이 아니라 id 로 받는다(라벨은 바뀔 수 있다) */
  industryIds: string[];
  sort: "views" | "likes" | "recent" | "posted";
  page: number;
}

export interface PoolSearchOutput {
  items: ReferenceItem[];
  ads: ReferenceAd[];
  total: number;
  hasMore: boolean;
  /** 풀이 이 검색어를 아직 모른다 — 화면이 "수집 예약됨"을 안내하는 신호 */
  isGap: boolean;
}

const EMPTY: PoolSearchOutput = { items: [], ads: [], total: 0, hasMore: false, isGap: false };

/** 화면 정렬 → 풀 정렬. 광고에는 조회·좋아요가 없으므로 집행 기간으로 대체한다. */
function poolSort(sort: PoolSearchInput["sort"], forAds: boolean): PoolSort {
  if (sort === "recent" || sort === "posted") return "recent";
  if (forAds) return "longest";
  return "heat";
}

export async function searchPoolAction(input: PoolSearchInput): Promise<PoolSearchOutput> {
  const user = await getAuthUser();
  if (!user) return EMPTY;

  const q = input.query.trim().slice(0, 60);
  const page = Math.max(0, Math.min(50, input.page));
  // 업종을 여러 개 고른 경우 첫 번째만 서버에 건다. contains 는 AND 라서 여러 개를 걸면
  // "두 업종에 동시에 속한 소재"만 남아 거의 0건이 된다 — 사용자 의도는 OR 다.
  const industryId = input.industryIds[0] ?? null;

  const wantsOrganic = input.target !== "ads";
  const wantsAds = input.target === "all" || input.target === "ads" || input.target === "instagram";

  const [organic, adResult] = await Promise.all([
    wantsOrganic
      ? searchPool({
          q,
          industryId,
          platform: (input.target === "all" ? "all" : input.target) as PoolPlatformFilter,
          sort: poolSort(input.sort, false),
          page,
        })
      : Promise.resolve(null),
    wantsAds
      ? searchPool({
          q,
          industryId,
          platform: "meta_ads",
          sort: poolSort(input.sort, true),
          page,
        })
      : Promise.resolve(null),
  ]);

  // 오가닉 조회는 platform=all 일 때 광고까지 함께 잡히므로 여기서 갈라 준다
  // (두 목록에 같은 소재가 중복으로 뜨는 걸 막는다).
  const items = (organic?.items ?? []).filter((p) => p.kind === "post").map(poolItemToReference);
  const ads = (adResult?.items ?? []).map(poolItemToAd);

  const total = (organic?.total ?? 0) + (adResult?.total ?? 0);
  const found = items.length + ads.length;

  if (q && page === 0) {
    await logSearch(user.id, q, found, industryId, input.target === "ads" ? "meta_ads" : input.target);
  }

  return {
    items,
    ads,
    total,
    hasMore: Boolean(organic?.hasMore || adResult?.hasMore),
    isGap: Boolean(q) && page === 0 && found === 0,
  };
}

/* ────────────────────────────────────────────────────────────────
   쓰기 경로 — 풀이 켜지면 저장·수집 버튼의 대상이 바뀐다.

   이걸 안 하면 조용히 깨진다. 풀이 채워지는 순간 화면에는 풀 소재가 뜨는데
   저장 버튼은 여전히 reference_items 를 찾아가고, 그 표에 그 id 는 없다.
   "지금 수집"도 마찬가지로 개인 표에 쌓기만 해서, 크레딧은 나가는데
   화면에는 아무것도 안 보인다.
──────────────────────────────────────────────────────────────── */

/**
 * 풀 소재 저장 토글. saved_creatives 는 own-row RLS 라 사용자 세션으로 직접 쓴다.
 * 저장 수 집계는 DB 트리거(bump_creative_saves)가 처리하므로 여기서 건드리지 않는다.
 */
export async function togglePoolSave(
  creativeId: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요" };

  const supabase = await createClient();
  if (on) {
    const { error } = await supabase
      .from("saved_creatives")
      .upsert({ user_id: user.id, creative_id: creativeId }, { onConflict: "user_id,creative_id" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("saved_creatives")
      .delete()
      .eq("user_id", user.id)
      .eq("creative_id", creativeId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** 이미 저장한 소재 id — 카드의 북마크 상태를 첫 렌더부터 맞추기 위해 필요하다 */
export async function listPoolSaves(): Promise<string[]> {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_creatives")
    .select("creative_id")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as Array<{ creative_id: string }>).map((r) => String(r.creative_id));
}

/**
 * "지금 수집" 의 풀 버전 — 등록해 둔 기준을 **수집 대기열 최상단으로 올린다.**
 *
 * 공급사를 직접 부르지 않는다. 그러면 사용자 수만큼 원가가 늘던 옛 구조로 되돌아간다.
 * 대신 search_history 에 미적중 기록으로 남긴다 — 플래너가 이미 그 기록을
 * 우선순위 30(전 업종 순환보다 훨씬 위)으로 집어 간다.
 *
 * crawl_jobs 에 직접 넣지 않는 이유: 그 표는 사용자에게 완전히 닫혀 있고, 열어주려면
 * SECURITY DEFINER 함수를 새로 만들어야 한다. 즉 예산을 소모시킬 수 있는 창구를
 * 하나 더 여는 셈이다. search_history 는 own-row RLS 로 이미 안전하게 열려 있고
 * 목적도 정확히 같다 — 새 창구를 만들 이유가 없다.
 */
export async function requestPoolCollect(
  targets: Array<{ value: string; platform: string }>,
): Promise<{ ok: boolean; queued: number; error?: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, queued: 0, error: "로그인이 필요해요" };

  // 한 번에 10개까지. 상한이 없으면 기준을 100개 등록해 두고 버튼을 연타하는 것만으로
  // 하루 예산이 특정 사용자에게 쏠린다.
  const rows = targets
    .map((t) => ({ value: t.value.trim().replace(/^[#@]/, ""), platform: t.platform }))
    .filter((t) => t.value.length >= 2 && t.value.length <= 60)
    .slice(0, 10)
    .map((t) => ({
      user_id: user.id,
      query: t.value,
      hit_count: 0,
      platform: t.platform === "all" ? null : t.platform,
    }));

  if (rows.length === 0) return { ok: false, queued: 0, error: "등록된 수집 기준이 없어요" };

  const supabase = await createClient();
  const { error } = await supabase.from("search_history").insert(rows);
  if (error) return { ok: false, queued: 0, error: error.message };
  return { ok: true, queued: rows.length };
}
