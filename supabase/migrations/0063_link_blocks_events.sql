-- 0063_link_blocks_events.sql — 「일정」 블록(events) 추가
--
-- 리틀리의 「일정」에 해당한다. 예약받기(booking)와 다르다 — 백엔드가 없고, 주인이 적어 둔
-- 날짜를 알리기만 한다(공구 오픈·라이브·팝업 기간). 방문자는 .ics 로 자기 캘린더에 담아 간다.
-- 그래서 새 표도, 새 정책도 필요 없다. data jsonb 안에서 끝난다.
--
-- link_blocks.type check 에 'events' 만 더한다 — 앱 lib/links/blocks.ts BLOCK_TYPES 와
-- **반드시 같이** 바뀐다(0048·0054·0057 관례). 적용 전에는 저장이 check 위반으로 거절된다.

alter table public.link_blocks drop constraint if exists link_blocks_type_check;
alter table public.link_blocks add constraint link_blocks_type_check check (type in (
  'link','heading','text','divider','spacer','image','image_card',
  'video','card_row','grid','notice','social_feed','contact','subscribe','map',
  'coupang','donation',
  'gallery','music','vcard','search','file','guestbook',
  'events'
));
