-- 0049_link_blocks_fixes.sql — 0048 블록 빌더의 DB 층 결함 5건
--
-- 2026-08-19. 0048 을 적용한 뒤 링크팜 실측 구조와 대조 점검하면서 확정한 것들이다.
-- 전부 "코드만 고쳐서는 못 막는" 것 — 제약·트리거·권한이 원인이다.
--
-- 적용: Supabase 대시보드 → SQL Editor.

-- ════════════════════════════════════════════════════════════════════
-- ① block_id 의 FK 를 뗀다 — 방문자 문의가 통째로 사라지고 있었다
-- ════════════════════════════════════════════════════════════════════
-- 0048 은 link_clicks.block_id·link_leads.block_id 를 link_blocks(초안 표) 로
-- 참조하게 걸었다. 그런데 공개 페이지가 읽는 건 **초안이 아니라 스냅샷**이다
-- (app/p/[slug]/go/[id]/route.ts, app/p/[slug]/page.tsx 둘 다 published_snapshot).
--
-- 그래서 이런 상태가 정상 워크플로에서 만들어진다:
--   블록을 지웠다 → 아직 「라이브 반영」을 안 눌렀다 → 공개 페이지는 옛 스냅샷을
--   계속 서빙한다 → 방문자가 그 블록의 문의 폼을 제출한다 → **FK 위반(23503)**
--   → 방문자는 "접수하지 못했어요"만 보고, 문의는 어디에도 안 남는다.
-- 클릭도 같은 경로로 조용히 증발한다(에러가 콘솔에만 찍힌다).
--
-- 「템플릿 적용」은 그 페이지 블록을 **전부** 지우고 새 id 로 다시 깐다 —
-- 템플릿 한 번이면 라이브에 걸린 모든 문의 폼이 동시에 죽는다.
--
-- block_id 는 성격상 **스냅샷에 굳은 id** 를 가리킨다. 초안 표를 참조할 이유가
-- 처음부터 없었다. 인덱스(link_clicks_block_idx)는 그대로 둔다 — 집계에 쓴다.
alter table public.link_clicks drop constraint if exists link_clicks_block_id_fkey;
alter table public.link_leads  drop constraint if exists link_leads_block_id_fkey;

comment on column public.link_clicks.block_id is
  '스냅샷에 굳은 블록 id. link_blocks 를 참조하지 않는다(0049) — 초안에서 지워도 라이브에는 남아 있고, 그 클릭은 반드시 기록돼야 한다.';
comment on column public.link_leads.block_id is
  '스냅샷에 굳은 블록 id. link_blocks 를 참조하지 않는다(0049) — 초안에서 지운 폼으로 들어온 문의도 반드시 남아야 한다.';

-- ════════════════════════════════════════════════════════════════════
-- ② 「라이브 반영」 뒤에도 영원히 "초안" 이던 문제
-- ════════════════════════════════════════════════════════════════════
-- 화면은 `link_pages.updated_at > published_at` 이면 "초안이 발행본과 다르다"로
-- 읽는다. 그런데 두 값의 **출처가 달랐다**:
--   · published_at — 앱(Node) 서버가 요청을 보내기 **전에** new Date() 로 만든 값
--   · updated_at   — trg_link_pages_updated 가 DB 에서 now() 로 덮는 값
-- 발행 UPDATE 하나에 둘 다 걸리므로 항상 `updated_at = published_at + 왕복지연` 이고,
-- 판정이 발행 직후에도 참이다. 결과: 「반영됨」 상태에 **도달할 수 없었다.**
-- 상시 경고는 곧 무시되는 경고이고, 사장님은 발행 여부를 화면으로 확인할 수 없었다.
--
-- 시각을 만드는 자리를 DB 한 곳으로 모은다. 앱은 published_at 을 더 이상 보내지 않는다.
create or replace function public.link_pages_publish_stamp()
returns trigger language plpgsql as $$
begin
  -- 발행: published_at 과 updated_at 을 **같은 트랜잭션 시각**으로 맞춘다.
  if new.published_snapshot is distinct from old.published_snapshot then
    new.published_at := now();
    new.updated_at   := new.published_at;

  -- 공개 토글은 **초안 변경이 아니다.** published 만 바뀐 UPDATE 가 updated_at 을
  -- 올리면 "공개 스위치를 껐다 켰더니 초안이 됐다"는 거짓 신호가 나간다.
  elsif new.published is distinct from old.published
    and (new.slug, new.title, new.bio, new.layout, new.theme, new.align,
         new.avatar_path, new.cover_path, new.sns_links, new.seo_title, new.seo_desc)
        is not distinct from
        (old.slug, old.title, old.bio, old.layout, old.theme, old.align,
         old.avatar_path, old.cover_path, old.sns_links, old.seo_title, old.seo_desc)
  then
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

