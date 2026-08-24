-- 0060: 프로필 링크 멀티 페이지 + 서브 페이지 (2026-08-24 사장님 지시 "멀티 서브 전부 진행, 무료1 유료3")
--
-- 설계:
--  · 0045 가 예고한 대로 user_id unique 만 떼면 나머지 자식 표·RLS 는 전부 page_id 기준이라 그대로 동작한다(감사 확인).
--  · 서브 페이지 = link_pages 행 + parent_id/sub_slug. 전역 slug 도 그대로 가진다(자동 발급) —
--    기존 방문자 경로(/go·/vcard·잠금·집계)가 슬러그 기반이라 서브도 공짜로 전부 얻는다.
--    공개 주소는 /p/{부모slug}/{sub_slug} (라우트가 부모+세그먼트로 자식 slug 를 찾아 같은 렌더러를 태운다).
--  · 페이지 수 상한(메인+서브 합산): 무료 1 · 유료 3 — JS 카운터 금지 원칙대로 DB 트리거가 최종 관문.
--    숫자는 아래 함수의 case 한 곳에만 있다(정책 바뀌면 여기만).

-- ① 사용자당 1페이지 제약 해제 (0045:21)
alter table public.link_pages drop constraint if exists link_pages_user_id_key;
create index if not exists idx_link_pages_user on public.link_pages(user_id);

-- ② 서브 페이지 컬럼
alter table public.link_pages
  add column if not exists parent_id uuid references public.link_pages(id) on delete cascade,
  add column if not exists sub_slug  text;

-- 메인은 세그먼트 없음, 서브는 소문자·숫자·하이픈 1~40자
alter table public.link_pages drop constraint if exists link_pages_sub_shape;
alter table public.link_pages add constraint link_pages_sub_shape check (
  (parent_id is null and sub_slug is null)
  or (parent_id is not null and sub_slug ~ '^[a-z0-9][a-z0-9-]{0,39}$')
);
-- 같은 부모 아래 세그먼트 중복 금지
create unique index if not exists uq_link_pages_parent_sub
  on public.link_pages(parent_id, sub_slug) where parent_id is not null;

-- 방문자(anon)가 부모+세그먼트로 자식을 찾을 수 있게 — RLS 는 여전히 발행된 행만 보여준다(0059 anon 정책)
grant select (parent_id, sub_slug) on public.link_pages to anon, authenticated;

-- ③ 페이지 수 상한 + 서브 구조 검사 — insert 관문
--    security definer: users_profile(남의 행)·부모 행을 RLS 무관하게 읽어야 한다. 검사만 하고 아무것도 쓰지 않는다.
create or replace function public.link_pages_guard_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limit  int;
  v_count  int;
  v_parent record;
begin
  if new.parent_id is not null then
    select user_id, parent_id into v_parent from link_pages where id = new.parent_id;
    if not found then
      raise exception '부모 페이지를 찾을 수 없어요.' using errcode = 'check_violation';
    end if;
    if v_parent.parent_id is not null then
      raise exception '서브 페이지 아래에는 또 페이지를 만들 수 없어요.' using errcode = 'check_violation';
    end if;
    if v_parent.user_id is distinct from new.user_id then
      raise exception '내 페이지 아래에만 서브 페이지를 만들 수 있어요.' using errcode = 'check_violation';
    end if;
    -- /p/{slug}/{여기} 가 기존 라우트와 겹치면 영영 열 수 없는 주소가 된다
    if new.sub_slug in ('go', 'vcard', 'dwell', 's', 'p', 'api') then
      raise exception '쓸 수 없는 서브 주소예요.' using errcode = 'check_violation';
    end if;
  end if;

  select plan into v_plan from users_profile where id = new.user_id;
  v_limit := case when coalesce(v_plan, 'free') = 'free' then 1 else 3 end;
  select count(*) into v_count from link_pages where user_id = new.user_id;
  if v_count >= v_limit then
    raise exception '페이지는 최대 %개까지 만들 수 있어요. 플랜을 올리면 늘어나요.', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.link_pages_guard_count() from public, anon, authenticated;

drop trigger if exists trg_link_pages_guard_count on public.link_pages;
create trigger trg_link_pages_guard_count
  before insert on public.link_pages
  for each row execute function public.link_pages_guard_count();

-- ④ settings 원자 패치를 페이지 단위로 — 0059 의 user_id 판은 페이지가 2장이 되는 순간
--    모든 페이지를 한꺼번에 덮어쓴다(감사4 조사에서 확인). 옛 시그니처는 지운다.
drop function if exists public.link_pages_patch_settings(jsonb);
create or replace function public.link_pages_patch_settings(p_page uuid, p_patch jsonb)
returns jsonb
language sql
security invoker
volatile
set search_path = public
as $$
  update public.link_pages
     set settings = coalesce(settings, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = p_page and user_id = auth.uid()
  returning settings;
$$;
revoke execute on function public.link_pages_patch_settings(uuid, jsonb) from public, anon;
grant execute on function public.link_pages_patch_settings(uuid, jsonb) to authenticated;
