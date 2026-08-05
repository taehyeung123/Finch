-- ============================================================================
-- 0018_reference_library.sql — 레퍼런스 수집함: 수집 기준(키워드·계정·해시태그)
-- ----------------------------------------------------------------------------
-- 앱의 "레퍼런스" 탭에서 사용자가 등록하는 수집 기준을 저장한다.
-- 수집된 콘텐츠(reference_items) 테이블은 이 마이그레이션에 없다 — 수집 엔진
-- (3rd party 데이터 공급사) 연동이 확정될 때 스키마를 같이 결정한다.
-- 지금 기준을 미리 등록해두면 연동 시점부터 바로 수집이 시작되는 구조.
--
-- 보안: RLS로 본인 행만 읽고/쓰기. 값 길이·종류는 DB 제약으로도 한 번 더 막는다
-- (서버 액션 검증을 우회한 직접 호출 대비 이중 방어).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

create table if not exists public.reference_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  channel    text not null check (channel in ('instagram', 'tiktok', 'threads')),
  kind       text not null check (kind in ('keyword', 'account', 'hashtag')),
  value      text not null check (char_length(value) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (user_id, channel, kind, value)
);

create index if not exists idx_reference_sources_user on public.reference_sources (user_id);

alter table public.reference_sources enable row level security;

drop policy if exists "own reference sources" on public.reference_sources;
create policy "own reference sources" on public.reference_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
