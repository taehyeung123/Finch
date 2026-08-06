import "server-only";

import type { CollectSettings, ReferenceSource } from "@/lib/types";
import { collectFromSource, type CollectedPost } from "@/lib/reference/scrapecreators";

/*
  공급사 라우터 — 수집 기준 하나를 어느 공급사로 보낼지 결정한다.

  실측 결론(2026-08-06, '웨딩'):
  - Apify IG 경로는 전부 무효 — 해시태그 검색은 구글 경유라 한글 키워드가 깨지고,
    해시태그 피드는 최신글만(인기 게시물은 로그인 장벽), popular 검색은 차단됨.
    어댑터(lib/reference/apify.ts)는 향후 계정 모니터링용으로 보류.
  - 품질 격차의 실제 해법은 "AI 확장 검색어"였다: 원 키워드 + 연관 검색어를 병렬
    검색하면 후보 풀에 100만+ 바이럴이 들어온다(같은 실측에서 최고 986만 뷰 확인).
    확장은 액션 계층(Claude)이 만들어 filters.queryVariants로 내려보낸다.
*/
export async function collectForSource(
  source: Pick<ReferenceSource, "channel" | "kind" | "value">,
  limit: number,
  filters: Pick<CollectSettings, "period" | "mediaFormat"> & { queryVariants?: string[] },
): Promise<CollectedPost[]> {
  return collectFromSource(source, limit, filters);
}
