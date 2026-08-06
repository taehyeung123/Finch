import "server-only";

import type { CollectSettings, ReferenceSource } from "@/lib/types";
import { PERIOD_DAYS } from "@/lib/types";
import { collectFromSource, type CollectedPost } from "@/lib/reference/scrapecreators";
import { collectIgKeywordViaApify, isApifyConfigured } from "@/lib/reference/apify";

/*
  공급사 라우터 — 수집 기준 하나를 어느 공급사로 보낼지 결정한다.

  - 인스타그램 키워드·해시태그: APIFY_TOKEN 있으면 Apify(후보 풀이 훨씬 큼 — 실측 근거는
    lib/reference/apify.ts 주석), 없으면 ScrapeCreators 폴백.
    단 사진·캐러셀 형식 필터는 두 경로 모두 후처리로 걸러진다.
  - 그 외(틱톡·스레드 전부, 인스타 계정): ScrapeCreators — 실측 품질 문제 없음.
*/
export async function collectForSource(
  source: Pick<ReferenceSource, "channel" | "kind" | "value">,
  limit: number,
  filters: Pick<CollectSettings, "period" | "mediaFormat">,
): Promise<CollectedPost[]> {
  const useApify =
    source.channel === "instagram" &&
    (source.kind === "keyword" || source.kind === "hashtag") &&
    isApifyConfigured();

  if (useApify) {
    return collectIgKeywordViaApify(source.value, PERIOD_DAYS[filters.period], limit);
  }
  return collectFromSource(source, limit, filters);
}
