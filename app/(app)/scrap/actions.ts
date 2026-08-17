"use server";

import { listSavedPool } from "@/lib/pool/search";
import { poolItemToAd, poolItemToReference } from "@/lib/pool/bridge";
import { isDemoMode } from "@/lib/supabase/config";
import { SCRAP_PAGE_SIZE, type ScrapEntry } from "./types";

/*
  스크랩 더 보기 — 첫 화면은 서버 컴포넌트가 60건을 내려주고, 그 뒤부터 이 액션이 잇는다.

  60건에서 잘라놓고 끝내면 61번째부터는 "더 있다"는 신호조차 없이 영구히 안 보인다
  (2026-08-15 점검 지적). 저장은 계속 쌓이는데 화면은 못 따라가는 구조였다.
*/
interface ScrapPage {
  entries: ScrapEntry[];
  hasMore: boolean;
}

export async function loadScrapPage(page: number): Promise<ScrapPage> {
  if (isDemoMode()) return { entries: [], hasMore: false };

  const { items, hasMore } = await listSavedPool(Math.max(0, page), SCRAP_PAGE_SIZE);
  const entries: ScrapEntry[] = items.map((p) =>
    p.kind === "ad"
      ? { kind: "ad", ad: poolItemToAd(p) }
      : { kind: "post", item: poolItemToReference(p) },
  );
  return { entries, hasMore };
}
