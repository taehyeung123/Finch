-- 0059_link_audit_hardening.sql — 프로필 링크 1~5단계 전 영역 감사(2026-08-23) 반영
--
-- ① link_unlock_attempts — 비밀번호 페이지 시도 횟수를 **DB 에** 센다.
--    0058 의 인스턴스 메모리 카운터는 방문자 쿠키로 키를 잡아 쿠키를 안 보내면 매번 새 키였다(감사 C1).
--    조회·기록은 전부 service_role. 정책 없음 = anon·authenticated 는 읽지도 쓰지도 못한다.
-- ② 풀린 주소 90일 보류를 **DB 트리거로** 강제 — 앱(slugHeldByOther)만 보던 규칙이라 PostgREST 직접 호출로
--    남의 옛 주소를 즉시 선점할 수 있었다(감사 C2). 0046 §④ 가 예약어를 DB 로 옮긴 것과 같은 패턴.
-- ③ link_pages_publish_stamp — settings(0058) 변경은 초안 수정이 아니다. 언어·비밀번호를 바꾸면
--    updated_at 이 올라 「초안 수정됨」이 떴고, 발행을 누르게 해 반쪽 초안이 딸려 나갔다(감사 C3).
-- ④ link_clicks.item_idx — 그룹(card_row·grid·최근 게시물) 안 항목별 중복 판정 키(감사 C11).
--    없으면 같은 블록의 다른 항목을 1분 안에 누른 클릭이 버려졌다.
-- ⑤ "public link page read" 를 anon 전용으로 — 로그인한 아무 계정이 남의 발행 페이지 **초안 컬럼**(sns_links·
--    theme_custom·user_id…)을 REST 로 읽을 수 있었다(감사 L1). 로그인한 방문자는 서버가 service_role 로
--    공개 컬럼만 골라 읽는다(app/p/[slug]/public-page.ts). 방명록 공개 읽기도 같은 역할로 좁힌다.
-- ⑥ link_page_stats 에 search_path 고정(Supabase advisor WARN).
--
-- 적용: Supabase 대시보드 → SQL Editor (0058 이후).

-- ① 비밀번호 시도 기록
create table if not exists public.link_unlock_attempts (
  id           bigserial primary key,
  page_id      uuid not null references public.link_pages(id) on delete cascade,
  visitor_hash text,
  created_at   timestamptz not null default now()
);
create index if not exists link_unlock_attempts_page_time_idx on public.link_unlock_attempts (page_id, created_at desc);
alter table public.link_unlock_attempts enable row level security;
revoke all on public.link_unlock_attempts from anon, authenticated;
comment on table public.link_unlock_attempts is
  '비밀번호 페이지 실패 시도(0059). 페이지 단위 천장 + 방문자 해시 단위 제한. service_role 전용, 10분 창 밖은 의미 없음.';

-- ② 풀린 주소 보류 — SECURITY DEFINER 여야 한다: link_slug_history 는 정책이 없어 invoker 권한으론 0행(=통과)이다.
create or replace function public.link_pages_guard_slug_hold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;
  if exists (
    select 1 from public.link_slug_history h
     where h.slug = new.slug
       -- 주인이 없는(탈퇴) 무덤도 보류한다 — 앱의 === 비교와 같은 뜻
       and h.owner_id is distinct from new.user_id
       and h.released_at > now() - interval '90 days'
  ) then
    raise exception '최근까지 다른 사람이 쓰던 주소예요' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.link_pages_guard_slug_hold() from public;
drop trigger if exists trg_link_pages_slug_hold on public.link_pages;
create trigger trg_link_pages_slug_hold
  before insert or update of slug on public.link_pages
  for each row execute function public.link_pages_guard_slug_hold();

-- ③ settings 만 바뀐 저장은 초안 수정이 아니다 — 0056 본문 + settings 조건
create or replace function public.link_pages_publish_stamp()
returns trigger language plpgsql as $$
begin
  if new.published_snapshot is distinct from old.published_snapshot then
    new.published_at := now();
    new.updated_at   := new.published_at;
  elsif (new.published is distinct from old.published or new.settings is distinct from old.settings)
    and (new.slug, new.title, new.bio, new.layout, new.theme, new.theme_custom, new.align,
         new.avatar_path, new.cover_path, new.sns_links, new.sns_placement, new.title_size,
         new.seo_title, new.seo_desc)
        is not distinct from
        (old.slug, old.title, old.bio, old.layout, old.theme, old.theme_custom, old.align,
         old.avatar_path, old.cover_path, old.sns_links, old.sns_placement, old.title_size,
         old.seo_title, old.seo_desc)
  then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

