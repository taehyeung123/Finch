-- 0058_link_page_settings_and_analytics.sql — 리틀리 흡수 5단계
--
-- ① link_pages.settings jsonb — 페이지 설정(언어·새창/현재창·검색 노출·OG·파비콘·잠금 안내·locked) + link_page_secrets(비밀번호 해시).
--    블록·테마와 달리 발행 스냅샷을 거치지 않고 **즉시** 적용되는 운영값이다(lib/links/settings.ts).
--    비밀번호 해시는 jsonb 에 두지 않는다 — 로그인한 누구나 발행 행을 읽을 수 있는 표라서(아래 설명).
-- ② link_views 에 device / referrer_host / dwell_ms — 기기·유입 리퍼러·체류시간.
--    원문 UA·전체 리퍼러 URL 은 저장하지 않는다(0048 의 "원문 IP·UA 를 저장하지 않는다" 원칙 유지):
--    device 는 3분류, referrer_host 는 호스트명만, dwell 은 ms 정수(상한 30분).
-- ③ link_page_stats 에 devices / referrers / dwell 키 추가 — 0055 본문 그대로 + 세 키.
--
-- ⚠️ 앱 코드는 이 마이그레이션이 없어도 동작한다 — settings 컬럼 조회는 계단식 폴백,
--    recordView 는 새 컬럼 없이 다시 insert, 옛 link_page_stats 는 새 키 없이 응답하고 화면은
--    그 섹션을 그리지 않는다. 페이지 설정 저장만 "0058 적용 후" 안내를 낸다.
--
-- 적용: Supabase 대시보드 → SQL Editor.

-- ① 페이지 설정 — 비밀이 아닌 값만 jsonb 에. anon 도 읽는다(공개 페이지가 언어·새창·OG·잠금 여부를 본다).
alter table public.link_pages
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.link_pages.settings is
  '페이지 설정(0058): lang·target·robots·ogTitle·ogImage·favicon·lockMessage·locked. 비밀번호 해시는 link_page_secrets 에 따로 둔다.';

grant select (settings) on public.link_pages to anon;

-- 비밀번호 해시는 **별도 표** — link_pages 는 "public link page read" 정책으로 로그인한 누구나
-- 발행된 행의 전 컬럼을 읽을 수 있어(0049 가 anon 만 좁혔다), jsonb 에 넣으면 남의 해시를
-- 오프라인으로 때려볼 수 있다. 이 표는 주인만 읽고, 공개 페이지는 서버(service_role)가 대조한다.
create table if not exists public.link_page_secrets (
  page_id       uuid primary key references public.link_pages(id) on delete cascade,
  -- PBKDF2-SHA256(100k) — "salt$hex". 원문 비밀번호는 어디에도 남지 않는다.
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

alter table public.link_page_secrets enable row level security;

drop policy if exists "own page secret" on public.link_page_secrets;
create policy "own page secret" on public.link_page_secrets
  for all to authenticated
  using (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.link_pages p where p.id = page_id and p.user_id = auth.uid()));

revoke all on public.link_page_secrets from anon;
grant select, insert, update, delete on public.link_page_secrets to authenticated;

comment on table public.link_page_secrets is
  '프로필 링크 비밀번호 페이지(0058) — 페이지당 해시 1개. settings.locked=true 와 함께 간다.';

