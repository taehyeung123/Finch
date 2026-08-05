-- ============================================================================
-- 0023_reference_detail.sql — 레퍼런스 상세 모달: 메모·대본·상태
-- ----------------------------------------------------------------------------
-- 카드 클릭 상세 화면용: 내 메모, 릴스 대본(음성 받아쓰기 — 요청 시 추출·캐시),
-- 확인 상태(안 봄/봤음/건너뜀).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

alter table public.reference_items
  add column if not exists note       text not null default '',
  add column if not exists transcript text not null default '',
  add column if not exists status     text not null default 'unseen'
    check (status in ('unseen', 'seen', 'skipped'));
