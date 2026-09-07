-- 0086_guard_page_reparent_and_write_log.sql — «행을 남의 것으로 옮기기» 두 곳 차단
--
-- 종합 보안 감사(2026-09-07) High + Medium. 두 결함의 모양이 똑같다:
-- INSERT 는 검사하는데 **UPDATE 로 같은 일을 하면 검사가 없다.**
--
-- ────────────────────────────────────────────────────────────────
-- ① [High] link_pages.parent_id 를 UPDATE 로 남의 페이지에 붙일 수 있다
-- ────────────────────────────────────────────────────────────────
-- 0060 의 link_pages_guard_count() 함수는 정확히 이 공격을 막는 검사를 갖고 있다
-- (`if v_parent.user_id is distinct from new.user_id then raise …`). 그런데 트리거가
-- `before insert on public.link_pages` — **INSERT 에만** 걸려 있다.
--
-- 그래서 내 페이지 한 장을 만든 뒤 PATCH 한 번이면 되었다:
--   PATCH /rest/v1/link_pages?id=eq.<내 페이지>  { "parent_id": "<피해자 페이지>", "sub_slug": "pay" }
-- RLS «own pages update» 는 «내 행인가»만 보므로 통과한다. 결과:
--   · 피해자의 공개 주소 아래(finch.ai.kr/{피해자}/pay)에 **공격자가 만든 페이지**가 뜬다.
--     방문자에게는 피해자 도메인 경로라 신뢰가 그대로 넘어간다 — 결제 유도·리드 수집이 그대로 먹힌다
--     (문의 폼으로 방문자 이름·이메일·전화가 공격자 워크스페이스로 들어간다).
--   · 피해자는 그 행을 RLS 로 **볼 수도 지울 수도 없다.**
--   · uq_link_pages_parent_sub 를 선점당해 피해자가 그 이름의 서브 페이지를 영영 못 만든다(23505).
--
-- 고치는 방법: 같은 함수를 UPDATE 에도 건다. 단, «페이지 수 상한» 부분은 UPDATE 에서 다시 세면
-- 자기 자신을 세어 **항상 초과**가 되므로 tg_op 로 갈라 준다.
--
-- ⚠️ 배포 전에 이미 심어진 교차 소유 행이 있는지 한 번 본다 — 맨 아래 확인 쿼리 ①.
--    (있으면 parent_id 를 null 로 되돌리고 주인에게 알린 뒤 이 트리거를 건다.)

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
    -- 자기 자신을 부모로 삼는 순환 — UPDATE 경로에서만 생길 수 있다
    if new.parent_id = new.id then
      raise exception '페이지를 자기 자신 아래에 둘 수 없어요.' using errcode = 'check_violation';
    end if;
    select user_id, parent_id into v_parent from link_pages where id = new.parent_id;
    if not found then
      raise exception '부모 페이지를 찾을 수 없어요.' using errcode = 'check_violation';
    end if;
    if v_parent.parent_id is not null then
      raise exception '서브 페이지 아래에는 또 페이지를 만들 수 없어요.' using errcode = 'check_violation';
    end if;
    -- ★ 이 줄이 위 공격을 막는다. 0060 에도 있었지만 INSERT 에만 걸려 있었다.
    if v_parent.user_id is distinct from new.user_id then
      raise exception '내 페이지 아래에만 서브 페이지를 만들 수 있어요.' using errcode = 'check_violation';
    end if;
    -- /p/{slug}/{여기} 가 기존 라우트와 겹치면 영영 열 수 없는 주소가 된다
    if new.sub_slug in ('go', 'vcard', 'dwell', 's', 'p', 'api') then
      raise exception '쓸 수 없는 서브 주소예요.' using errcode = 'check_violation';
    end if;
    -- 이 페이지를 부모로 삼은 자식이 있으면 2단이 된다 — UPDATE 경로에서만 생길 수 있다
    if tg_op = 'UPDATE' and exists (select 1 from link_pages where parent_id = new.id) then
      raise exception '아래에 서브 페이지가 있는 페이지는 다른 페이지 밑으로 옮길 수 없어요.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- 페이지 수 상한은 **새로 만들 때만** 센다. UPDATE 에서 세면 자기 자신이 포함돼 항상 초과다.
  if tg_op = 'INSERT' then
    select plan into v_plan from users_profile where id = new.user_id;
    v_limit := case when coalesce(v_plan, 'free') = 'free' then 1 else 3 end;
    select count(*) into v_count from link_pages where user_id = new.user_id;
    if v_count >= v_limit then
      raise exception '페이지는 최대 %개까지 만들 수 있어요. 플랜을 올리면 늘어나요.', v_limit
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.link_pages_guard_count() from public, anon, authenticated;

drop trigger if exists trg_link_pages_guard_count on public.link_pages;
create trigger trg_link_pages_guard_count
  before insert on public.link_pages
  for each row execute function public.link_pages_guard_count();

-- UPDATE 는 계층 컬럼이 실제로 바뀔 때만 탄다 — 저장할 때마다 도는 트리거는 비용이다.
drop trigger if exists trg_link_pages_guard_reparent on public.link_pages;
create trigger trg_link_pages_guard_reparent
  before update of parent_id, sub_slug, user_id on public.link_pages
  for each row
  when (
    new.parent_id is distinct from old.parent_id
    or new.sub_slug is distinct from old.sub_slug
    or new.user_id  is distinct from old.user_id
  )
  execute function public.link_pages_guard_count();

