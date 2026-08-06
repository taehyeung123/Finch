-- ============================================================================
-- 0025_reference_source_history_index.sql — 키워드별 수집 이력 조회 인덱스
-- ----------------------------------------------------------------------------
-- 수집 실행(runCollection)마다 기준(matched_source)별로 "이 사용자가 이
-- 채널·키워드로 지금까지 모은 글"의 반응 이력을 조회해 상대 참여 임계값을
-- 계산한다(lib/actions/reference.ts computeRelativeThreshold). user_id 단일
-- 인덱스(idx_reference_items_user_time)만으로는 matched_source IN (...) 필터가
-- 매번 전체 스캔이라 인덱스를 추가한다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

create index if not exists idx_reference_items_user_channel_source
  on public.reference_items (user_id, channel, matched_source);
