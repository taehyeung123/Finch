import "server-only";

import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/*
  홈 화면 "오늘의 핀치" 브리핑 데이터 — 스니핏 홈 구조(데일리 브리핑 + 아카이빙 현황 +
  검색 유도) 재구현용 (2026-08-14 실측). 조회는 전부 read-only이고 실패해도 홈이
  죽지 않도록 0-안전 폴백을 준다. 데모 모드는 샘플 숫자.
*/

export interface PoolHomeStats {
  /** 최근 3일 공용 풀 신규 수집 소재 수 */
  newCreatives3d: number;
  /** 풀에 등록된 브랜드 수 */
  totalBrands: number;
  /** 최근 7일 소재가 가장 많이 쌓인 브랜드 상위 */
  topBrands: { name: string; count: number }[];
  /** 탐색 검색 유도 칩 — 노출 자격이 있는 업종명 상위 */
  searchChips: string[];
}

const DEMO_STATS: PoolHomeStats = {
  newCreatives3d: 128,
  totalBrands: 46,
  topBrands: [
    { name: "글로우업 뷰티", count: 31 },
    { name: "핏데이 운동복", count: 18 },
  ],
  searchChips: ["뷰티 루틴", "카페 신메뉴", "여름 세일", "운동 브이로그", "신제품 티저", "웨딩 촬영"],
};

const FALLBACK_CHIPS = DEMO_STATS.searchChips;

export async function getPoolHomeStats(): Promise<PoolHomeStats> {
  if (isDemoMode()) return DEMO_STATS;

  try {
    const supabase = await createClient();
    const since3d = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [newCount, brandCount, recentRows, industryRows] = await Promise.all([
      supabase.from("creatives").select("id", { count: "exact", head: true }).gte("created_at", since3d),
      supabase.from("brands").select("id", { count: "exact", head: true }).eq("status", "ok"),
      // 최근 7일 소재의 브랜드 분포 — 상위 산출용 (1000행 상한이면 홈 브리핑엔 충분)
      supabase
        .from("creatives")
        .select("brand_id")
        .gte("created_at", since7d)
        .not("brand_id", "is", null)
        .limit(1000),
      supabase
        .from("industries")
        .select("name_ko")
        .eq("is_visible", true)
        .order("creative_count", { ascending: false })
        .limit(6),
    ]);

    // 브랜드별 집계 → 상위 2개 이름 조회
    const tally = new Map<string, number>();
    for (const r of recentRows.data ?? []) {
      const id = r.brand_id as string;
      tally.set(id, (tally.get(id) ?? 0) + 1);
    }
    const topIds = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    let topBrands: PoolHomeStats["topBrands"] = [];
    if (topIds.length > 0) {
      const { data: brandRows } = await supabase
        .from("brands")
        .select("id, name")
        .in("id", topIds.map(([id]) => id));
      const nameById = new Map((brandRows ?? []).map((b) => [b.id as string, b.name as string]));
      topBrands = topIds
        .map(([id, count]) => ({ name: nameById.get(id) ?? "", count }))
        .filter((b) => b.name);
    }

    const chips = (industryRows.data ?? []).map((r) => r.name_ko as string).filter(Boolean);

    return {
      newCreatives3d: newCount.count ?? 0,
      totalBrands: brandCount.count ?? 0,
      topBrands,
      searchChips: chips.length > 0 ? chips : FALLBACK_CHIPS,
    };
  } catch (e) {
    console.warn("[home] 풀 브리핑 조회 실패(0 폴백):", e instanceof Error ? e.message : String(e));
    return { newCreatives3d: 0, totalBrands: 0, topBrands: [], searchChips: FALLBACK_CHIPS };
  }
}
