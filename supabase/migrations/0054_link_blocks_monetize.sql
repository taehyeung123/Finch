-- 0054_link_blocks_monetize.sql — 수익화 블록: 쿠팡 파트너스 상품 · 후원하기
--
-- 2026-08-20 링크팜 전면 대조 지시의 우선순위 2. 링크팜은 「쿠팡 파트너스 상품
-- 추가」를 블록 카탈로그 최상단에 고정한다 — 링크로 돈이 되는 도구라는 포지션의
-- 간판이다. 0048 때 "결제 백엔드가 필요하다"며 미뤘지만 실측 결과 둘 다 **링크
-- 아웃**이다(쿠팡: link.coupang.com 제휴 링크 / 후원: toss.me·카카오페이 송금
-- 링크). 백엔드 없이 온전히 동작한다.
--
-- 쿠팡 고지 문구("쿠팡 파트너스 활동의 일환으로...")는 공정위 표시 의무라
-- 공개 렌더러가 항상 자동으로 붙인다(lib/links/blocks.ts COUPANG_DISCLOSURE).
--
-- ⚠️ 앱 코드는 이 마이그레이션이 없어도 동작한다 — addBlock 이 check 위반을
-- "서버 업데이트(0054) 적용 후" 안내로 돌려준다(계단식 폴백 관례).
--
-- 적용: Supabase 대시보드 → SQL Editor.

alter table public.link_blocks drop constraint if exists link_blocks_type_check;
alter table public.link_blocks add constraint link_blocks_type_check check (type in (
  'link','heading','text','divider','spacer','image','image_card',
  'video','card_row','grid','notice','social_feed','contact','subscribe','map',
  'coupang','donation'
));
