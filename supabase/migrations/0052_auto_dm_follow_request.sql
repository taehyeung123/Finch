-- 0052_auto_dm_follow_request.sql — 자동 DM 「팔로우 요청 후 메시지 보내기」
--
-- 2026-08-19 사장님 지시(스딩 실측 스크린샷 기준). 경쟁 도구의 최종 검수 화면에는
-- 「자동으로 답글 달기」와 「팔로우 요청 후 메시지 보내기」 온오프가 나란히 있다.
-- 답글은 이미 있고(public_replies), 팔로우 요청이 없었다.
--
-- 의미: 댓글 작성자가 나를 팔로우하지 않은 상태면, 본 DM 전에 팔로우 요청
-- 메시지를 먼저 보낸다. 실제 발송 분기는 웹훅 파이프라인(0004)이 이 플래그를
-- 읽어 처리한다 — 실 API 연동 단계에서 배선한다(연동은 사용자 지시로 맨 마지막).
--
-- ⚠️ 앱 코드는 이 컬럼이 없어도 동작한다(auto-dm 의 기존 컬럼 폴백 패턴 —
-- 0038·0042 와 같은 방식). 적용 전 배포가 먼저 나가도 저장·조회가 안 깨진다.
--
-- 적용: Supabase 대시보드 → SQL Editor.

alter table public.auto_dm_rules
  add column if not exists follow_request boolean not null default false;

comment on column public.auto_dm_rules.follow_request is
  '팔로우 요청 후 메시지 보내기 — 미팔로워 댓글에는 본 DM 전에 팔로우 요청을 먼저 보낸다(발송 분기는 웹훅 파이프라인).';
