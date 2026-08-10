"use server";

import { getAuthUser } from "@/lib/supabase/server";
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
