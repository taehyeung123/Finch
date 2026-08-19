-- 0053_scheduled_posts_channel.sql — 발행 대기열에 채널 컬럼
--
-- 2026-08-19 사장님 지시(링크팜 포스팅 실측). 링크팜은 채널 연결 스트립 아래에서
-- 게시물을 직접 작성해 발행까지 간다. 우리 scheduled_posts 는 카드뉴스(인스타 전용)
-- 파이프라인으로 시작해 채널 개념이 없었다 — 새 게시물 컴포저가 채널을 고르므로
-- 컬럼을 연다.
--
-- 실제 발행 함수는 현재 인스타그램뿐이다(lib/meta/instagram-publish.ts).
-- tiktok·threads 는 컴포저에서 "(준비 중)" 비활성 — 값은 스키마가 미리 받는다.
-- 발행 크론은 channel='instagram' 만 집는다(그 외는 API 연동 후).
--
-- ⚠️ 앱 코드는 이 컬럼이 없어도 동작한다(42703 계단식 폴백 — auto-dm 0052 와 같은
-- 패턴). 적용 전 배포가 먼저 나가도 저장·조회가 안 깨진다.
--
-- 적용: Supabase 대시보드 → SQL Editor.

alter table public.scheduled_posts
  add column if not exists channel text not null default 'instagram'
    check (channel in ('instagram', 'tiktok', 'threads'));

comment on column public.scheduled_posts.channel is
  '발행 채널 — 실제 발행은 현재 instagram 만 지원(크론이 instagram 만 집는다). tiktok·threads 는 API 연동 후.';
