"use server";

import { listSavedPool } from "@/lib/pool/search";
import { poolItemToAd, poolItemToReference } from "@/lib/pool/bridge";
import { isDemoMode } from "@/lib/supabase/config";
import { referenceAds, referenceItems } from "@/lib/data";
import { listReferenceItems } from "@/lib/actions/reference";
import { SCRAP_PAGE_SIZE, type ScrapEntry } from "./types";

/*
  스크랩 더 보기 — 첫 화면은 서버 컴포넌트가 60건을 내려주고, 그 뒤부터 이 액션이 잇는다.

  60건에서 잘라놓고 끝내면 61번째부터는 "더 있다"는 신호조차 없이 영구히 안 보인다
  (2026-08-15 점검 지적). 저장은 계속 쌓이는데 화면은 못 따라가는 구조였다.
*/
interface ScrapPage {
  entries: ScrapEntry[];
  hasMore: boolean;
  /** 조회 자체가 실패했다 — «0건»과 구분해야 한다 */
  failed?: boolean;
}

export async function loadScrapPage(page: number): Promise<ScrapPage> {
  /* 데모는 **샘플을 보여준다.** 예전엔 여기서 빈 배열을 돌려줘서, 탐색에서 북마크를 누르고
     스크랩으로 오면 「아직 스크랩한 레퍼런스가 없어요 / 북마크를 누르면 여기에 쌓입니다」가 떴다 —
     방금 누른 사람에게는 «내가 저장한 게 사라졌다»로 읽힌다. 화면 맨 위 띠가 「예시 데이터입니다」
     라고 말하는데 이 화면만 예시가 없는 것도 앞뒤가 안 맞았다.
     탐색과 **같은 출처**(@/lib/data 의 favorite=true)를 쓰므로 두 화면이 어긋나지 않는다. */
  if (isDemoMode()) {
    const entries: ScrapEntry[] = [
      ...referenceItems.filter((i) => i.favorite).map((item) => ({ kind: "post" as const, item })),
      ...referenceAds.filter((a) => a.favorite).map((ad) => ({ kind: "ad" as const, ad })),
    ];
    return { entries: page === 0 ? entries : [], hasMore: false };
  }

  const { items, hasMore, failed } = await listSavedPool(Math.max(0, page), SCRAP_PAGE_SIZE);
  const entries: ScrapEntry[] = items.map((p) =>
    p.kind === "ad"
      ? { kind: "ad", ad: poolItemToAd(p) }
      : { kind: "post", item: poolItemToReference(p) },
  );

  /*
    ⚠️ 저장이 **두 표**로 갈린다. 탐색은 공용 풀이 준비됐는지(poolReady)로 갈라
    togglePoolSave → saved_creatives / toggleReferenceFavorite → reference_items.favorite
    로 저장하는데, 이 화면은 saved_creatives 만 읽고 있었다. 풀이 비어 있는 계정(신규가 그렇다)은
    북마크가 전부 개인 표로 들어가 **스크랩에 영영 안 뜬다** — 담을수록 사라지는 화면이 된다.

    두 표를 합치는 게 맞는 수리다. 개인 즐겨찾기는 페이지네이션 대상이 아니라
    첫 장에만 붙인다(수십 건 규모이고, 풀 저장분이 뒤로 이어진다).
  */
  if (page === 0) {
    const favorites = (await listReferenceItems()).filter((i) => i.favorite);
    const seen = new Set(entries.map((e) => (e.kind === "post" ? e.item.id : e.ad.id)));
    for (const item of favorites) {
      if (!seen.has(item.id)) entries.push({ kind: "post", item });
    }
  }

  return { entries, hasMore, failed };
}
