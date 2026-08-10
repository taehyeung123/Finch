-- 0028_pool_ops.sql — 크롤 작업 큐 · 예산 하드캡 · 운영 기록
--
-- 이 파일의 존재 이유는 하나다: **원가를 사용자 수에서 분리하는 것.**
-- 공급사 호출은 전부 claim_crawl_budget() 를 먼저 통과해야 한다. 이 함수가
-- 원자적으로 잔여 콜 수를 깎고, 0이면 아무도 호출하지 못한다. 크론이 폭주하든
-- 사용자가 1만 명이든 하루 지출은 crawl_budget.calls_limit 을 넘을 수 없다.
--
-- RLS: 전부 운영 데이터다. RLS 를 켜고 정책을 하나도 만들지 않는다 →
-- authenticated 는 조회조차 못 하고 service_role 만 접근한다.

-- ────────────────────────────────────────────────────────────────
-- 1. 일일 예산 — 하드캡
-- ────────────────────────────────────────────────────────────────
create table if not exists public.crawl_budget (
  day           date primary key,
  calls_limit   int not null default 420,   -- 공급사 호출 상한 (백필 스프린트 때만 상향)
  calls_used    int not null default 0,
  ai_items_limit int not null default 1200, -- AI enrich 대상 소재 수 상한
  ai_items_used  int not null default 0,
  updated_at    timestamptz not null default now()
);

/*
  원자적 예산 클레임. 요청한 n 개 중 실제로 허용된 개수를 반환한다.
  잔여가 모자라면 남은 만큼만 준다(부분 허용) — 회차 중간에 딱 끊기는 것보다
  남은 예산을 알뜰히 쓰는 편이 낫다. 0 이면 호출부는 즉시 멈춰야 한다.

  구현 주의: 허용량을 UPDATE ... RETURNING 안에서 한 줄로 계산하면 안 된다.
  RETURNING 은 갱신된 **새 값**을 보므로 "쓰기 전 잔량"을 그 안에서 다시 만들 수 없다.
  그래서 FOR UPDATE 로 행을 잠그고 전/후 값을 직접 빼서 구한다.
  음수 p_calls 는 환불이다(호출 실패분 되돌리기) — 같은 식으로 자연히 처리된다.
*/
create or replace function public.claim_crawl_budget(p_calls int)
returns int as $$
declare
  v_before int;
  v_after  int;
begin
  insert into public.crawl_budget (day) values (current_date)
    on conflict (day) do nothing;

  -- 행 잠금. 서버리스 인스턴스가 여러 개여도 여기서 직렬화된다.
  select calls_used into v_before
    from public.crawl_budget where day = current_date for update;

  update public.crawl_budget
     set calls_used = greatest(0, least(calls_limit, calls_used + p_calls)),
         updated_at = now()
   where day = current_date
  returning calls_used into v_after;

  return v_after - v_before;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.claim_ai_budget(p_items int)
returns int as $$
declare
  v_before int;
  v_after  int;
begin
  insert into public.crawl_budget (day) values (current_date)
    on conflict (day) do nothing;

  select ai_items_used into v_before
    from public.crawl_budget where day = current_date for update;

  update public.crawl_budget
     set ai_items_used = greatest(0, least(ai_items_limit, ai_items_used + p_items)),
         updated_at = now()
   where day = current_date
  returning ai_items_used into v_after;

  return v_after - v_before;
end;
$$ language plpgsql security definer set search_path = public;

-- ────────────────────────────────────────────────────────────────
-- 2. 작업 큐 — 플래너가 채우고 워커가 비운다
-- ────────────────────────────────────────────────────────────────
create table if not exists public.crawl_jobs (
  id          bigserial primary key,
  job_type    text not null check (job_type in
              ('kw_ads','kw_posts','brand_ads','brand_profile','discover')),
  platform    text not null,
  target      text not null,               -- 키워드 또는 브랜드 external_id
  industry_id text references public.industries(id) on delete set null,
  brand_id    uuid references public.brands(id) on delete cascade,
  priority    int  not null default 100,   -- 낮을수록 먼저
  cursor      text,                        -- 이어받기용 공급사 커서
  state       text not null default 'queued'
              check (state in ('queued','running','done','failed')),
  attempts    int  not null default 0,
  claimed_at  timestamptz,
  finished_at timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_jobs_pick on public.crawl_jobs (priority, id)
  where state = 'queued';
-- 같은 대상이 큐에 중복으로 쌓이는 걸 막는다 (플래너가 매 회차 도므로 필수)
create unique index if not exists idx_jobs_dedupe
  on public.crawl_jobs (job_type, platform, target)
  where state in ('queued','running');

/*
  워커가 job 을 원자적으로 집는다. FOR UPDATE SKIP LOCKED 라서 워커를
  여러 개 띄워도 같은 job 을 두 번 집지 않는다 — 사용자 1만 명 규모에서
  크론 회차를 늘려 처리량을 키울 때 이게 전제 조건이다.
*/
create or replace function public.pick_crawl_jobs(p_limit int)
returns setof public.crawl_jobs as $$
begin
  return query
  update public.crawl_jobs j
     set state = 'running', claimed_at = now(), attempts = j.attempts + 1
   where j.id in (
     select id from public.crawl_jobs
      where state = 'queued'
         -- 15분 넘게 running 인 건 죽은 워커의 잔해다. 다시 집는다.
         or (state = 'running' and claimed_at < now() - interval '15 minutes')
      order by priority, id
      limit p_limit
      for update skip locked
   )
  returning j.*;
end;
$$ language plpgsql security definer set search_path = public;

-- ────────────────────────────────────────────────────────────────
-- 3. 회차 기록 — 무엇을 얼마나 썼고 몇 건 건졌나
-- ────────────────────────────────────────────────────────────────
create table if not exists public.crawl_runs (
  id          bigserial primary key,
  run_kind    text not null,               -- plan / work / finalize / enrich / discover
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  jobs_done   int not null default 0,
  calls_used  int not null default 0,
  new_creatives int not null default 0,
  new_brands  int not null default 0,
  errors      int not null default 0,
  note        text
);
create index if not exists idx_runs_recent on public.crawl_runs (started_at desc);

-- ────────────────────────────────────────────────────────────────
-- 4. 유료 산출물 주문 기록 — 누가 무엇을 샀는가 (개인정보라 공용 캐시와 분리)
-- ────────────────────────────────────────────────────────────────
create table if not exists public.creative_asset_orders (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  asset       text not null check (asset in ('transcript','analysis','script')),
  credits     int  not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_orders_user on public.creative_asset_orders (user_id, created_at desc);

-- ────────────────────────────────────────────────────────────────
-- 5. RLS — 운영 표는 정책 0개. 켜기만 하면 authenticated 는 전면 차단된다.
-- ────────────────────────────────────────────────────────────────
alter table public.crawl_budget          enable row level security;
alter table public.crawl_jobs            enable row level security;
alter table public.crawl_runs            enable row level security;
alter table public.creative_asset_orders enable row level security;

-- 주문 내역만 본인 것을 읽을 수 있게 한다 (사용 내역 화면).
drop policy if exists "own orders" on public.creative_asset_orders;
create policy "own orders" on public.creative_asset_orders
  for select to authenticated using (auth.uid() = user_id);

revoke select, insert, update, delete on public.crawl_budget from authenticated, anon;
revoke select, insert, update, delete on public.crawl_jobs   from authenticated, anon;
revoke select, insert, update, delete on public.crawl_runs   from authenticated, anon;
revoke insert, update, delete on public.creative_asset_orders from authenticated, anon;
