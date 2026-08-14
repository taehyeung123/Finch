-- ============================================================================
-- 0042_dm_public_replies.sql — 자동 답글 다중화 (랜덤 발송, 리틀리 방식)
-- ----------------------------------------------------------------------------
-- 2026-08-14 리틀리 실측: 자동 답글은 단일 문구가 아니라 "준비된 답글 여러 개 중
-- 랜덤으로 하나"가 달린다 — 같은 답글이 반복 도배되면 인스타 스팸 신호가 되므로
-- 계정 보호 목적. public_replies jsonb(문자열 배열)를 추가하고, 발송 시(웹훅·크론)
-- 무작위 1개를 고른다. 기존 public_reply(단일)는 하위호환용으로 남기고 첫 항목을
-- 미러링한다 — 앱은 public_replies 우선, 비어 있으면 legacy로 폴백(parseReplies).
-- ============================================================================

alter table public.auto_dm_rules
  add column if not exists public_replies jsonb not null default '[]'::jsonb;

-- 기존 단일 답글 규칙 백필 (이미 배열이 있으면 건드리지 않는다)
update public.auto_dm_rules
  set public_replies = jsonb_build_array(public_reply)
  where public_reply is not null
    and public_reply <> ''
    and public_replies = '[]'::jsonb;
