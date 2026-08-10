-- 0032_lock_pool_functions.sql — 운영 함수 실행 권한 회수 (보안 수정)
--
-- 무엇이 문제였나
-- ------------------------------------------------------------------
-- PostgreSQL 은 새로 만든 함수의 EXECUTE 권한을 기본으로 PUBLIC 에 준다.
-- 0027~0030 에서 표 권한(select/insert/update/delete)은 회수했지만 **함수 권한은
-- 회수하지 않았다.** 그래서 anon 키만 있으면 아래 함수를 직접 호출할 수 있었다.
-- anon 키는 브라우저 번들에 들어가는 공개 값이므로, 사실상 누구나 호출 가능했다.
--
-- 2026-08-11 실측: /rest/v1/rpc/claim_crawl_budget 등 5개 함수가 anon 으로 200 응답.
--
-- 가장 위험한 것은 claim_crawl_budget 이다. 음수를 넣으면 calls_used 가 0 으로
-- 되돌아간다. 즉 **하루 지출 상한을 무제한으로 리셋할 수 있었다** — 이 구조 전체가
-- 기대는 단 하나의 안전장치를 밖에서 풀 수 있었던 셈이다.
-- pick_crawl_jobs 는 작업 큐를 통째로 running 으로 잠글 수 있었고,
-- rollup_industry_stats 는 500만 행 전수 집계라 반복 호출만으로 DB 를 눌러앉힐 수 있었다.
--
-- 고치는 방법
-- ------------------------------------------------------------------
-- PUBLIC 에서 EXECUTE 를 회수하고 service_role 에만 다시 준다.
-- 크론(admin 클라이언트)은 service_role 이라 그대로 동작하고, 브라우저·로그인 사용자는
-- 아예 호출 경로가 사라진다.
--
-- 트리거 함수도 함께 잠근다. 트리거 실행은 EXECUTE 권한을 검사하지 않으므로
-- 저장·수집 동작에는 영향이 없다 — 직접 호출 경로만 닫힌다.

-- 예산·큐 — 여기가 돈과 직결된다
revoke all on function public.claim_crawl_budget(int)   from public, anon, authenticated;
revoke all on function public.claim_ai_budget(int)      from public, anon, authenticated;
revoke all on function public.pick_crawl_jobs(int)      from public, anon, authenticated;
grant execute on function public.claim_crawl_budget(int) to service_role;
grant execute on function public.claim_ai_budget(int)    to service_role;
grant execute on function public.pick_crawl_jobs(int)    to service_role;

-- 집계 — 전수 스캔이라 반복 호출 자체가 공격이 된다
revoke all on function public.rollup_industry_stats()   from public, anon, authenticated;
grant execute on function public.rollup_industry_stats() to service_role;

-- 노출 업종 수 — 값 자체는 민감하지 않지만 비로그인에게 열어둘 이유가 없다
revoke all on function public.visible_industry_count()  from public, anon;
grant execute on function public.visible_industry_count() to service_role, authenticated;

-- 트리거 함수 — 직접 호출 경로만 닫는다. 트리거 동작에는 영향 없음.
revoke all on function public.bump_creative_saves()     from public, anon, authenticated;
revoke all on function public.bump_brand_saves()        from public, anon, authenticated;
revoke all on function public.normalize_thumb_state()   from public, anon, authenticated;
revoke all on function public.merge_creative_tags()     from public, anon, authenticated;

/*
  앞으로 만드는 함수에도 같은 실수가 반복되지 않게 기본값 자체를 바꾼다.
  이 스키마에 새로 생기는 함수는 PUBLIC 에 EXECUTE 가 자동으로 붙지 않는다.
  (기존 함수에는 소급 적용되지 않으므로 위의 개별 revoke 가 여전히 필요하다.)
*/
alter default privileges in schema public revoke execute on functions from public;

-- ────────────────────────────────────────────────────────────────
-- 적용 확인 — 아래 결과 그리드로 0027~0031 이 제대로 들어갔는지 함께 본다
-- ────────────────────────────────────────────────────────────────
select
  (select count(*) from public.industries)                          as "업종 수(23 기대)",
  (select count(*) from public.industry_keywords)                   as "검색어 수(253+ 기대)",
  (select count(*) from public.industry_keywords where origin = 'migrated') as "기존 사용자 검색어",
  (select count(*) from public.brands)                              as "브랜드 수",
  (select count(*) from public.creatives)                           as "소재 수(0 정상)",
  (select count(*) from public.crawl_jobs)                          as "대기 작업(0 정상)",
  (select count(*) from pg_trigger
     where tgrelid = 'public.creatives'::regclass and not tgisinternal) as "creatives 트리거(2 기대)",
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('claim_crawl_budget','claim_ai_budget','pick_crawl_jobs',
                        'rollup_industry_stats','visible_industry_count')
      and has_function_privilege('anon', p.oid, 'execute'))          as "anon 호출 가능 함수(0 이어야 함)";