-- ④ 클릭 항목 인덱스
alter table public.link_clicks add column if not exists item_idx smallint;
comment on column public.link_clicks.item_idx is '그룹 블록 안 항목 번호(0059). 단일 블록은 null. 중복 판정 키에만 쓴다 — 집계는 block_id.';

-- ⑤ 발행 페이지 공개 읽기는 anon 만. 로그인 사용자는 자기 행(own link page)만 직접 읽는다.
drop policy if exists "public link page read" on public.link_pages;
create policy "public link page read" on public.link_pages
  for select to anon
  using (published = true and coalesce((settings->>'locked')::boolean, false) = false);

drop policy if exists "public guestbook read" on public.link_guestbook;
create policy "public guestbook read" on public.link_guestbook
  for select to anon
  using (
    hidden = false
    and exists (
      select 1 from public.link_pages p
       where p.id = page_id and p.published = true
         and coalesce((p.settings->>'locked')::boolean, false) = false
    )
  );

-- ⑥ link_page_stats — search_path 고정(advisor) + anon EXECUTE 회수(기본 권한이 anon 에도 붙는다; revoke from public 은 그걸 못 지운다)
--    + daily 집계를 날짜별 한 번만 묶는다(0055/0058 은 날짜 수만큼 전체 창을 다시 훑어 90일×수만 행이면 초 단위였다).
create or replace function public.link_page_stats(p_page uuid, p_days int)
returns jsonb
language sql
security invoker
stable
set search_path = public
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
  ),
  vd as (select (created_at at time zone 'Asia/Seoul')::date as d, count(*) as n from v group by 1),
  cd as (select (created_at at time zone 'Asia/Seoul')::date as d, count(*) as n from c group by 1)
  select jsonb_build_object(
    'views',   (select count(*) from v),
    'uniques', (select count(*) from visitor),
    'repeats', (select count(*) from visitor where n > 1),
    'clicks',  (select count(*) from c),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('d', days.d, 'v', coalesce(vd.n, 0), 'c', coalesce(cd.n, 0)) order by days.d), '[]'::jsonb)
        from days left join vd on vd.d = days.d left join cd on cd.d = days.d
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
    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('device', device, 'n', n) order by n desc), '[]'::jsonb)
        from (select device, count(*) as n from v group by 1 order by n desc) d
    ),
    'referrers', (
      select coalesce(jsonb_agg(jsonb_build_object('host', referrer_host, 'n', n) order by n desc), '[]'::jsonb)
        from (select referrer_host, count(*) as n from v group by 1 order by n desc limit 8) r
    ),
    'dwell', (
      select jsonb_build_object('avg_ms', coalesce(round(avg(dwell_ms)), 0), 'n', count(*))
        from v where dwell_ms is not null
    )
  );
$$;
revoke execute on function public.link_page_stats(uuid, int) from public, anon;
grant execute on function public.link_page_stats(uuid, int) to authenticated;
revoke execute on function public.link_pages_guard_slug_hold() from public, anon, authenticated;

-- ⑧ settings 원자 패치 — 앱이 "읽고-합치고-쓰기"를 하면 잠금 문구 저장과 비밀번호 걸기가 겹칠 때 한쪽이 사라진다
--    (locked:true 가 되돌아가 "걸었어요" 토스트 뒤에 페이지가 열려 있는 최악의 경우, 소넷 점검). jsonb || 로 한 문장에 합친다.
create or replace function public.link_pages_patch_settings(p_patch jsonb)
returns jsonb
language sql
security invoker
volatile
set search_path = public
as $$
  update public.link_pages
     set settings = coalesce(settings, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where user_id = auth.uid()
  returning settings;
$$;
revoke execute on function public.link_pages_patch_settings(jsonb) from public, anon;
grant execute on function public.link_pages_patch_settings(jsonb) to authenticated;

-- ⑦ link-assets 버킷 상한 — 파일 공유 블록이 브라우저에서 Storage 로 **직접** 올리므로(서명 URL) 크기·형식 검사는
--    버킷이 해야 한다. 서버 액션은 클라이언트가 보낸 이름·크기만 보고 URL 을 내주기 때문(소넷 점검).
--    이미지 업로드(uploadLinkImage)가 쓰는 형식도 함께 허용한다.
update storage.buckets
   set file_size_limit = 20 * 1024 * 1024,
       allowed_mime_types = array[
         'application/pdf', 'application/zip',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/x-hwp', 'text/plain', 'text/csv',
         'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'
       ]
 where id = 'link-assets';

-- 본인 폴더 목록 읽기 — 업로드 뒤 실제 크기 확인(finalizeLinkFileUpload)에 필요. 0048 은 insert/update/delete 만 줬다.
drop policy if exists "own link assets read" on storage.objects;
create policy "own link assets read" on storage.objects
  for select to authenticated
  using (bucket_id = 'link-assets' and (storage.foldername(name))[1] = auth.uid()::text);
