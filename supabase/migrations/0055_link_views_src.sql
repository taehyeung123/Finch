-- 0055_link_views_src.sql — 플랫폼별 추적 링크(유입 채널)
--
-- 링크팜 설정의 「SNS 링크 설정」 카피(2026-08-20 대조 7번): 같은 공개 주소에
-- ?src=instagram 처럼 채널 표식만 달아 복사해 쓰면, 방문이 어느 채널 프로필에서
-- 왔는지 통계에 잡힌다.
--
-- src 는 허용 목록(check)만 — recordView 가 목록 밖 값을 null 로 바꾸지만,
-- DB 도 같은 상한을 알아야 다른 경로의 오염을 막는다.
--
-- ⚠️ 앱 코드는 이 마이그레이션이 없어도 동작한다 — recordView 가 src 컬럼 오류를
-- 계단식 폴백으로 받고, 옛 link_page_stats 는 sources 키 없이 응답하며 화면은
-- 그 섹션을 그리지 않는다.
--
-- 적용: Supabase 대시보드 → SQL Editor.

alter table public.link_views
  add column if not exists src text
    check (src is null or src in ('instagram', 'tiktok', 'threads', 'youtube', 'x'));

-- 집계에 sources 추가 — 0050 본문 그대로 + sources 키 하나
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
      -- src 가 null 인 방문(직접·표식 없는 링크)도 한 줄로 함께 나온다
      select coalesce(jsonb_agg(jsonb_build_object('src', src, 'n', n) order by n desc), '[]'::jsonb)
        from (select src, count(*) as n from v group by 1 order by n desc limit 8) s
    )
  );
$$;

revoke all on function public.link_page_stats(uuid, int) from public;
grant execute on function public.link_page_stats(uuid, int) to authenticated;
