-- 0083_link_views_apply_dwell.sql — 체류시간 일괄 반영 함수 (2026-09-06, 방문 집계 버퍼링)
--
-- 배경: 프로필 링크 방문·체류 비콘을 Upstash Redis 에 모았다가 /api/cron/flush-views 가 1분마다 묶어 넣는다
-- (lib/links/views.ts). 방문은 INSERT 배열 한 번이면 되지만, 체류는 «같은 방문자의 최근 방문 행을 찾아
-- 더 큰 값으로 UPDATE» 라 행마다 SELECT+UPDATE 두 왕복이었다. 이 함수는 그것을 **한 문장**으로 한다:
-- jsonb 배열 [{slug, hash, ms}] 를 받아 (페이지, 방문자) 별 최신 행 하나를 고르고, 지금 값보다 클 때만 갱신.
--
-- 규칙(코드 쪽 recordDwell 과 같다):
--  · 최근 65분 안의 행만 — 방문 창 30분 + 체류 상한 30분 + 여유(감사 L16 의 산식).
--  · ms 는 0~1,800,000(30분) 으로 자른다. 같은 (slug, hash) 가 여러 번 오면 최댓값.
--  · 행을 새로 만들지 않는다 — 방문이 기록되지 않은(비공개·잠금·천장) 페이지의 체류는 자연히 버려진다.
--  · slug 로 page 를 찾는다 — 비콘 시점엔 page id 를 조회하지 않아(DB 왕복 0) slug 만 있다.
--
-- 호출자: service_role(크론)뿐. anon/authenticated 에게서 실행 권한을 거둔다.
-- 미적용 상태에서 크론은 «함수 없음» 을 보고 행 단위 옛 경로(상한 100/회)로 내려간다 — 방문 집계 자체는 영향 없다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

create or replace function public.link_views_apply_dwell(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with items as (
    select
      i->>'slug' as slug,
      i->>'hash' as visitor_hash,
      least(greatest((i->>'ms')::integer, 0), 1800000) as ms
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
    where (i->>'slug') is not null
      and (i->>'hash') is not null
      and (i->>'ms') ~ '^[0-9]{1,9}$'
  ),
  agg as (
    select slug, visitor_hash, max(ms) as ms
    from items
    group by slug, visitor_hash
  ),
  target as (
    select distinct on (v.page_id, v.visitor_hash) v.id, a.ms
    from agg a
    join public.link_pages p on p.slug = a.slug
    join public.link_views v on v.page_id = p.id and v.visitor_hash = a.visitor_hash
    where v.created_at >= now() - interval '65 minutes'
    order by v.page_id, v.visitor_hash, v.created_at desc
  )
  update public.link_views v
     set dwell_ms = t.ms
    from target t
   where v.id = t.id
     and (v.dwell_ms is null or v.dwell_ms < t.ms);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- 0032 부터 이 스키마의 새 함수는 public 에 자동 실행 권한이 없다 — service_role 에 **명시적으로** 준다(0004·0032 와 같은 패턴).
-- 이 줄이 없으면 크론의 rpc 가 42501(permission denied) 로 실패하고, 코드가 «미적용»과 헷갈릴 수 있다(소넷 점검).
revoke all on function public.link_views_apply_dwell(jsonb) from public;
revoke all on function public.link_views_apply_dwell(jsonb) from anon, authenticated;
grant execute on function public.link_views_apply_dwell(jsonb) to service_role;

-- 확인: select public.link_views_apply_dwell('[]'::jsonb);  → 0
