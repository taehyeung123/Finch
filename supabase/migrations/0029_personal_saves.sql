-- 0029_personal_saves.sql — 개인 상태 (보드 · 저장 · 브랜드 팔로우 · 검색 이력)
--
-- 공용 풀(0027)은 전원이 같은 행을 읽는다. "내가 저장했는가 / 내 메모는 무엇인가"는
-- 사람마다 다르므로 여기 별도 표에 own-row RLS 로 둔다. 소재 본문을 복제하지 않고
-- creative_id 로만 가리키므로, 1만 명이 같은 소재를 저장해도 소재 행은 1개다.
--
-- 기존 reference_items 의 개인 필드(favorite / note / status / matched_source)가
-- 여기로 이관된다 (0031 백필). 손실 0.

-- ────────────────────────────────────────────────────────────────
-- 1. 보드 — 저장물을 담는 폴더
-- ────────────────────────────────────────────────────────────────
create table if not exists public.boards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  emoji      text not null default '',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists idx_boards_user on public.boards (user_id, sort_order);

-- ────────────────────────────────────────────────────────────────
-- 2. 저장한 소재
-- ────────────────────────────────────────────────────────────────
create table if not exists public.saved_creatives (
  user_id     uuid not null references auth.users(id) on delete cascade,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  board_id    uuid references public.boards(id) on delete set null,
  note        text not null default '',
  status      text not null default 'unseen' check (status in ('unseen','seen','skipped')),
  favorite    boolean not null default false,
  -- "내가 어떤 검색으로 이걸 건졌나" — 구 reference_items.matched_source 의 계승
  origin_query text not null default '',
  saved_at    timestamptz not null default now(),
  primary key (user_id, creative_id)
);
create index if not exists idx_saved_user_time on public.saved_creatives (user_id, saved_at desc);
create index if not exists idx_saved_board on public.saved_creatives (board_id, saved_at desc)
  where board_id is not null;

-- ────────────────────────────────────────────────────────────────
-- 3. 팔로우한 브랜드 — 알림 + 크롤 우선순위 승격
-- ────────────────────────────────────────────────────────────────
create table if not exists public.saved_brands (
  user_id    uuid not null references auth.users(id) on delete cascade,
  brand_id   uuid not null references public.brands(id) on delete cascade,
  alert      boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id)
);
create index if not exists idx_saved_brands_brand on public.saved_brands (brand_id);

-- ────────────────────────────────────────────────────────────────
-- 4. 검색 이력 — 최근 검색어 + 풀을 키우는 원천
--    사용자가 찾았는데 풀에 없던 검색어가 industry_keywords 로 승격된다.
-- ────────────────────────────────────────────────────────────────
create table if not exists public.search_history (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  query      text not null,
  industry_id text,
  platform   text,
  hit_count  int not null default 0,      -- 0이면 풀에 없던 검색어 = 승격 후보
  charged    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_history_user on public.search_history (user_id, created_at desc);
-- 승격 플래너가 "많이 찾는데 결과가 없는 검색어"를 뽑는 경로
create index if not exists idx_history_miss on public.search_history (created_at desc)
  where hit_count = 0;

-- ────────────────────────────────────────────────────────────────
-- 5. 업종 오분류 신고 — 같은 브랜드 3건 누적 시 관리자 큐 상단으로
-- ────────────────────────────────────────────────────────────────
create table if not exists public.industry_misclass_reports (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  creative_id uuid references public.creatives(id) on delete cascade,
  brand_id    uuid references public.brands(id) on delete cascade,
  suggested_industry text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_misclass_brand on public.industry_misclass_reports (brand_id);

-- ────────────────────────────────────────────────────────────────
-- 6. 저장 수 집계 트리거
--    creative_stats 는 공용 표라 사용자에게 UPDATE 정책을 줄 수 없다.
--    SECURITY DEFINER 로 우회한다 — 사용자는 자기 saved_creatives 행만
--    건드릴 수 있고, 그 부수효과로만 공용 집계가 갱신된다.
-- ────────────────────────────────────────────────────────────────
create or replace function public.bump_creative_saves()
returns trigger as $$
declare
  v_id uuid := coalesce(new.creative_id, old.creative_id);
  v_delta int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  insert into public.creative_stats (creative_id, save_count)
  values (v_id, greatest(0, v_delta))
  -- ON CONFLICT DO UPDATE 안에서는 기존 행을 스키마 없이 테이블명으로만 참조한다
  -- (public.creative_stats.save_count 로 쓰면 파싱에서 걸린다).
  on conflict (creative_id) do update
    set save_count = greatest(0, creative_stats.save_count + v_delta),
        updated_at = now();
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_saved_creatives_count on public.saved_creatives;
create trigger trg_saved_creatives_count
  after insert or delete on public.saved_creatives
  for each row execute function public.bump_creative_saves();

create or replace function public.bump_brand_saves()
returns trigger as $$
declare
  v_id uuid := coalesce(new.brand_id, old.brand_id);
  v_delta int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  update public.brands
     set save_count = greatest(0, save_count + v_delta)
   where id = v_id;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_saved_brands_count on public.saved_brands;
create trigger trg_saved_brands_count
  after insert or delete on public.saved_brands
  for each row execute function public.bump_brand_saves();

-- ────────────────────────────────────────────────────────────────
-- 7. RLS — 전부 own-row (0018 의 검증된 패턴 그대로)
-- ────────────────────────────────────────────────────────────────
alter table public.boards                    enable row level security;
alter table public.saved_creatives           enable row level security;
alter table public.saved_brands              enable row level security;
alter table public.search_history            enable row level security;
alter table public.industry_misclass_reports enable row level security;

drop policy if exists "own boards" on public.boards;
create policy "own boards" on public.boards
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved creatives" on public.saved_creatives;
create policy "own saved creatives" on public.saved_creatives
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own saved brands" on public.saved_brands;
create policy "own saved brands" on public.saved_brands
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own search history" on public.search_history;
create policy "own search history" on public.search_history
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own misclass reports" on public.industry_misclass_reports;
create policy "own misclass reports" on public.industry_misclass_reports
  for insert to authenticated with check (auth.uid() = user_id);
