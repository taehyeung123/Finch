-- 0057_link_blocks_more_types.sql — 리틀리 흡수 4단계: 새 블록 6종 + 방명록 표
--
-- ① link_blocks.type check 에 gallery·music·vcard·search·file·guestbook 추가
--    (앱 lib/links/blocks.ts BLOCK_TYPES 와 **반드시 같이** 바뀐다 — 0048·0054 관례).
-- ② link_guestbook — 방명록. 방문자 글은 서버 액션이 service_role 로 넣고(0048 leads 와 같은 이유:
--    익명 INSERT 정책을 열면 스팸 창구), 공개 페이지는 hidden=false 만 읽는다. 주인은 답글·숨김·삭제.
--
-- 적용 전 앱: 새 타입 저장 시 "서버 업데이트(0057) 적용 후" 안내, 방명록 블록은 제출·목록이 비어 있다.

alter table public.link_blocks drop constraint if exists link_blocks_type_check;
alter table public.link_blocks add constraint link_blocks_type_check check (type in (
  'link','heading','text','divider','spacer','image','image_card',
  'video','card_row','grid','notice','social_feed','contact','subscribe','map',
  'coupang','donation',
  'gallery','music','vcard','search','file','guestbook'
));

create table if not exists public.link_guestbook (
  id           bigserial primary key,
  page_id      uuid not null references public.link_pages(id) on delete cascade,
  block_id     uuid,                       -- 스냅샷에 굳은 블록 id(FK 없음 — 0049 의 leads 와 같은 이유)
  visitor_hash text,
  name         text not null check (char_length(name) between 1 and 40),
  message      text not null check (char_length(message) between 1 and 500),
  reply        text check (reply is null or char_length(reply) <= 500),
  hidden       boolean not null default false,
  created_at   timestamptz not null default now(),
  replied_at   timestamptz
);
create index if not exists link_guestbook_page_time_idx on public.link_guestbook (page_id, created_at desc);

alter table public.link_guestbook enable row level security;

-- 공개 읽기: 공개(published)된 페이지의, 숨기지 않은 글만. 공개 페이지(anon)와 편집기 미리보기가 같은 규칙.
drop policy if exists "public guestbook read" on public.link_guestbook;
create policy "public guestbook read" on public.link_guestbook
  for select to anon, authenticated
  using (
    hidden = false
    and exists (select 1 from public.link_pages p where p.id = page_id and p.published = true)
  );

-- 주인: 전부 읽고(숨김 포함) 답글·숨김·삭제. INSERT 정책은 주지 않는다(서버 액션 service_role).
drop policy if exists "own guestbook manage" on public.link_guestbook;
create policy "own guestbook manage" on public.link_guestbook
  for all to authenticated
  using (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()));

-- anon·authenticated 모두 필요한 컬럼만 — 방문자 해시는 어느 역할에도 내보내지 않는다(0049 의 link_pages 컬럼 축소와 같은 원칙).
-- 공개 읽기 정책이 authenticated 에도 열려 있으므로(편집기 미리보기) 컬럼 제한을 같이 걸어야 한다 —
-- 안 그러면 아무 로그인 사용자가 남의 페이지 방명록의 visitor_hash 를 읽어 방문자를 페이지 간에 이어 붙일 수 있다.
revoke all on public.link_guestbook from anon, authenticated;
grant select (id, page_id, block_id, name, message, reply, hidden, created_at, replied_at) on public.link_guestbook to anon;
grant select (id, page_id, block_id, name, message, reply, hidden, created_at, replied_at),
      update (reply, replied_at, hidden),
      delete
  on public.link_guestbook to authenticated;
grant usage on sequence public.link_guestbook_id_seq to authenticated;

comment on table public.link_guestbook is
  '프로필 링크 방명록(리틀리 흡수 4단계). 방문자 글은 서버 액션(service_role)이 넣고, 주인이 답글·숨김·삭제한다.';
