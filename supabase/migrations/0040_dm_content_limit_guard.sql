-- ============================================================================
-- 0040_dm_content_limit_guard.sql — 자동화 콘텐츠 개수 한도 DB 백스톱
-- ----------------------------------------------------------------------------
-- 앱(actions.ts checkContentLimit)의 검사-후-쓰기에는 원자성이 없어, 동시 요청
-- 두 건이 서로 다른 새 게시물로 들어오면 둘 다 통과해 무료(1개) 한도를 우회할 수
-- 있었다(2026-08-14 멀티에이전트 리뷰 확정, TOCTOU). PostgREST 기본 1000행 조회
-- 상한 때문에 규칙이 아주 많은 계정에서 distinct 집계가 과소평가되는 문제도 같다.
--
-- 이 트리거가 DB에서 원자적으로 막는다:
--  - 사용자별 advisory xact lock으로 동시 insert를 직렬화 (레이스 봉쇄)
--  - 이미 자동화된 게시물에 규칙 추가는 콘텐츠 수 불변이라 통과
--  - 새 게시물인데 distinct post_id 수가 플랜 한도 이상이면 예외 'dm_content_limit'
--    (앱은 이 메시지를 잡아 업그레이드 안내로 바꾼다)
--
-- 한도 값은 lib/auto-dm/limits.ts의 PLAN_DM_CONTENT_LIMITS와 반드시 함께 고칠 것.
-- ============================================================================

create or replace function public.enforce_dm_content_limit()
returns trigger as $$
declare
  v_plan  text;
  v_limit int;
  v_count int;
begin
  -- 사용자 단위 직렬화 — 같은 사용자의 동시 규칙 생성이 순서대로 검사되게 한다
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':dm_content'));

  select plan into v_plan from public.users_profile where id = new.user_id;
  v_limit := case coalesce(v_plan, 'free')
    when 'creator'    then 5
    when 'pro'        then 20
    when 'agency'     then 100
    when 'enterprise' then 1000000
    else 1
  end;

  -- 이미 자동화된 게시물이면 콘텐츠 수가 늘지 않는다 — 허용
  if exists (
    select 1 from public.auto_dm_rules r
    where r.user_id = new.user_id and r.post_id = new.post_id and r.id <> new.id
  ) then
    return new;
  end if;

  select count(distinct r.post_id) into v_count
  from public.auto_dm_rules r
  where r.user_id = new.user_id and r.id <> new.id;

  if v_count >= v_limit then
    raise exception 'dm_content_limit';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_dm_content_limit on public.auto_dm_rules;
create trigger trg_dm_content_limit
  before insert or update of post_id on public.auto_dm_rules
  for each row execute function public.enforce_dm_content_limit();
