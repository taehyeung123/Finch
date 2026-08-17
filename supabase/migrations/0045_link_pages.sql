-- 0045_link_pages.sql — 프로필 링크(링크인바이오)
--
-- 사장님 도입 지시(2026-08-15). SNS 프로필에 거는 링크 한 장 + 클릭 성과.
--
-- 설계 요점
--  · 사용자당 **1페이지**로 시작한다(unique user_id). 여러 장이 필요해지는 건
--    에이전시가 클라이언트별로 만들 때인데, 그건 팀·클라이언트 모델이 먼저다.
--    한 장으로 못박아 두면 나중에 unique 를 떼는 것만으로 확장된다.
--  · 공개 페이지는 **published=true 일 때만** 익명에게 보인다. 초안 상태의
--    링크가 URL 만 알면 보이는 건 사고다.
--  · 클릭 기록은 익명 INSERT 정책을 **주지 않는다.** 정책을 열면 아무나 카운트를
--    부풀릴 수 있다. 기록은 서버 리다이렉트 라우트가 service_role 로 남긴다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- ────────────────────────────────────────────────────────────────
-- 1. 페이지
-- ────────────────────────────────────────────────────────────────
create table if not exists public.link_pages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  -- 공개 URL 의 마지막 조각: /p/{slug}. 소문자·숫자·하이픈만, 예약어는 앱에서 막는다
  slug       text not null unique
               check (slug ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  title      text not null default '' check (char_length(title) <= 40),
  bio        text not null default '' check (char_length(bio) <= 160),
  published  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_link_pages_updated before update on public.link_pages
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 2. 링크 항목
-- ────────────────────────────────────────────────────────────────
create table if not exists public.link_items (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.link_pages(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 40),
  -- http(s) 만 허용한다. javascript: 같은 스킴이 들어오면 공개 페이지가 그대로 실행한다
  url        text not null check (url ~* '^https?://'),
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists link_items_page_idx on public.link_items (page_id, sort_order);

-- ────────────────────────────────────────────────────────────────
-- 3. 클릭 — 개인 식별 정보를 담지 않는다(방문자 IP·UA 미저장)
-- ────────────────────────────────────────────────────────────────
create table if not exists public.link_clicks (
  id         bigserial primary key,
  page_id    uuid not null references public.link_pages(id) on delete cascade,
  item_id    uuid references public.link_items(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists link_clicks_page_time_idx on public.link_clicks (page_id, created_at desc);
create index if not exists link_clicks_item_idx on public.link_clicks (item_id);

-- ────────────────────────────────────────────────────────────────
-- 4. RLS
-- ────────────────────────────────────────────────────────────────
alter table public.link_pages  enable row level security;
alter table public.link_items  enable row level security;
alter table public.link_clicks enable row level security;

-- 본인 페이지는 전부 가능
drop policy if exists "own link page" on public.link_pages;
create policy "own link page" on public.link_pages
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 공개된 페이지는 누구나 읽는다(익명 포함) — 이게 링크인바이오의 존재 이유다
drop policy if exists "public link page read" on public.link_pages;
create policy "public link page read" on public.link_pages
  for select to anon, authenticated using (published = true);

drop policy if exists "own link items" on public.link_items;
create policy "own link items" on public.link_items
  for all to authenticated
  using (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()));

-- 공개 페이지의 **활성** 항목만 익명에게 보인다. 꺼둔 링크가 보이면 끈 의미가 없다
drop policy if exists "public link items read" on public.link_items;
create policy "public link items read" on public.link_items
  for select to anon, authenticated
  using (active = true and exists (select 1 from public.link_pages p where p.id = page_id and p.published = true));

-- 클릭은 **읽기만** 열어둔다(본인 페이지). INSERT 정책 없음 = 서버(service_role) 전용.
drop policy if exists "own link clicks read" on public.link_clicks;
create policy "own link clicks read" on public.link_clicks
  for select to authenticated
  using (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()));
