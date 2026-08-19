-- 0050_link_stats_and_slug_owner.sql — 0049 적용 후 회귀 점검에서 확정된 DB 결함 3건
--
-- 2026-08-19. 0049 를 적용한 **직후** 전수 회귀 점검에서 나온 것들이다.
-- 0049 는 이미 프로덕션에 적용됐으므로 그 파일은 손대지 않고 여기서 덮는다.
--
-- 적용: Supabase 대시보드 → SQL Editor.

-- ════════════════════════════════════════════════════════════════════
-- ① 통계 집계 두 곳이 틀렸다 (link_page_stats 재정의)
-- ════════════════════════════════════════════════════════════════════
-- (1) 날짜 경계가 어긋났다.
--     행 필터는 "지금으로부터 n일 전"(= 오늘 18시면 7일 전 18시)인데 버킷은 KST 자정
--     기준이었다. 그래서 **첫 날 버킷에 하루가 아니라 몇 시간치만** 담겼다.
--     그냥 낮은 게 아니라 더 나쁘다 — 차트(components/ui/charts.tsx 의 DualLineChart)가
--     계열별 min/max 로 정규화하므로, 그 낮은 첫 점이 min 이 되어 **나머지 날들의
--     변동폭까지 눌러 평평하게** 만든다. 경계를 둘 다 KST 자정에 맞춘다.
--
-- (2) 블록별 클릭에서 order by 가 limit **바깥**에 있었다.
--     `select ... group by 1 limit 50` 은 정렬 없이 50개를 자르고, 바깥 jsonb_agg 의
--     order by 는 이미 잘린 것들만 줄 세운다. 클릭된 블록이 51개를 넘는 순간
--     uuid 순으로 아무거나 50개가 뽑혀 **641회짜리 대표 링크가 목록에서 사라진다.**
--     바로 아래 regions 는 처음부터 안쪽에서 정렬하고 있었다 — blocks 만 빠뜨렸다.
create or replace function public.link_page_stats(p_page uuid, p_days int)
returns jsonb
language sql
security invoker
stable
as $$
  with bounds as (
    -- 필터·버킷 공통 시작점. KST 자정 기준이라 첫 날도 온전한 하루다.
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
        -- order by 가 limit **안쪽**이어야 상위 50개가 뽑힌다
        from (select block_id, count(*) as n from c where block_id is not null
               group by 1 order by n desc limit 50) b
    ),
    'regions', (
      select coalesce(jsonb_agg(jsonb_build_object('country', country, 'region', region, 'n', n) order by n desc), '[]'::jsonb)
        from (
          select country, region, count(*) as n from v
           where country is not null group by 1, 2 order by n desc limit 8
        ) r
    )
  );
$$;

revoke all on function public.link_page_stats(uuid, int) from public;
grant execute on function public.link_page_stats(uuid, int) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- ② 주소 무덤이 **본인**을 막고 있었다
-- ════════════════════════════════════════════════════════════════════
-- 0049 는 되찾기 판별의 유일한 근거를 `page_id` 로 뒀는데, 그 컬럼이
-- `on delete set null` 이다. 즉 페이지를 지우는 순간 근거가 사라져서,
-- **본인이 자기 옛 주소를 다시 쓰려 하면 "최근까지 다른 사람이 쓰던 주소예요"** 라는
-- 거짓말을 듣는다. 소유권은 페이지가 아니라 **사람**에 붙어야 한다.
--
-- ⚠️ on delete **set null** 이다. cascade 로 하면 탈퇴 시 무덤 행이 통째로 사라져
--    이 표가 막으려던 선점 창구가 도로 열린다. 사람이 없어져도 주소는 식어야 한다.
alter table public.link_slug_history
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- 이미 쌓인 행이 있으면 페이지 소유자로 채운다(현재 0행이지만 재적용 안전하게).
update public.link_slug_history h
   set owner_id = p.user_id
  from public.link_pages p
 where h.page_id = p.id and h.owner_id is null;

create index if not exists link_slug_history_owner_idx
  on public.link_slug_history (owner_id) where owner_id is not null;

comment on column public.link_slug_history.owner_id is
  '주소를 놓은 사람. 되찾기 판별의 근거다 — page_id 는 페이지 삭제 시 null 이 되어 본인 판별에 쓸 수 없다(0050).';
