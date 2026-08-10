-- 0027_shared_pool.sql — 공용 레퍼런스 풀 (중앙 크롤 + 전원 검색)
--
-- 왜 만드는가
-- ------------------------------------------------------------------
-- 기존 reference_items 는 unique(user_id, channel, external_id) 라서 같은 게시물을
-- 사용자 수만큼 복제 저장한다. 100명이 "다이어트"를 등록하면 공급사 호출 100회,
-- AI 요약 100회, 저장 100행이 나간다. 사용자가 늘수록 원가가 선형으로 증가하고
-- 겹치는 키워드에서 절감이 0이다.
--
-- 여기서는 unique(platform, external_id) — 전역 1행이다. 크롤은 우리가 한 번 하고
-- 전원이 같은 행을 읽는다. 사용자 1만 명이어도 크롤 원가는 키워드 수에만 비례한다.
--
-- 규모 전제: 사용자 10,000명 / 소재 500만 행 / 브랜드 5만 행.
-- 인덱스와 파티션 경계를 그 규모에 맞춰 잡았다.
--
-- RLS 원칙 (CLAUDE.md 인증 규칙 승계)
-- ------------------------------------------------------------------
-- 공용 표는 SELECT 정책만 만든다. INSERT/UPDATE/DELETE 정책을 만들지 않으면
-- authenticated 는 RLS 기본 거부로 자동 차단되고, service_role 은 RLS 를 우회하므로
-- 크롤러만 쓸 수 있다. 개인 상태는 0029 의 별도 표에 own-row 정책으로 둔다.

create extension if not exists pg_trgm;

-- ────────────────────────────────────────────────────────────────
-- 1. 업종 분류
-- ────────────────────────────────────────────────────────────────
create table if not exists public.industries (
  id          text primary key,
  name_ko     text not null,
  group_key   text not null,          -- 대분류 (허브 화면 그룹 헤더)
  sort_order  int  not null default 0,
  -- 자격 미달 업종을 화면에서 감추는 스위치. 롤업 크론이 계산해 채운다 —
  -- 사람이 켜고 끄면 반드시 빈 업종이 노출된다.
  is_visible  boolean not null default false,
  brand_count int  not null default 0,
  creative_count int not null default 0,
  stats_at    timestamptz
);

-- 크롤러의 작업 원천. 사용자 검색어가 여기로 승격되면서 풀이 스스로 자란다.
create table if not exists public.industry_keywords (
  id          uuid primary key default gen_random_uuid(),
  industry_id text not null references public.industries(id) on delete cascade,
  platform    text not null check (platform in ('meta_ads','instagram','tiktok','threads')),
  keyword     text not null check (char_length(keyword) between 1 and 60),
  origin      text not null default 'seed'
              check (origin in ('seed','user_search','ai_expand','brand','migrated')),
  weight      int  not null default 100,
  crawl_count int  not null default 0,
  hit_count   int  not null default 0,   -- 이 키워드로 실제 건진 신규 소재 수
  last_crawled_at timestamptz,
  is_active   boolean not null default true,
  unique (industry_id, platform, keyword)
);

-- 플래너가 매 회차 "오래 안 돈 것 우선"으로 뽑는다. 부분 인덱스로 활성분만 태운다.
create index if not exists idx_ind_kw_due
  on public.industry_keywords (platform, last_crawled_at nulls first, weight desc)
  where is_active;

