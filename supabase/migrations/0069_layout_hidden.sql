-- 0069_layout_hidden.sql — 프로필 레이아웃에 「숨김」 추가 (2026-08-26 사장님 «프로필 설정 기능 다» 지시)
--
-- 앱의 LAYOUTS(lib/links/themes.ts)에 hidden 이 추가됐다 — 프로필 영역(사진·대표문구·상세문구)
-- 없이 블록만 보여주는 레이아웃. 0048 의 check 가 세 값만 허용하고 있어 함께 넓힌다.
-- ⚠️ 앱 배포가 먼저 나가므로, 이 마이그레이션이 적용되기 전에 「숨김」을 저장하면
--    DB check 에 걸려 저장이 거절된다(앱이 이유를 보여준다) — 적용 즉시 풀린다.

alter table public.link_pages drop constraint if exists link_pages_layout_check;
alter table public.link_pages add constraint link_pages_layout_check check (
  layout in ('profile', 'cover', 'cover_profile', 'hidden')
);
