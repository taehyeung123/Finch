-- ============================================================================
-- 0019_reference_items.sql — 레퍼런스 수집 결과 저장 (수집 엔진 실연동)
-- ----------------------------------------------------------------------------
-- 0018(수집 기준)에서 미뤄뒀던 수집 아이템 테이블. ScrapeCreators 연동이 확정되어
-- 스키마를 확정한다: 공개 게시물 메타데이터 + AI 요약·후킹 태그.
--
-- 저작권 안전 설계(법률 조사 반영):
-- - 캡션은 요약·발췌 표시용으로만 저장(원문 전문은 앞 500자로 절단 저장)
-- - 원본 게시물 링크(url)를 항상 보존해 출처 표기·링크 구조를 유지
-- - 미디어 파일은 저장하지 않는다(썸네일 리호스팅 금지)
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

create table if not exists public.reference_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  channel        text not null check (channel in ('instagram', 'tiktok', 'threads')),
  external_id    text not null,
  title          text not null default '',
  caption        text not null default '' check (char_length(caption) <= 600),
  summary        text not null default '',
  category       text not null default '',
  hooks          jsonb not null default '[]'::jsonb,
  creator_handle text not null default '',
  url            text,
  views          bigint not null default 0,
  likes          bigint not null default 0,
  follower_count bigint not null default 0,
  matched_source text not null default '',
  favorite       boolean not null default false,
  posted_at      timestamptz,
  collected_at   timestamptz not null default now(),
  unique (user_id, channel, external_id)
);

create index if not exists idx_reference_items_user_time
  on public.reference_items (user_id, collected_at desc);

alter table public.reference_items enable row level security;

drop policy if exists "own reference items" on public.reference_items;
create policy "own reference items" on public.reference_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