-- ────────────────────────────────────────────────────────────────
-- 2. 브랜드 / 계정
-- ────────────────────────────────────────────────────────────────
create table if not exists public.brands (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('meta','instagram','tiktok','threads')),
  -- FB page_id / IG pk / TikTok uid. 이름이 아니라 ID 로 잡는다 —
  -- '㈜아모레퍼시픽'과 '아모레퍼시픽'이 다른 브랜드가 되면 브랜드 단위 분류가 무너진다.
  external_id   text not null,
  handle        text,
  name          text not null,
  profile_url   text,
  avatar_path   text,                    -- Storage 경로만. 공개 URL 은 앱이 조립
  follower_count  bigint not null default 0,
  active_ad_count int    not null default 0,  -- company/ads 1콜이 주는 총 게재중 수
  industry_ids  text[] not null default '{}',
  industry_source text not null default 'seed'
                  check (industry_source in ('seed','ai','manual')),
  multi_category boolean not null default false,  -- true 면 소재 단위 재분류 대상
  save_count    int not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  status        text not null default 'ok' check (status in ('ok','blocked')),
  unique (platform, external_id)
);

create index if not exists idx_brands_industry on public.brands using gin (industry_ids);
create index if not exists idx_brands_name_trgm on public.brands using gin (name gin_trgm_ops);
create index if not exists idx_brands_rank on public.brands (active_ad_count desc) where status = 'ok';

-- ────────────────────────────────────────────────────────────────
-- 3. 소재 풀 — 광고·오가닉 통합
-- ────────────────────────────────────────────────────────────────
create table if not exists public.creatives (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('ad','post')),
  platform     text not null check (platform in ('meta_ads','instagram','tiktok','threads')),
  external_id  text not null,
  brand_id     uuid references public.brands(id) on delete set null,

  title        text not null default '',
  body         text not null default '' check (char_length(body) <= 600),
  cta_text     text,
  permalink    text,                     -- 원본 링크. 저작권 안전장치라 반드시 보존
  thumb_path   text,                     -- Storage 경로
  -- 공급사 CDN 원본 URL. 서명 만료가 있는 임시값이라 캐시 성공 시 즉시 비운다.
  -- 이 값을 화면에 그대로 쓰면 며칠 뒤 카드가 전부 깨진다 — 캐시 큐의 입력으로만 쓴다.
  thumb_src    text,
  thumb_state  text not null default 'pending'
               check (thumb_state in ('pending','ok','failed','none')),
  media_format text not null default 'photo'
               check (media_format in ('video','photo','carousel','text')),

  -- 오가닉 지표 (광고는 0)
  views    bigint not null default 0,
  likes    bigint not null default 0,
  comments bigint not null default 0,
  follower_count bigint not null default 0,   -- 게시 시점 계정 팔로워 (도달 배수 계산용)

  -- 광고 지표 (오가닉은 null)
  is_active    boolean,
  started_at   timestamptz,
  ended_at     timestamptz,
  run_days     int,
  ad_platforms text[] not null default '{}',

  -- 분류·검색. 정규화 대신 배열 역정규화 — 500만 행에서 조인 1회를 없애는 값이
  -- 정규화의 이점보다 크다. GIN 으로 커버한다.
  industry_ids     text[] not null default '{}',
  industry_source  text not null default 'keyword'
                   check (industry_source in ('keyword','ai','manual')),
  matched_keywords text[] not null default '{}',
  lang    text,
  country text not null default 'KR',

  -- AI 부가 (배치 enrich 가 채움. 사용자 요청 시점이 아니다)
  ai_summary text not null default '',
  ai_hooks   jsonb not null default '[]'::jsonb,

  heat_score  real not null default 0,
  dedupe_hash text,                       -- 재업로드 접기용 보조 키
  posted_at     timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  takedown_at   timestamptz,              -- 삭제 요청 대응 — 행을 지우지 않고 가린다
  unique (platform, external_id)
);

-- 검색 경로 인덱스. 500만 행 기준으로 잡았다.
create index if not exists idx_cre_industry  on public.creatives using gin (industry_ids)
  where takedown_at is null;
create index if not exists idx_cre_body_trgm on public.creatives using gin (body gin_trgm_ops)
  where takedown_at is null;
create index if not exists idx_cre_heat      on public.creatives (heat_score desc, id desc)
  where takedown_at is null;
create index if not exists idx_cre_recent    on public.creatives (posted_at desc nulls last, id desc)
  where takedown_at is null;
