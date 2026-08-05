-- ============================================================================
-- 0020_reference_thumbs.sql — 레퍼런스 썸네일 캐시 (미리보기 표시)
-- ----------------------------------------------------------------------------
-- 공급사 CDN 썸네일 URL은 서명 만료로 며칠 뒤 깨진다 → 수집 시점에 서버가 이미지를
-- 받아 Storage에 캐시하고 그 URL을 저장한다. 저작권 관점: 저해상도 커버 1장 +
-- 원본 링크 + 출처 표기 조합(썸네일 검색 판례의 인용 법리 범위).
--
-- 업로드는 service role(수집 서버 액션)만 수행 — 사용자 세션 업로드 정책은 두지
-- 않는다. 읽기는 공개 버킷(카드 이미지 표시용).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

alter table public.reference_items
  add column if not exists thumbnail_url text;

insert into storage.buckets (id, name, public)
values ('reference-thumbs', 'reference-thumbs', true)
on conflict (id) do nothing;
