-- 0081_meta_ad_write_log.sql — 광고 쓰기 감사 로그 + 동시 쓰기 잠금 (2026-09-02, 감사 반영 개정)
--
-- 캠페인 생성·상태 전환은 이 제품에서 **돈을 쓰는 첫 경로**다. Meta 쪽 기록은
-- «핀치 앱이 했다»까지만 말한다 — 팀 워크스페이스에서 «누가 이 캠페인을 켰나»를
-- 답할 방법이 우리 쪽에 없으면 분쟁 때 재구성이 불가능하다.
--
-- ⚠️ 초안에서 고친 것(쏘넷 감사 2026-09-02):
--  ① result 에 'pending' 추가 + **부분 유니크 인덱스** — 쓰기 «전에» pending 행을 예약해
--     탭 두 개 동시 제출을 DB 가 막는다. 체크-후-삽입(3초 쿨다운 조회)만으로는
--     Meta 왕복(~2초) 동안의 경쟁을 못 막는다(TOCTOU — 캠페인이 둘 생긴다).
--  ② insert 를 editor 팀원까지만 — 초안은 viewer 도 소유자 행에 insert 할 수 있어
--     감사 로그 위조와 «pending 행 연타로 소유자 쓰기 막기» DoS 가 가능했다.
--  ③ update 는 «본인이 만든 pending 행» 한정 — 결과 기록용. ok/failed 행은 여전히 불변이다.
--
-- ⚠️ request 에 토큰을 절대 넣지 않는다 — 보낸 파라미터만.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

create table if not exists public.meta_ad_write_log (
  id              uuid primary key default gen_random_uuid(),
  -- 워크스페이스 소유자(광고 계정 주인). 팀원이 실행해도 계정 주인 밑에 남는다
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- 실제로 실행한 사람 — 팀원 실행 추적이 이 로그의 존재 이유다
  actor_user_id   uuid references auth.users(id) on delete set null,
  ad_account_id   text not null,
  campaign_id     text,
  action          text not null check (action in ('create', 'status', 'budget', 'name')),
  -- 보낸 파라미터(토큰 금지)
  request         jsonb not null default '{}'::jsonb,
  -- pending = 쓰기 예약(진행 중). Meta 호출이 끝나면 ok/failed 로 갱신된다.
  result          text not null check (result in ('pending', 'ok', 'failed')),
  meta_error_code    integer,
  meta_error_subcode integer,
  error_message      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists meta_ad_write_log_user_time_idx
  on public.meta_ad_write_log (user_id, created_at desc);

-- 동시 쓰기 잠금 — 같은 계정에 pending 이 둘일 수 없다. 두 번째 insert 가 23505 로 튕긴다.
-- (갱신에 실패해 pending 이 남아도 쿨다운 창(초 단위)이 지나면 액션이 지운 뒤 재시도한다)
create unique index if not exists meta_ad_write_log_pending_lock
  on public.meta_ad_write_log (user_id, ad_account_id)
  where result = 'pending';

drop trigger if exists trg_meta_ad_write_log_updated on public.meta_ad_write_log;
create trigger trg_meta_ad_write_log_updated before update on public.meta_ad_write_log
  for each row execute function public.set_updated_at();

alter table public.meta_ad_write_log enable row level security;

-- 읽기 = 소유자 본인 + 활성 팀원(역할 무관 — 보는 것은 위험이 아니다)
drop policy if exists "ad write log read" on public.meta_ad_write_log;
create policy "ad write log read" on public.meta_ad_write_log for select to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.team_members tm
      where tm.owner_user_id = meta_ad_write_log.user_id
        and tm.member_user_id = (select auth.uid())
        and tm.status = 'active'
    )
  );

-- insert = 본인 워크스페이스, 또는 **editor** 팀원만. viewer 를 넣으면 이 표로
-- 위조 로그를 만들거나 pending 행으로 소유자 쓰기를 막을 수 있다(감사 ②).
drop policy if exists "ad write log insert" on public.meta_ad_write_log;
create policy "ad write log insert" on public.meta_ad_write_log for insert to public
  with check (
    (select auth.uid()) = actor_user_id
    and (
      (select auth.uid()) = user_id
      or exists (
        select 1 from public.team_members tm
        where tm.owner_user_id = meta_ad_write_log.user_id
          and tm.member_user_id = (select auth.uid())
          and tm.status = 'active'
          and tm.role = 'editor'
      )
    )
  );

-- update = 본인이 만든 pending 행만(결과 기록·해제). ok/failed 는 불변으로 남는다.
drop policy if exists "ad write log settle" on public.meta_ad_write_log;
create policy "ad write log settle" on public.meta_ad_write_log for update to public
  using ((select auth.uid()) = actor_user_id and result = 'pending')
  with check ((select auth.uid()) = actor_user_id);

-- delete = 본인이 만든 **오래된 pending** 만(고아 잠금 해제용). 확정 기록은 못 지운다.
drop policy if exists "ad write log unlock" on public.meta_ad_write_log;
create policy "ad write log unlock" on public.meta_ad_write_log for delete to public
  using (
    (select auth.uid()) = actor_user_id
    and result = 'pending'
    and created_at < now() - interval '60 seconds'
  );

comment on table public.meta_ad_write_log is
  '메타 광고 쓰기 감사 로그 + 동시성 잠금 — pending 예약 후 ok/failed 로 확정. 확정 행은 수정·삭제 불가.';
