-- 0048_link_blocks.sql — 프로필 링크를 "링크 목록"에서 **블록 빌더**로
--
-- 2026-08-17. 사장님 지시로 링크팜(app.linkfarm.ai) 빌더를 실측 조사한 결과,
-- 우리 0045 구현은 링크팜 블록 18종 중 **「링크 버튼」 하나**만 있는 상태였다.
-- 링크팜이 가진 것: 프로필 레이아웃 3종 · 테마 프리셋 · 블록 18종 · 템플릿 5종 ·
-- 실시간 미리보기 · undo/redo · **draft→라이브 반영 분리** · 통계(방문자·CTR·재방문율).
--
-- ─────────────────────────────────────────────────────────────────────
-- 설계 결정 3가지
-- ─────────────────────────────────────────────────────────────────────
-- ① link_items → link_blocks. 블록마다 필드가 다르므로 컬럼을 늘리지 않고
--    `type` + `data jsonb` 로 간다. 컬럼으로 풀면 18종 × 평균 5필드 = 90컬럼이 되고,
--    대부분이 항상 null 이다. 검증은 앱(lib/links/blocks.ts)과 여기 check 제약이 함께 한다.
--
-- ② **draft / published 분리.** 링크팜의 "라이브 반영" 버튼이 이걸 한다.
--    link_blocks 는 **초안**이다. 공개 페이지는 link_pages.published_snapshot(jsonb)만
--    읽는다. 이유는 둘:
--      · 편집 중인 반쪽짜리 상태가 방문자에게 보이면 안 된다
--      · 공개 경로가 **조인 없는 단일 행 조회**가 된다(SNS 프로필에서 유입되는 트래픽이
--        몰리는 경로다. 블록 20개면 조인+정렬 대신 jsonb 한 번)
--
-- ③ 방문(page view)을 클릭과 따로 센다. CTR·재방문율을 계산하려면 분모가 필요하다.
--    개인 식별은 저장하지 않는다 — 재방문 판정은 **날짜+임의 토큰의 해시**로만 한다
--    (원문 IP·UA 를 저장하지 않으므로 역추적 불가).
--
-- 적용: Supabase 대시보드 → SQL Editor.

-- ════════════════════════════════════════════════════════════════════
-- 1. link_pages 확장 — 프로필·테마·SEO·발행 스냅샷
-- ════════════════════════════════════════════════════════════════════
alter table public.link_pages
  add column if not exists layout      text not null default 'profile'
    check (layout in ('profile', 'cover', 'cover_profile')),
  add column if not exists theme       text not null default 'basic',
  add column if not exists align       text not null default 'center'
    check (align in ('left', 'center', 'right')),
  add column if not exists avatar_path text,
  add column if not exists cover_path  text,
  -- SNS 아이콘 줄 — [{kind:'instagram', url:'...'}]. 순서가 곧 표시 순서다.
  add column if not exists sns_links   jsonb not null default '[]'::jsonb,
  add column if not exists seo_title   text check (seo_title is null or char_length(seo_title) <= 60),
  add column if not exists seo_desc    text check (seo_desc  is null or char_length(seo_desc)  <= 160),
  -- 공개본. null 이면 "아직 한 번도 라이브 반영 안 함" = 공개 페이지 404
  add column if not exists published_snapshot jsonb,
  add column if not exists published_at timestamptz;

comment on column public.link_pages.published_snapshot is
  '공개 페이지가 읽는 유일한 소스. link_blocks(초안)를 "라이브 반영"할 때 서버가 굽는다. 조인 없는 단일 행 조회를 위해 존재한다.';

