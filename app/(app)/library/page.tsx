import { isDemoMode } from "@/lib/supabase/config";
import {
  referenceSources as mockSources,
  referenceItems as mockItems,
  adSources as mockAdSources,
  referenceAds as mockAds,
} from "@/lib/data";
import { getCollectSettings, listReferenceItems, listReferenceSources } from "@/lib/actions/reference";
import { listAdSources, listReferenceAds } from "@/lib/actions/ads-reference";
import { loadPoolFeed } from "@/lib/pool/bridge";
import { listPoolSaves } from "./pool-actions";
import { DEFAULT_COLLECT_SETTINGS } from "@/lib/types";
import { LibraryClient } from "./_components/library-client";

/*
  레퍼런스 검색 — 서버에서 검색 대상과 설정을 조회해 클라이언트에 전달.

  데이터 출처가 둘이고, **풀이 우선**이다.
   1) 공용 풀(0027~0030): 중앙에서 한 번 수집해 전원이 검색한다. 검색은 DB 조회라 원가 0.
   2) 개인 수집분(reference_items/reference_ads): 사용자가 "지금 수집"으로 직접 모은 것.

  풀에 내용이 있으면 풀을 보여주고, 아직 비었으면(마이그레이션 직후·첫 크롤 전) 개인
  수집분으로 자동 후퇴한다. 스위치를 사람이 켜지 않는 이유는, 켜는 걸 잊으면
  "마이그레이션은 됐는데 화면은 옛 데이터"인 상태가 조용히 유지되기 때문이다.
*/
/* 수집(공급사 런 대기 포함)이 60초를 넘을 수 있어 서버 액션 실행 상한을 올린다 — 플랜 상한 내에서 적용 */
export const maxDuration = 300;

export default async function LibraryPage() {
  const isDemo = isDemoMode();
  const [sources, ownItems, settings, adSources, ownAds, pool, poolSavedIds] = isDemo
    ? [mockSources, mockItems, DEFAULT_COLLECT_SETTINGS, mockAdSources, mockAds, null, []]
    : await Promise.all([
        listReferenceSources().then((s) => s ?? []),
        listReferenceItems(),
        getCollectSettings(),
        listAdSources().then((s) => s ?? []),
        listReferenceAds(),
        loadPoolFeed().catch(() => null),
        listPoolSaves().catch(() => []),
      ]);

  const items = pool?.ready ? pool.items : ownItems;
  const ads = pool?.ready ? pool.ads : ownAds;

  /* 업종 목록은 서버에서 내려주지 않는다. 화면이 lib/industry/list.ts 의 고정 목록을
     그대로 그린다 — 스니핏처럼 언제 들어와도 같은 목록이 같은 자리에 있어야 한다. */

  return (
    <LibraryClient
      sources={sources}
      items={items}
      settings={settings}
      adSources={adSources}
      ads={ads}
      poolReady={Boolean(pool?.ready)}
      poolSavedIds={poolSavedIds}
      isDemo={isDemo}
    />
  );
}
