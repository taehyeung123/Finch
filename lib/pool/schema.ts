import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/*
  0035(hashtags·ai_topic·ai_comment) 적용 여부 프로브 — 프로세스당 한 번만 확인.

  마이그레이션은 사람이 SQL 편집기에서 손으로 넣는다. 코드가 먼저 배포되는 시간이
  반드시 생기므로, 새 컬럼을 참조하는 모든 경로(수집 upsert·검색 SELECT·enrich 쓰기)는
  이 프로브를 거쳐 미적용이면 해당 컬럼 없이 동작해야 한다 — 0034 heat_base 때
  마감 크론이 통째로 죽었던 사고와 같은 유형을 막는 장치다.
*/
let cached: boolean | null = null;
let cachedEmbedding: boolean | null = null;

/** 0036(embedding·match_creatives) 적용 여부 — hasTagColumns 와 같은 규약 */
export async function hasEmbeddingColumn(db: SupabaseClient): Promise<boolean> {
  if (cachedEmbedding !== null) return cachedEmbedding;
  /* 필터 없이 컬럼만 짚는다 — `not null` 조건을 걸면 임베딩이 아직 드문 구간에
     매칭 행을 찾느라 테이블 전체를 순차 스캔한다(HNSW 는 IS NOT NULL 을 못 받친다).
     컬럼이 없으면 이 형태로도 동일하게 42703 이 난다. */
  const { error } = await db.from("creatives").select("embedding").limit(1);
  if (!error) {
    cachedEmbedding = true;
    return true;
  }
  const missing = error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
  if (missing) {
    cachedEmbedding = false;
    console.warn("[pool] 0036 미적용 — 의미 검색 없이 동작합니다:", error.message);
    return false;
  }
  console.warn("[pool] 0036 프로브 일시 오류(캐시 안 함):", error.message);
  return false;
}

export async function hasTagColumns(db: SupabaseClient): Promise<boolean> {
  if (cached !== null) return cached;
  // 세 컬럼을 한 번에 — 0035 를 문장 단위로 일부만 실행한 상태(수동 적용의 현실)도 잡는다
  const { error } = await db.from("creatives").select("hashtags, ai_topic, ai_comment").limit(1);
  if (!error) {
    cached = true;
    return true;
  }
  /* "컬럼 없음"(42703)만 확정 사실로 캐시한다. 네트워크·일시 DB 오류를 false 로
     프로세스 수명 내내 고정하면, 그 사이 적재되는 소재의 해시태그가 조용히
     영구 유실된다(원문 캡션은 저장 안 하므로 소급 불가). 일시 오류는 이번만
     보수적으로 false 를 주고 다음 호출에서 다시 프로브한다. */
  const missing = error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
  if (missing) {
    cached = false;
    console.warn("[pool] 0035 미적용 — hashtags/ai_topic/ai_comment 없이 동작합니다:", error.message);
    return false;
  }
  console.warn("[pool] 0035 프로브 일시 오류(캐시 안 함):", error.message);
  return false;
}
