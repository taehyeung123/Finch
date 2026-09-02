-- 0081_meta_ad_write_log.sql — 광고 쓰기 감사 로그 (2026-09-02)
--
-- 캠페인 생성·상태 전환은 이 제품에서 **돈을 쓰는 첫 경로**다. 그런데 Meta 쪽 기록은
-- «핀치 앱이 했다»까지만 말한다 — 팀 워크스페이스에서 «누가 이 캠페인을 켰나»를
-- 답할 방법이 우리 쪽에 없으면 분쟁 때 재구성이 불가능하다(사후에 다시 물어볼 데가 없는
-- 유일한 데이터다). 겸해서 서버측 연타 방어(직전 몇 초 내 같은 계정 쓰기 거절)의 근거가 된다.
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
  result          text not null check (result in ('ok', 'failed')),
  meta_error_code    integer,
  meta_error_subcode integer,
  error_message      text,
  created_at      timestamptz not null default now()
);

create index if not exists meta_ad_write_log_user_time_idx
  on public.meta_ad_write_log (user_id, created_at desc);

alter table public.meta_ad_write_log enable row level security;

-- 0077 패턴: 읽기 = 소유자 본인 + 활성 팀원, insert = 본인(실행자가 소유자 행에 적는 경우가 있어
-- actor 기준). update/delete 정책은 **일부러 없다** — 감사 로그는 고치거나 지우는 것이 아니다.
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
      )
    )
  );

comment on table public.meta_ad_write_log is
  '메타 광고 쓰기 감사 로그 — 누가(actor) 어느 계정에 무엇을 보냈고 결과가 무엇이었나. 수정·삭제 불가(정책 없음).';