-- user_id 는 애초에 사용자가 바꿀 값이 아니다 — 열 단위로도 잘라 둔다(트리거와 이중 방어).
revoke update (user_id) on public.link_pages from anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- ② [Medium] meta_ad_write_log 의 pending 행을 남의 워크스페이스로 «재부모화»할 수 있다
-- ────────────────────────────────────────────────────────────────
-- 0082 의 "ad write log settle" 은 UPDATE 를 이렇게 열어 두었다:
--   using  (result = 'pending' and (uid = actor_user_id or uid = user_id))
--   with check (uid = actor_user_id or uid = user_id)
-- with check 가 «새 행이 나와 관계있으면 된다» 라서, 내 pending 행의 user_id·ad_account_id 를
-- **피해자 것으로 바꾸는** UPDATE 가 통과한다(actor_user_id 는 나로 남으니 조건 만족).
--   · 돈이 나가는 쓰기의 감사 기록이 피해자 워크스페이스에 거짓으로, 그리고 **영구히** 남는다
--     (확정 행은 update/delete 불가). 분쟁 때 이 표가 유일한 근거다.
--   · meta_ad_write_log_pending_lock 이 (user_id, ad_account_id) 부분 유니크라,
--     피해자 쪽에 pending 을 꽂아 두면 소유자·editor 의 캠페인 생성·게재 시작·이미지 업로드가
--     반복 차단된다. 화면은 «다른 작업이 진행 중»으로만 보여 원인을 알 방법이 없다.
--   · viewer 는 0081 이 INSERT 를 editor 로 좁혀 두었는데, 이 UPDATE 로 그 의도가 우회된다.
--
-- 고치는 방법: «옮기지 못하게» 는 정책식으로 표현할 수 없다(옛 행 값을 참조할 수 없다).
-- 0084 가 team_members.member_user_id 에 쓴 것과 같이 **열 단위 GRANT** 로 자른다 —
-- 확정에 필요한 컬럼만 남기고, 소유·대상·실행자 컬럼은 사용자가 아예 못 쓴다.
revoke update on public.meta_ad_write_log from anon, authenticated;
grant update (
  result, meta_error_code, meta_error_subcode, error_message, updated_at,
  campaign_id, adset_id, ad_id, request
) on public.meta_ad_write_log to authenticated;

-- INSERT 도 같은 이유로 «남의 워크스페이스에 꽂기» 가 안 되게 둔다 — 0081 의 with check 가
-- 이미 소유를 보지만, 컬럼을 좁혀 두면 나중에 정책이 느슨해져도 표가 지켜진다.
comment on table public.meta_ad_write_log is
  '광고 쓰기 감사 로그. 0086 이후 authenticated 는 확정용 컬럼(result·오류·하위 id)만 UPDATE 할 수 있다 — user_id·ad_account_id·actor_user_id 는 쓰기 불가(행을 남의 워크스페이스로 옮기지 못하게).';

-- ────────────────────────────────────────────────────────────────
-- ③ [Medium] «빈 이메일» 초대장 — 이메일 없는 계정을 링크 한 번으로 편입시킬 수 있었다
-- ────────────────────────────────────────────────────────────────
-- 수락 화면의 비교가 `(user.email ?? "") !== invite.email.toLowerCase()` 였다. 카카오 로그인은
-- 이메일이 없을 수 있어(user.email = null) **양쪽이 ""** 가 되면 일치했다.
-- 앱의 이메일 형식 검사는 서버 액션 경로에서만 도는데, 공격 경로는 PostgREST 직행이라 앱을 안 지난다.
-- 코드는 같은 커밋에서 고쳤고(lib/team/invite.ts sameInvitee), DB 에도 같은 규칙을 내린다.
--
-- NOT VALID 로 붙인다 — 기존 행 전수 검사 없이 **새로 만들거나 고치는 행부터** 즉시 적용된다.
-- 아래 확인 쿼리 ③ 이 0행이면 `alter table public.team_members validate constraint team_members_email_shape;`
-- 를 한 번 더 실행해 기존 행까지 확정한다.
alter table public.team_members drop constraint if exists team_members_email_shape;
alter table public.team_members add constraint team_members_email_shape
  check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') not valid;

-- ────────────────────────────────────────────────────────────────
-- 적용 확인
--   ① 0행이어야 한다 — 부모와 주인이 다른 서브 페이지(이미 심어진 공격 흔적)
--   ② 0행이어야 한다 — meta_ad_write_log 에 남은 사용자 UPDATE 권한 중 소유·대상 컬럼
-- ────────────────────────────────────────────────────────────────
select c.id as child_id, c.user_id as child_owner, p.id as parent_id, p.user_id as parent_owner, c.sub_slug
from public.link_pages c
join public.link_pages p on p.id = c.parent_id
where c.user_id is distinct from p.user_id;

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'meta_ad_write_log'
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'UPDATE'
  and column_name in ('user_id', 'ad_account_id', 'actor_user_id', 'created_at', 'action');

-- ③ 0행이어야 한다 — 형식에 맞지 않는(빈 값 포함) 초대 이메일
select id, owner_user_id, email, status
from public.team_members
where email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
