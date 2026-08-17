-- 0043_scheduled_posts_draft.sql — 예약 발행에 '초안(draft)' 상태 추가
--
-- 왜: 스튜디오에서 카드뉴스를 만들면 **날짜를 정해야만** 저장할 수 있었다.
-- 오늘 만들었지만 언제 올릴지 아직 안 정한 콘텐츠는 갈 곳이 없어서, 화면을 떠나는
-- 순간 사라졌다(크레딧을 써서 만든 결과물인데도).
--
-- draft 는 크론이 절대 집지 않는다 — 크론은 status='scheduled' 만 조회한다
-- (app/api/cron/publish-scheduled/route.ts). scheduled_at 은 not null 이라
-- 초안도 값이 필요한데, 이 컬럼은 초안일 때 "희망일(미정 가능)"의 의미만 갖는다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

alter table public.scheduled_posts drop constraint if exists scheduled_posts_status_check;
alter table public.scheduled_posts add constraint scheduled_posts_status_check
  check (status in ('draft','scheduled','publishing','published','failed','canceled'));

-- 발행 화면의 실제 조회 경로 두 개에 맞춘 인덱스.
-- ⚠️ (user_id, status, scheduled_at) 처럼 status 를 앞에 두면, status 필터 없이
--    정렬만 하는 쿼리에서는 쓰이지 않는다. 리딩 컬럼을 실제 쿼리와 맞춘다.
--
-- ① 캘린더·목록: user_id 로 좁히고 scheduled_at 최신순
create index if not exists scheduled_posts_user_time_idx
  on public.scheduled_posts (user_id, scheduled_at desc);
-- ② 초안 목록: 부분 인덱스라 초안이 몇 건이든 표 전체를 훑지 않는다
create index if not exists scheduled_posts_user_draft_idx
  on public.scheduled_posts (user_id, created_at desc)
  where status = 'draft';

-- 기존 scheduled_posts_due_idx(status, scheduled_at)는 크론 전용이라 그대로 둔다.