-- ════════════════════════════════════════════════════════════════════
-- 2. link_blocks — 초안 블록
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.link_blocks (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.link_pages(id) on delete cascade,
  -- 앱(lib/links/blocks.ts)의 BLOCK_TYPES 와 **반드시 같이 바꾼다**.
  -- DB 가 모르는 타입이 들어오면 공개 페이지가 렌더할 수 없어 조용히 사라진다.
  type       text not null check (type in (
    'link','heading','text','divider','spacer','image','image_card',
    'video','card_row','grid','notice','social_feed','contact','subscribe','map'
  )),
  data       jsonb not null default '{}'::jsonb,
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists link_blocks_page_idx on public.link_blocks (page_id, sort_order, created_at);
create trigger trg_link_blocks_updated before update on public.link_blocks
  for each row execute function public.set_updated_at();

-- 0045 의 link_items 를 블록으로 이관한다(운영 데이터 0건이지만, 개발 DB 를 위해).
insert into public.link_blocks (page_id, type, data, sort_order, active, created_at)
select i.page_id, 'link',
       jsonb_build_object('label', i.label, 'url', i.url),
       i.sort_order, i.active, i.created_at
  from public.link_items i
 where not exists (select 1 from public.link_blocks b where b.page_id = i.page_id)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════
-- 3. 방문 집계 — CTR·재방문율의 분모
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.link_views (
  id         bigserial primary key,
  page_id    uuid not null references public.link_pages(id) on delete cascade,
  -- 재방문 판정용 익명 해시. **원문 IP·UA 를 저장하지 않는다** — 서버가 만든
  -- 임의 토큰을 쿠키에 심고 그 토큰의 해시만 남긴다(역추적 불가, 기기 교체 시 리셋).
  visitor_hash text,
  -- 지역은 Vercel 이 주는 국가/도시 코드만. 좌표·상세주소는 안 받는다.
  country    text,
  region     text,
  created_at timestamptz not null default now()
);
create index if not exists link_views_page_time_idx on public.link_views (page_id, created_at desc);
create index if not exists link_views_visitor_idx on public.link_views (page_id, visitor_hash)
  where visitor_hash is not null;

-- link_clicks 확장:
--  · visitor_hash — "몇 번" 이 아니라 "몇 명이" 눌렀는지 세려면 필요하다
--  · block_id     — 0045 의 item_id 는 link_items FK 라 블록 모델에서 못 쓴다.
--                   블록 단위 집계는 이 컬럼으로 한다(item_id 는 이후 null 로 남는다).
alter table public.link_clicks
  add column if not exists visitor_hash text,
  add column if not exists block_id uuid references public.link_blocks(id) on delete set null;

create index if not exists link_clicks_block_idx on public.link_clicks (block_id)
  where block_id is not null;

-- item_id 가 not null 이었다면 블록 모델에서 insert 가 막힌다 — 풀어준다.
alter table public.link_clicks alter column item_id drop not null;

-- ════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ════════════════════════════════════════════════════════════════════
alter table public.link_blocks enable row level security;
alter table public.link_views  enable row level security;

drop policy if exists "own link blocks" on public.link_blocks;
create policy "own link blocks" on public.link_blocks
  for all to authenticated
  using (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()));

-- ⚠️ link_blocks 에 **공개 읽기 정책을 주지 않는다.** 초안이기 때문이다.
--    공개 페이지는 link_pages.published_snapshot 만 읽는다(이미 "public link page read" 로 열려 있다).

-- 방문 기록도 클릭과 같다: 읽기만 소유자에게, INSERT 는 서버(service_role) 전용.
drop policy if exists "own link views read" on public.link_views;
create policy "own link views read" on public.link_views
  for select to authenticated
  using (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════════
-- 5. 구 link_items 정리
-- ════════════════════════════════════════════════════════════════════
-- 바로 지우지 않는다 — 0048 을 적용한 뒤 화면이 정상인지 확인하고 나서 지운다.
-- 확인 후 실행할 것:  drop table public.link_items;
comment on table public.link_items is
  '⚠️ 0048 에서 link_blocks 로 대체됨. 화면 확인 후 drop 할 것. 새 코드는 이 표를 쓰지 않는다.';

-- ════════════════════════════════════════════════════════════════════
-- 6. link_leads — 문의받기·구독신청으로 들어온 방문자 정보
-- ════════════════════════════════════════════════════════════════════
-- ⚠️ inquiries(0017)를 재사용하지 않는다. 그건 **핀치 사용자가 핀치에 보내는 문의**로
--    user_id 가 문의한 사람이다. 여기는 **방문자가 우리 사용자에게 남기는 리드**라
--    주체가 반대다. 같은 표에 섞으면 고객센터 화면에 남의 방문자 리드가 뜬다.
create table if not exists public.link_leads (
  id         bigserial primary key,
  page_id    uuid not null references public.link_pages(id) on delete cascade,
  block_id   uuid references public.link_blocks(id) on delete set null,
  kind       text not null check (kind in ('contact','subscribe')),
  name       text check (name is null or char_length(name) <= 60),
  email      text check (email is null or char_length(email) <= 160),
  phone      text check (phone is null or char_length(phone) <= 40),
  message    text check (message is null or char_length(message) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists link_leads_page_time_idx on public.link_leads (page_id, created_at desc);

alter table public.link_leads enable row level security;

-- 페이지 주인만 읽는다. INSERT 정책은 **주지 않는다** —
-- 방문자 제출은 서버 액션이 service_role 로 넣는다(익명 INSERT 를 열면 스팸 창구가 된다).
drop policy if exists "own link leads read" on public.link_leads;
create policy "own link leads read" on public.link_leads
  for select to authenticated
  using (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════════
-- 7. link-assets 버킷 — 프로필 사진·커버·블록 이미지
-- ════════════════════════════════════════════════════════════════════
-- 공개 버킷이다: 공개 페이지(/p/{slug})가 방문자에게 그대로 내보내는 이미지라
-- 서명 URL 을 쓰면 만료될 때마다 남의 페이지가 깨진다.
-- 업로드·삭제는 **본인 폴더(user_id/...)** 로만 — cardnews(0010) 와 같은 패턴.
insert into storage.buckets (id, name, public)
values ('link-assets', 'link-assets', true)
on conflict (id) do nothing;

drop policy if exists "own link assets upload" on storage.objects;
create policy "own link assets upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'link-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own link assets update" on storage.objects;
create policy "own link assets update" on storage.objects
  for update to authenticated
  using (bucket_id = 'link-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own link assets delete" on storage.objects;
create policy "own link assets delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'link-assets' and (storage.foldername(name))[1] = auth.uid()::text);
