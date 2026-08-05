-- ============================================================================
-- 0022_reference_rich.sql — 레퍼런스 카드 리치화 + 기간 필터 확장
-- ----------------------------------------------------------------------------
-- (1) 수집 아이템에 댓글 수·해시태그·AI 코멘트 컬럼 추가 (카드 표시용)
-- (2) 기간 필터를 1주/1·3·6개월/1년/상관없음 6단계로 확장 (기존 1d→7d, 30d→1m 이관)
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

alter table public.reference_items
  add column if not exists comments   bigint not null default 0,
  add column if not exists hashtags   jsonb  not null default '[]'::jsonb,
  add column if not exists ai_comment text   not null default '';

-- 기간 값 이관 후 체크 제약 교체
update public.reference_collect_settings set period = '7d' where period = '1d';
update public.reference_collect_settings set period = '1m' where period = '30d';

alter table public.reference_collect_settings
  drop constraint if exists reference_collect_settings_period_check;
alter table public.reference_collect_settings
  add constraint reference_collect_settings_period_check
  check (period in ('all', '7d', '1m', '3m', '6m', '1y'));
