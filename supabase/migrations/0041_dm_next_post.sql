-- ============================================================================
-- 0041_dm_next_post.sql — "다음 게시물" 예약 자동화와 콘텐츠 한도 트리거 정합
-- ----------------------------------------------------------------------------
-- 2026-08-14: 자동 DM에 리틀리식 "다음에 올릴 게시물 자동화"를 추가했다.
-- 규칙은 post_id = '__next__' 센티널로 저장되고, 새 게시물의 첫 댓글 웹훅에서
-- 실제 media id 로 치환(바인딩)된다.
--
-- 0040 트리거는 이 바인딩(UPDATE of post_id)에서 오작동할 수 있다:
--  - 같은 센티널에 규칙이 여러 개인 사용자의 바인딩에서, 아직 안 바뀐 형제 행의
--    센티널이 별개 콘텐츠로 집계돼 한도 초과로 오판된다.
-- 수정: "변경 후 상태의 distinct 게시물 수"(자기 자신의 새 post_id 포함)로 계산하고,
-- 센티널→실제 id 전환 중에는 형제 센티널 행을 같은 콘텐츠로 취급해 집계에서 뺀다.
-- ============================================================================

create or replace function public.enforce_dm_content_limit()
returns trigger as $$
declare
  v_plan     text;
  v_limit    int;
  v_count    int;
  v_old_post text;
begin
  -- 사용자 단위 직렬화 — 같은 사용자의 동시 규칙 생성/바인딩이 순서대로 검사되게 한다
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':dm_content'));

  select plan into v_plan from public.users_profile where id = new.user_id;
  v_limit := case coalesce(v_plan, 'free')
    when 'creator'    then 5
    when 'pro'        then 20
    when 'agency'     then 100
    when 'enterprise' then 1000000
    else 1
  end;

  v_old_post := case when tg_op = 'UPDATE' then old.post_id else null end;

  -- 변경 후 상태 기준 distinct 게시물 수 = (자기 제외 나머지 규칙들의 게시물 ∪ 새 게시물)
  -- 센티널 바인딩 중(old='__next__')에는 아직 안 바뀐 형제 센티널 행을 같은 콘텐츠로 보고 제외
  select count(distinct p) into v_count
  from (
    select r.post_id as p
    from public.auto_dm_rules r
    where r.user_id = new.user_id
      and r.id <> new.id
      and not (coalesce(v_old_post, '') = '__next__' and r.post_id = '__next__')
    union
    select new.post_id
  ) s;

  if v_count > v_limit then
    raise exception 'dm_content_limit';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 트리거 자체(0040)는 그대로 재사용 — 함수만 교체된다