-- ⚠️ 이름이 중요하다. Postgres 는 같은 시점의 BEFORE 트리거를 **이름 알파벳순**으로
--    실행한다. set_updated_at 을 도로 덮어써야 하므로 trg_link_pages_updated 뒤에
--    와야 한다 — 그래서 zz 다.
drop trigger if exists trg_link_pages_zz_publish on public.link_pages;
create trigger trg_link_pages_zz_publish before update on public.link_pages
  for each row execute function public.link_pages_publish_stamp();

-- ════════════════════════════════════════════════════════════════════
-- ③ 발행자 명부와 소유자 내부 id 가 익명에게 통째로 열려 있었다
-- ════════════════════════════════════════════════════════════════════
-- 0045 의 "public link page read" 정책은 **행만** 거른다(published = true).
-- 컬럼은 안 거르므로, 브라우저 번들에 들어 있는 anon 키로 이거 한 방이면 끝이었다:
--     GET /rest/v1/link_pages?select=slug,user_id
-- → 발행된 모든 페이지의 주소 + 소유자 auth.users.id 전량.
--
-- 익명 경로가 실제로 필요로 하는 컬럼은 넷뿐이다:
--   app/p/[slug]/page.tsx        → id, slug, published, published_snapshot
--   app/p/[slug]/go/[id]/route.ts→ id, published_snapshot (where slug, published)
--   app/p/[slug]/actions.ts      → id             (where slug, published)
-- 0027·0028·0046 이 다른 표에 이미 쓰는 패턴이다 — link_pages 만 빠져 있었다.
--
-- authenticated 는 손대지 않는다: 자기 행을 user_id 로 조회하는 코드가 여럿이고
-- (Postgres 는 WHERE 절 컬럼에도 SELECT 권한을 요구한다) RLS 가 남의 행은 이미 막는다.
revoke select on public.link_pages from anon;
grant select (id, slug, published, published_snapshot) on public.link_pages to anon;

-- ════════════════════════════════════════════════════════════════════
-- ④ 주소를 바꾸면 옛 주소를 남이 즉시 선점할 수 있었다
-- ════════════════════════════════════════════════════════════════════
-- 인플루언서가 /p/oldname → /p/newname 으로 바꾸면, 인스타 프로필·DM·명함에 남은
-- 옛 주소 트래픽이 그대로 살아 있다. 그 slug 를 남이 즉시 가져가면 유입뿐 아니라
-- **방문자가 남기는 문의(이름·이메일·전화)** 까지 선점자 계정으로 들어간다.
-- 원 소유자가 되찾을 수단이 없다.
create table if not exists public.link_slug_history (
  slug        text primary key,
  page_id     uuid references public.link_pages(id) on delete set null,
  released_at timestamptz not null default now()
);
comment on table public.link_slug_history is
  '풀린 slug 의 무덤. 앱이 90일간 재사용을 막는다(app/(app)/links/actions.ts). 원 소유자는 언제든 되찾을 수 있다(page_id 로 판별).';

