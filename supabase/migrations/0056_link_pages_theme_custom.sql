-- 0056_link_pages_theme_custom.sql — 테마 직접 꾸미기(프리셋 위 오버라이드)
--
-- 2026-08-20 사장님 지시 "테마 종류나 에디트 더 자유롭게". 프리셋 8→15종은 코드만으로
-- 되지만(theme 는 제약 없는 text), 사용자가 고른 배경·그라데이션·배경 이미지·강조색·
-- 카드색·글자색·모서리·버튼 스타일·글꼴은 저장할 자리가 필요하다.
--
-- 검증은 앱(lib/links/themes.ts sanitizeThemeCustom)이 한다 — hex·허용 열거값·http(s)
-- 이미지 주소만 통과. 공개 페이지는 published_snapshot 에 굳은 themeCustom 을 읽는다.
--
-- ⚠️ 앱 코드는 이 컬럼이 없어도 동작한다 — 로더·발행은 계단식 select 폴백, 저장은
-- "서버 업데이트(0056) 적용 후" 안내(0052 와 같은 관례).
--
-- 적용: Supabase 대시보드 → SQL Editor.

alter table public.link_pages add column if not exists theme_custom jsonb;

comment on column public.link_pages.theme_custom is
  '테마 직접 꾸미기 — 프리셋(theme) 위에 덮는 오버라이드 {bg,bg2,bgImage,accent,card,fg,radius,button,font}. 검증은 앱.';

-- 0049 발행 도장 트리거 — "공개 토글은 초안 변경이 아니다" 판정 튜플에 새 컬럼들을 포함
-- (0051 의 sns_placement·title_size 도 빠져 있던 것을 함께 보강)
create or replace function public.link_pages_publish_stamp()
returns trigger language plpgsql as $$
begin
  if new.published_snapshot is distinct from old.published_snapshot then
    new.published_at := now();
    new.updated_at   := new.published_at;
  elsif new.published is distinct from old.published
    and (new.slug, new.title, new.bio, new.layout, new.theme, new.theme_custom, new.align,
         new.avatar_path, new.cover_path, new.sns_links, new.sns_placement, new.title_size,
         new.seo_title, new.seo_desc)
        is not distinct from
        (old.slug, old.title, old.bio, old.layout, old.theme, old.theme_custom, old.align,
         old.avatar_path, old.cover_path, old.sns_links, old.sns_placement, old.title_size,
         old.seo_title, old.seo_desc)
  then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