-- 잠긴 페이지는 **행 자체를** 주인 외엔 숨긴다 — 공개 페이지가 잠금 화면만 그려도, 앱의 anon 키로
-- REST 를 직접 찔러 published_snapshot(블록·주소 전부)을 읽거나 /go 로 목적지를 받아갈 수 있으면
-- 비밀번호는 장식이다(소넷 점검 5단계 #1). 잠긴 페이지의 읽기는 서버가 service_role 로 쿠키를 대조한
-- 뒤에만 한다(app/p/[slug]/public-page.ts). 0045 의 정책 본문 + locked 조건.
drop policy if exists "public link page read" on public.link_pages;
create policy "public link page read" on public.link_pages
  for select to anon, authenticated
  using (published = true and coalesce((settings->>'locked')::boolean, false) = false);

-- 방명록 공개 읽기도 같은 조건(0057 본문 + locked)
drop policy if exists "public guestbook read" on public.link_guestbook;
create policy "public guestbook read" on public.link_guestbook
  for select to anon, authenticated
  using (
    hidden = false
    and exists (
      select 1 from public.link_pages p
       where p.id = page_id and p.published = true
         and coalesce((p.settings->>'locked')::boolean, false) = false
    )
  );

-- ② 방문 기록 확장
alter table public.link_views
  add column if not exists device text
    check (device is null or device in ('mobile', 'tablet', 'desktop')),
  add column if not exists referrer_host text,
  add column if not exists dwell_ms integer
    check (dwell_ms is null or (dwell_ms >= 0 and dwell_ms <= 1800000));

-- ③ 집계 — 0055 본문 + devices / referrers / dwell
create or replace function public.link_page_stats(p_page uuid, p_days int)
returns jsonb
language sql
security invoker
stable
as $$
  with bounds as (
    select date_trunc('day', now() at time zone 'Asia/Seoul')
             - ((greatest(least(p_days, 365), 1) - 1) || ' days')::interval as since_local
  ),
  v as (
    select * from public.link_views, bounds
     where page_id = p_page
       and link_views.created_at >= (bounds.since_local at time zone 'Asia/Seoul')
  ),
  c as (
    select * from public.link_clicks, bounds
     where page_id = p_page
       and link_clicks.created_at >= (bounds.since_local at time zone 'Asia/Seoul')
  ),
  visitor as (
    select visitor_hash, count(*) as n from v where visitor_hash is not null group by 1
  ),
  days as (
    select (generate_series(
             (select since_local from bounds),
             date_trunc('day', now() at time zone 'Asia/Seoul'),
             '1 day'
           ))::date as d
  )
  select jsonb_build_object(
    'views',   (select count(*) from v),
    'uniques', (select count(*) from visitor),
    'repeats', (select count(*) from visitor where n > 1),
    'clicks',  (select count(*) from c),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'v', vc, 'c', cc) order by d), '[]'::jsonb)
        from (
          select days.d,
                 (select count(*) from v where (v.created_at at time zone 'Asia/Seoul')::date = days.d) as vc,
                 (select count(*) from c where (c.created_at at time zone 'Asia/Seoul')::date = days.d) as cc
            from days
        ) t
    ),
    'blocks', (
      select coalesce(jsonb_agg(jsonb_build_object('id', block_id, 'n', n) order by n desc), '[]'::jsonb)
        from (select block_id, count(*) as n from c where block_id is not null
               group by 1 order by n desc limit 50) b
    ),
    'regions', (
      select coalesce(jsonb_agg(jsonb_build_object('country', country, 'region', region, 'n', n) order by n desc), '[]'::jsonb)
        from (
          select country, region, count(*) as n from v
           where country is not null group by 1, 2 order by n desc limit 8
        ) r
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('src', src, 'n', n) order by n desc), '[]'::jsonb)
        from (select src, count(*) as n from v group by 1 order by n desc limit 8) s
    ),
    -- 0058: 기기 3분류(null = 0058 이전 기록·판정 불가)
    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('device', device, 'n', n) order by n desc), '[]'::jsonb)
        from (select device, count(*) as n from v group by 1 order by n desc) d
    ),
    -- 0058: 유입 리퍼러 호스트(null = 직접 입력·앱 내부 브라우저 등 리퍼러 없음)
    'referrers', (
      select coalesce(jsonb_agg(jsonb_build_object('host', referrer_host, 'n', n) order by n desc), '[]'::jsonb)
        from (select referrer_host, count(*) as n from v group by 1 order by n desc limit 8) r
    ),
    -- 0058: 체류시간 — 비콘이 닿은 방문만(avg_ms) 과 그 표본 수(n)
    'dwell', (
      select jsonb_build_object('avg_ms', coalesce(round(avg(dwell_ms)), 0), 'n', count(*))
        from v where dwell_ms is not null
    )
  );
$$;

revoke all on function public.link_page_stats(uuid, int) from public;
grant execute on function public.link_page_stats(uuid, int) to authenticated;
