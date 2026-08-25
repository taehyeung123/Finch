-- 0062: 링크 테이블 RLS 최적화 — auth.uid() 를 행마다 재평가하지 않게(initplan)
--
-- 배경(2026-08-24 Supabase 성능 린트 auth_rls_initplan):
--  정책 식에 auth.uid() 를 그냥 쓰면 Postgres 가 **행마다** 함수를 호출한다.
--  (select auth.uid()) 로 감싸면 InitPlan 으로 한 번만 평가하고 결과를 재사용한다.
--  방문·클릭은 페이지가 뜰 때마다 쌓이는 표라, 통계 화면이 커질수록 이 차이가 그대로 지연이 된다.
--
-- 정책의 **의미는 하나도 바꾸지 않는다** — 같은 식에 괄호만 씌운다. 이름·대상 역할·명령도 그대로.

-- link_pages — 본인 행
drop policy if exists "own link page" on public.link_pages;
create policy "own link page" on public.link_pages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 자식 표 — 내 페이지에 속하는가
drop policy if exists "own link blocks" on public.link_blocks;
create policy "own link blocks" on public.link_blocks
  for all to authenticated
  using (exists (select 1 from public.link_pages p where p.id = link_blocks.page_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.link_pages p where p.id = link_blocks.page_id and p.user_id = (select auth.uid())));

drop policy if exists "own link clicks read" on public.link_clicks;
create policy "own link clicks read" on public.link_clicks
  for select to authenticated
  using (exists (select 1 from public.link_pages p where p.id = link_clicks.page_id and p.user_id = (select auth.uid())));

drop policy if exists "own link views read" on public.link_views;
create policy "own link views read" on public.link_views
  for select to authenticated
  using (exists (select 1 from public.link_pages p where p.id = link_views.page_id and p.user_id = (select auth.uid())));

drop policy if exists "own link leads read" on public.link_leads;
create policy "own link leads read" on public.link_leads
  for select to authenticated
  using (exists (select 1 from public.link_pages p where p.id = link_leads.page_id and p.user_id = (select auth.uid())));

drop policy if exists "own guestbook manage" on public.link_guestbook;
create policy "own guestbook manage" on public.link_guestbook
  for all to authenticated
  using (exists (select 1 from public.link_pages p where p.id = link_guestbook.page_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.link_pages p where p.id = link_guestbook.page_id and p.user_id = (select auth.uid())));

drop policy if exists "own page secret" on public.link_page_secrets;
create policy "own page secret" on public.link_page_secrets
  for all to authenticated
  using (exists (select 1 from public.link_pages p where p.id = link_page_secrets.page_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.link_pages p where p.id = link_page_secrets.page_id and p.user_id = (select auth.uid())));
