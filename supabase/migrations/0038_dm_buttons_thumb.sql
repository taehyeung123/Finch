-- ============================================================================
-- 0038_dm_buttons_thumb.sql — 자동 DM 버튼 다중화(최대 3개) + 게시물 썸네일
-- ----------------------------------------------------------------------------
-- 2026-08-14 자동 DM 개편(리틀리 방식 5단계 위저드)에 맞춘 스키마 확장:
--  1) buttons jsonb — [{"label":"...","url":"..."}] 배열, 최대 3개(Meta 버튼 템플릿 상한).
--     기존 button_label/button_url(1개)은 하위호환용으로 남기고, 앱은 항상 buttons를
--     우선 읽되 비어 있으면 legacy 쌍으로 폴백한다(lib/auto-dm/db.ts parseButtons).
--  2) post_thumb — 게시물 썸네일 URL(연동 미디어 thumbnail_url). 목록·피커 표시용.
--
-- 발송량 월 한도 폐지는 스키마 변경이 필요 없다 — reserve_dm_send의 p_monthly_limit에
-- 항상 1000000을 넘기는 방식(웹훅 코드)이라 함수는 그대로 둔다.
-- ============================================================================

alter table public.auto_dm_rules
  add column if not exists buttons jsonb not null default '[]'::jsonb;

alter table public.auto_dm_rules
  add column if not exists post_thumb text;

-- 기존 단일 버튼 규칙을 buttons 배열로 백필 (이미 배열이 있으면 건드리지 않는다)
update public.auto_dm_rules
  set buttons = jsonb_build_array(jsonb_build_object('label', button_label, 'url', button_url))
  where button_label is not null
    and button_url is not null
    and buttons = '[]'::jsonb;
