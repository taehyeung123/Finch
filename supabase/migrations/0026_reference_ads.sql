-- ============================================================================
-- 0026_reference_ads.sql — 메타광고 레퍼런스 (스니핏 벤치마크 항목 2)
-- ----------------------------------------------------------------------------
-- reference_items(오가닉)와 완전히 분리된 테이블이다. Channel 타입(instagram·
-- tiktok·threads)을 넓히는 대신 별도 파이프라인으로 둔 이유: 광고 소재는
-- creator_handle 대신 page_name, 단일 posted_at 대신 start_date/end_date,
-- views·likes·comments 대신 platforms·is_active처럼 데이터 구조 자체가
-- 달라 같은 컬럼 셋에 억지로 맞추면 양쪽 다 널 컬럼 투성이가 된다
-- (CLAUDE.md: "'내 계정' 공식 API와 '타계정/트렌드' 3rd party는 데이터
-- 소스를 처음부터 분리 설계" 원칙을 광고에도 적용).
--
-- 조회는 KR 상업광고만 반환하는 ScrapeCreators Facebook Ad Library
-- 엔드포인트 기준(2026-08-08 실측 확인 — country=KR 검색 시 국내 광고
-- 정상 반환). 종료된 광고는 API에서 사라지므로(EU 밖은 12개월 아카이브
-- 미적용) 주기 수집으로 이 테이블에 쌓아두는 것 자체가 유일한 보존 방법.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

create table if not exists public.ad_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      text not null, -- 검색 키워드 (예: "웨딩") — 페이지명 검색은 추후 kind 확장
  created_at timestamptz not null default now(),
  unique (user_id, value)
);
alter table public.ad_sources enable row level security;

drop policy if exists "own ad sources" on public.ad_sources;
create policy "own ad sources" on public.ad_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.reference_ads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  ad_archive_id    text not null,
  page_name        text not null,
  page_profile_url text,
  body             text not null default '',
  cta_text         text,
  thumbnail_url    text,
  is_active        boolean not null default true,
  start_date       timestamptz,
  end_date         timestamptz,
  platforms        text[] not null default '{}',
  matched_source   text not null,
  ai_comment       text not null default '',
  category         text not null default '일반',
  status           text not null default 'unseen' check (status in ('unseen', 'seen', 'skipped')),
  favorite         boolean not null default false,
  collected_at     timestamptz not null default now(),
  unique (user_id, ad_archive_id)
);
alter table public.reference_ads enable row level security;

drop policy if exists "own reference ads" on public.reference_ads;
create policy "own reference ads" on public.reference_ads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_reference_ads_user_time
  on public.reference_ads (user_id, collected_at desc);

create index if not exists idx_reference_ads_user_source
  on public.reference_ads (user_id, matched_source);
