-- 0070_layout_hero.sql — 프로필 레이아웃 「배경형(hero)」 추가 (2026-08-26 리틀리 실측 지시)
--
-- app.litt.ly 편집기를 직접 눌러 실측한 레이아웃 4종(배경·기본·커버+프로필·커버)에 맞춰
-- 앱 LAYOUTS 가 hero 를 얻었다 — 프로필 사진이 상단 전체 배경으로 깔리고 그라데이션으로
-- 지면에 녹는 형태. «숨김(hidden)»은 카드에서 빠지고 프로필 ON/OFF 토글 값으로 남는다.
-- ⚠️ 적용 전에 「배경」을 저장하면 「이 레이아웃은 준비 중이에요」 안내가 뜬다(0069 와 같은 관문).

alter table public.link_pages drop constraint if exists link_pages_layout_check;
alter table public.link_pages add constraint link_pages_layout_check check (
  layout in ('hero', 'profile', 'cover', 'cover_profile', 'hidden')
);
