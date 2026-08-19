-- 0051_link_profile_options.sql — 프로필 표시 옵션 2개 (링크팜 실측 대조)
--
-- 2026-08-19. 링크팜 빌더의 프로필 설정 패널을 재실측한 결과, 우리 프로필 패널에
-- 없는 것 중 실사용 가치가 있는 둘을 가져온다:
--   · 배치 — SNS 아이콘 줄을 프로필 영역(소개 아래)에 둘지 링크 영역(블록 위)에 둘지
--   · 프로필 글꼴 크기 — 타이틀을 작게/보통/크게
-- (링크팜의 세 번째 옵션 「드래그」는 안 가져온다 — 우리는 드래그 정렬 자체를
--  의도적으로 뺐다. links-client.tsx 상단 주석 참조.)
--
-- ⚠️ 앱 코드는 이 컬럼이 **없어도 동작한다**(42703 폴백) — 마이그레이션 적용 전에
-- 배포가 먼저 나가도 저장·조회가 깨지지 않고, 적용 순간부터 옵션이 살아난다.
--
-- 적용: Supabase 대시보드 → SQL Editor.

alter table public.link_pages
  add column if not exists sns_placement text not null default 'profile'
    check (sns_placement in ('profile', 'links')),
  add column if not exists title_size text not null default 'md'
    check (title_size in ('sm', 'md', 'lg'));

comment on column public.link_pages.sns_placement is
  'SNS 아이콘 줄 위치 — profile: 소개 아래(기본) / links: 블록 목록 위';
comment on column public.link_pages.title_size is
  '프로필 타이틀 크기 — sm/md/lg. 공개 페이지·미리보기·스냅샷이 함께 쓴다';
