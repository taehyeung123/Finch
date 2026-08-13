-- 0036: 의미(임베딩) 검색 — 스니핏의 image_description 검색과 같은 계열 (2026-08-13 실측·지시)
--
-- 배경: 풀 검색이 글자 일치(ilike)뿐이라 "휘낭시에" 같은 롱테일 검색어는 캡션에
-- 그 글자가 없으면 0건이었다. 스니핏 실측 결과 걔들도 실시간 수집이 아니라
-- **사전 수집 풀 + 의미 검색**으로 롱테일을 덮는다. 같은 방식을 붙인다:
-- 소재마다 임베딩(Upstage Solar Embedding 2, 1024차원)을 저장하고
-- 검색어와 벡터 유사도로 매칭한다. 원가 구조(사용자 수와 분리)는 그대로다 —
-- 임베딩은 소재당 1회(태깅 배치에 편승), 검색어 임베딩은 건당 ~0원.

create extension if not exists vector;

alter table public.creatives
  add column if not exists embedding vector(1024);

-- HNSW 코사인 인덱스 — 수십만 행까지 조회 수 ms 대
create index if not exists idx_creatives_embedding
  on public.creatives using hnsw (embedding vector_cosine_ops);

-- 의미 검색 RPC — 필터는 검색 경로와 동일한 축(kind/platform/업종)만.
-- SECURITY INVOKER(기본)라 creatives 의 RLS(takedown 숨김)가 호출자 기준으로 적용되지만,
-- 방어적으로 takedown 조건을 한 번 더 건다.
create or replace function public.match_creatives(
  query_embedding vector(1024),
  match_count int default 60,
  p_kind text default null,
  p_platform text default null,
  p_industry text default null
) returns table (id uuid, similarity double precision)
language sql stable as $$
  select c.id, 1 - (c.embedding <=> query_embedding) as similarity
  from public.creatives c
  where c.embedding is not null
    and c.takedown_at is null
    and (p_kind is null or c.kind = p_kind)
    and (p_platform is null or c.platform = p_platform)
    and (p_industry is null or c.industry_ids @> array[p_industry])
  order by c.embedding <=> query_embedding
  limit least(match_count, 200);
$$;

/* HNSW 근사 스캔은 기본 ef_search(40)개 후보만 뽑고 WHERE 필터는 그 **뒤에** 적용된다.
   그대로 두면 limit 200 이 허상이 된다 — 광고 탭+업종 필터처럼 선택적인 조건이 겹치면
   40개 후보가 필터에 다 깎여 의미 검색이 조용히 0건에 수렴한다(리뷰 확정 결함).
   함수에만 ef_search 를 올려 후보 풀을 limit 이상으로 키운다. 다른 쿼리엔 영향 없음. */
alter function public.match_creatives(vector, int, text, text, text) set hnsw.ef_search = 200;

-- 실행 권한: 로그인 사용자만. anon 에 열면 봇이 벡터 조회를 무한정 돌릴 수 있다.
revoke execute on function public.match_creatives(vector, int, text, text, text) from public, anon;
grant execute on function public.match_creatives(vector, int, text, text, text) to authenticated, service_role;

-- 확인
select
  count(*) filter (where embedding is not null) as embedded,
  count(*) as total
from public.creatives;