alter table public.link_slug_history enable row level security;
-- 정책을 주지 않는다 = authenticated·anon 은 읽지도 쓰지도 못한다.
-- 조회·기록은 전부 서버(service_role)가 한다. 열어두면 "누가 어떤 주소를 버렸나"가
-- 그 자체로 명부가 된다.

-- ════════════════════════════════════════════════════════════════════
-- ⑤ 유입 제한을 위한 컬럼·인덱스
-- ════════════════════════════════════════════════════════════════════
-- 방문·클릭·리드 세 경로가 전부 인증 없이 service_role 로 INSERT 한다. 0048 이
-- 익명 INSERT 정책을 안 준 이유("스팸 창구가 된다")를 서버 액션이 그대로 재현하고
-- 있었다 — 정책만 없고 창구는 열려 있었다. 앱이 DB 를 세어 막는다(서버리스라
-- 메모리 카운터는 인스턴스끼리 공유되지 않는다).
--
-- link_leads 에 visitor_hash 를 더한다. link_views·link_clicks 는 이미 갖고 있다.
-- **원문 IP·UA 는 여기서도 저장하지 않는다** — 서버가 만든 임의 토큰의 해시다.
alter table public.link_leads add column if not exists visitor_hash text;

-- 0048 의 link_views_visitor_idx 는 (page_id, visitor_hash) 까지다. 같은 방문자의
-- **마지막 방문 시각**을 찾는 질의(방문 중복 집계 차단)가 정렬을 따로 돌게 된다.
create index if not exists link_views_visitor_time_idx
  on public.link_views (page_id, visitor_hash, created_at desc)
  where visitor_hash is not null;

create index if not exists link_leads_visitor_time_idx
  on public.link_leads (page_id, visitor_hash, created_at desc)
  where visitor_hash is not null;

-- ════════════════════════════════════════════════════════════════════
-- ⑥ 통계를 SQL 에서 집계한다 — JS 로 세면 숫자가 틀린다
-- ════════════════════════════════════════════════════════════════════
-- 화면은 방문 행을 통째로 끌어와 JS 로 셌다. PostgREST 는 db-max-rows(기본 1000)
-- 에서 응답을 자르므로, 방문이 1000건을 넘는 순간 **분모가 1000 에서 멈추고
-- 클릭률이 100% 를 넘는다.** 게다가 /links 를 열 때마다 수천 행이 오간다.
--
-- 그리고 0048 이 쌓기 시작한 것들 — country/region, block_id — 을 읽는 코드가
-- 한 줄도 없었다. link_clicks_block_idx 전용 인덱스까지 만들어 놓고 쓰는 질의가
-- 없었다. 여기서 한 번에 집계해 내보낸다.
--
-- security invoker 다: 호출자 권한으로 돌아 RLS 가 그대로 적용된다
-- (link_views·link_clicks 의 "own ... read" 정책). 남의 page_id 를 넣으면 0 이 나온다.
-- 날짜 경계는 **KST** 다 — 사용자가 보는 "어제"와 그래프의 "어제"가 같아야 한다.
create or replace function public.link_page_stats(p_page uuid, p_days int)
returns jsonb
language sql
security invoker
stable
as $$
  with bounds as (
    select now() - (greatest(least(p_days, 365), 1) || ' days')::interval as since
  ),
  v as (
    select * from public.link_views, bounds
     where page_id = p_page and link_views.created_at >= bounds.since
  ),
  c as (
    select * from public.link_clicks, bounds
     where page_id = p_page and link_clicks.created_at >= bounds.since
  ),
  visitor as (
    select visitor_hash, count(*) as n from v where visitor_hash is not null group by 1
  ),
  days as (
    select (generate_series(
             (select date_trunc('day', since at time zone 'Asia/Seoul') from bounds),
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
        from (select block_id, count(*) as n from c where block_id is not null group by 1 limit 50) b
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