create index if not exists idx_cre_brand     on public.creatives (brand_id, posted_at desc)
  where takedown_at is null;
create index if not exists idx_cre_platform  on public.creatives (platform, heat_score desc)
  where takedown_at is null;
-- 썸네일 캐시 큐. 히트 높은 것부터 채운다 — 500만 건을 전부 캐시하면 스토리지 요금이
-- 공급사 크레딧을 넘는다. 사용자가 실제로 보는 상위부터 채우고 나머지는 열람 시 채운다.
create index if not exists idx_cre_thumb_todo on public.creatives (thumb_state, heat_score desc)
  where thumb_state in ('pending','failed');

/*
  썸네일 상태 불변식 — DB 가 지킨다.

  같은 광고는 여러 키워드에 걸려 몇 번이고 다시 upsert 된다. upsert 는 보낸 컬럼을
  전부 덮으므로, 앱 코드에 맡기면 이미 캐시한 썸네일이 재수집 때마다 pending 으로
  되돌아가 같은 이미지를 무한히 다시 받는다. 대역폭이 조용히 새는 종류의 버그다.

  그래서 thumb_state 는 앱이 정하지 않는다. 여기서만 정한다:
    path 있음        → ok      (그리고 만료되는 src 는 비운다)
    같은 src 로 실패 → failed  (다시 큐에 안 올린다)
    src 만 있음      → pending
    둘 다 없음       → none
*/
create or replace function public.normalize_thumb_state()
returns trigger as $$
declare
  v_old_path text := null;
  v_old_src  text := null;
begin
  if tg_op = 'UPDATE' then
    v_old_path := old.thumb_path;
    v_old_src  := old.thumb_src;
  end if;

  -- 이미 캐시한 이미지는 재수집이 지우지 못한다
  if new.thumb_path is null and v_old_path is not null then
    new.thumb_path := v_old_path;
  end if;

  if new.thumb_path is not null then
    new.thumb_state := 'ok';
    new.thumb_src   := null;
  elsif new.thumb_state = 'failed' and new.thumb_src is not distinct from v_old_src then
    new.thumb_state := 'failed';
  elsif new.thumb_src is not null then
    new.thumb_state := 'pending';
  else
    new.thumb_state := 'none';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_creatives_thumb_state on public.creatives;
create trigger trg_creatives_thumb_state
  before insert or update on public.creatives
  for each row execute function public.normalize_thumb_state();

/*
  업종·매칭 키워드 누적 — 이것도 DB 가 지킨다.

  한 소재는 여러 검색어에 걸린다. '웨딩'으로 잡힌 광고가 '스드메'로 또 잡히는 건
  정상이고, 오히려 그 중첩이 검색 적중률을 만든다. 그런데 upsert 는 보낸 배열로
  통째로 덮으므로, 앱에 맡기면 나중 수집이 앞선 매칭을 지운다.

  덮어쓰기가 아니라 합집합으로 만든다. 그리고 AI·수동으로 정해진 업종은
  키워드 기반 수집이 되돌리지 못하게 막는다 — 사람이 고친 걸 기계가 되돌리면
  같은 오분류를 영원히 다시 고쳐야 한다.
*/
create or replace function public.merge_creative_tags()
returns trigger as $$
declare
  v_kws text[];
begin
  if tg_op = 'UPDATE' then
    if old.industry_source in ('ai', 'manual') then
      new.industry_ids    := old.industry_ids;
      new.industry_source := old.industry_source;
    else
      select array_agg(distinct x) into new.industry_ids
        from unnest(coalesce(old.industry_ids, '{}') || coalesce(new.industry_ids, '{}')) as x;
    end if;

    select array_agg(distinct x) into v_kws
      from unnest(coalesce(old.matched_keywords, '{}') || coalesce(new.matched_keywords, '{}')) as x;
    -- 무한히 늘지 않게 자른다. 오래된 매칭 근거는 가치가 낮다.
    new.matched_keywords := v_kws[1:12];

    -- 최초 발견 시각은 갱신하지 않는다("언제부터 돌던 광고인가"가 지워진다)
    new.first_seen_at := old.first_seen_at;
  end if;

  new.industry_ids     := coalesce(new.industry_ids, '{}');
  new.matched_keywords := coalesce(new.matched_keywords, '{}');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_creatives_merge_tags on public.creatives;
create trigger trg_creatives_merge_tags
  before insert or update on public.creatives
  for each row execute function public.merge_creative_tags();

-- ────────────────────────────────────────────────────────────────
-- 4. 집계 — 큰 표를 저장 이벤트마다 UPDATE 하지 않으려고 분리한다
-- ────────────────────────────────────────────────────────────────
create table if not exists public.creative_stats (
  creative_id uuid primary key references public.creatives(id) on delete cascade,
  save_count  int not null default 0,
  view_count  int not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_cre_stats_saved on public.creative_stats (save_count desc)
  where save_count > 0;

-- ────────────────────────────────────────────────────────────────
-- 5. 유료 산출물 공용 캐시 — 한 명이 사면 전원이 무료로 본다.
--    공용 풀의 세일즈 포인트이자 원가 절감 장치.
--    created_by 는 여기 두지 않는다(PII 를 공용 읽기 표에 넣지 않는다).
-- ────────────────────────────────────────────────────────────────
create table if not exists public.creative_transcripts (
  creative_id uuid primary key references public.creatives(id) on delete cascade,
  transcript  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.creative_analyses (
  creative_id    uuid primary key references public.creatives(id) on delete cascade,
  hook_breakdown jsonb not null default '{}'::jsonb,
  target_guess   text  not null default '',
  improvement    text  not null default '',
  model          text  not null default '',
  created_at     timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────
-- 6. RLS — 공용 표는 SELECT 정책만. 쓰기 정책을 만들지 않는 것이 곧 차단이다.
-- ────────────────────────────────────────────────────────────────
alter table public.industries           enable row level security;
alter table public.industry_keywords    enable row level security;
alter table public.brands               enable row level security;
alter table public.creatives            enable row level security;
alter table public.creative_stats       enable row level security;
alter table public.creative_transcripts enable row level security;
alter table public.creative_analyses    enable row level security;

drop policy if exists "pool read industries" on public.industries;
create policy "pool read industries" on public.industries
  for select to authenticated using (is_visible);

drop policy if exists "pool read brands" on public.brands;
create policy "pool read brands" on public.brands
  for select to authenticated using (status <> 'blocked');

drop policy if exists "pool read creatives" on public.creatives;
create policy "pool read creatives" on public.creatives
  for select to authenticated using (takedown_at is null);

drop policy if exists "pool read stats" on public.creative_stats;
create policy "pool read stats" on public.creative_stats
  for select to authenticated using (true);

drop policy if exists "pool read transcripts" on public.creative_transcripts;
create policy "pool read transcripts" on public.creative_transcripts
  for select to authenticated using (true);

drop policy if exists "pool read analyses" on public.creative_analyses;
create policy "pool read analyses" on public.creative_analyses
  for select to authenticated using (true);

-- industry_keywords 는 운영 데이터라 사용자에게 아예 안 보인다 (정책 0개).

-- 의도 명시(이중 방어) — 정책 부재만으로도 막히지만 권한 자체를 회수해 둔다.
revoke insert, update, delete on public.industries           from authenticated, anon;
revoke insert, update, delete on public.industry_keywords    from authenticated, anon;
revoke insert, update, delete on public.brands               from authenticated, anon;
revoke insert, update, delete on public.creatives            from authenticated, anon;
revoke insert, update, delete on public.creative_stats       from authenticated, anon;
revoke insert, update, delete on public.creative_transcripts from authenticated, anon;
revoke insert, update, delete on public.creative_analyses    from authenticated, anon;
revoke select on public.industry_keywords from authenticated, anon;
