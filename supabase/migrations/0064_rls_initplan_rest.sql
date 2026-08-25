-- 0064_rls_initplan_rest.sql — 링크 밖 표 29개의 RLS 최적화 (0062 의 나머지)
--
-- 0062 가 link_* 표 7개에서 한 일을 **나머지 전 표**에 적용한다.
-- ① auth.uid() 를 (select auth.uid()) 로 감싼다 — 안 감싸면 **행마다** 함수가 다시 평가된다.
--    Postgres 는 감싼 형태를 InitPlan 으로 한 번만 계산한다. 행이 늘수록 차이가 커진다.
--    (Supabase performance lint: auth_rls_initplan, 34건 → 0건)
-- ② 같은 표·같은 역할·같은 동작에 permissive 정책이 둘이면 **둘 다** 평가된다.
--    connected_accounts·team_members 가 「ALL(본인)」 + 「SELECT(팀원/멤버)」 두 벌이라 읽기마다 두 번 돌았다.
--    ALL 을 쓰기 3종으로 쪼개고 읽기만 하나로 합친다 — **권한은 그대로다**:
--      · ALL 정책을 두고 SELECT 정책만 지우면 팀원이 계정을 못 읽는다.
--      · ALL 정책의 using 에 팀원 조건을 넣으면 팀원이 쓰기까지 얻는다.
--    그래서 읽기만 OR 로 합치고 쓰기는 본인/주인으로 남긴다.
--    (Supabase performance lint: multiple_permissive_policies, 10건 → 0건)
--
-- 역할 목록(to public / to authenticated)은 **바꾸지 않는다** — 이번 변경은 순수하게 평가 비용만 줄인다.
-- 프로덕션 트랜잭션 드라이런(begin…rollback) 통과: 감싸지 않은 정책 0건, connected_accounts 4·team_members 4,
-- 롤백 뒤 원래 정책 복귀 확인.

drop policy if exists "own ad sources" on public.ad_sources;
create policy "own ad sources" on public.ad_sources for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own rules" on public.auto_dm_rules;
create policy "own rules" on public.auto_dm_rules for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own boards" on public.boards;
create policy "own boards" on public.boards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own brand kits" on public.brand_kits;
create policy "own brand kits" on public.brand_kits for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own brand profile" on public.brand_profiles;
create policy "own brand profile" on public.brand_profiles for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own consent" on public.commenter_consent;
create policy "own consent" on public.commenter_consent for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own sends" on public.dm_sends;
create policy "own sends" on public.dm_sends for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own notification settings" on public.notification_settings;
create policy "own notification settings" on public.notification_settings for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own reference ads" on public.reference_ads;
create policy "own reference ads" on public.reference_ads for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own reference collect lock" on public.reference_collect_locks;
create policy "own reference collect lock" on public.reference_collect_locks for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own collect settings" on public.reference_collect_settings;
create policy "own collect settings" on public.reference_collect_settings for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own reference items" on public.reference_items;
create policy "own reference items" on public.reference_items for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own reference sources" on public.reference_sources;
create policy "own reference sources" on public.reference_sources for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own reports" on public.reports;
create policy "own reports" on public.reports for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own saved brands" on public.saved_brands;
create policy "own saved brands" on public.saved_brands for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own saved creatives" on public.saved_creatives;
create policy "own saved creatives" on public.saved_creatives for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own scheduled posts" on public.scheduled_posts;
create policy "own scheduled posts" on public.scheduled_posts for all to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own search history" on public.search_history;
create policy "own search history" on public.search_history for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own orders" on public.creative_asset_orders;
create policy "own orders" on public.creative_asset_orders for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "본인 내역만 조회" on public.credit_transactions;
create policy "본인 내역만 조회" on public.credit_transactions for select to public using ((select auth.uid()) = user_id);

drop policy if exists "본인 문의 조회" on public.inquiries;
create policy "본인 문의 조회" on public.inquiries for select to public using ((select auth.uid()) = user_id);

drop policy if exists "own orders select" on public.payment_orders;
create policy "own orders select" on public.payment_orders for select to public using ((select auth.uid()) = user_id);

drop policy if exists "own subscriptions select" on public.subscriptions;
create policy "own subscriptions select" on public.subscriptions for select to public using ((select auth.uid()) = user_id);

drop policy if exists "read own usage" on public.usage_counters;
create policy "read own usage" on public.usage_counters for select to public using ((select auth.uid()) = user_id);

drop policy if exists "own profile select" on public.users_profile;
create policy "own profile select" on public.users_profile for select to authenticated using ((select auth.uid()) = id);

-- users_profile 수정(본인만)
drop policy if exists "own profile update" on public.users_profile;
create policy "own profile update" on public.users_profile for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- INSERT 전용(불변식 그대로 유지)
drop policy if exists "own misclass reports" on public.industry_misclass_reports;
create policy "own misclass reports" on public.industry_misclass_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "본인 문의 접수" on public.inquiries;
create policy "본인 문의 접수" on public.inquiries for insert to public
  with check ((select auth.uid()) = user_id and status = 'pending' and reply_body is null and replied_at is null);

drop policy if exists "own orders insert" on public.payment_orders;
create policy "own orders insert" on public.payment_orders for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'ready' and payment_key is null and approved_at is null);

-- ── 중복 permissive SELECT 병합 ────────────────────────────────────────────
-- 같은 표·같은 역할·같은 동작에 permissive 정책이 둘이면 **행마다 둘 다** 평가된다.
-- ALL 정책을 그대로 두고 SELECT 정책을 없애면 팀원이 남의 계정을 못 읽고,
-- ALL 정책의 using 에 팀원 조건을 넣으면 팀원이 **쓰기**까지 얻는다.
-- 그래서 ALL 을 쓰기 3종으로 쪼개고, 읽기만 하나로 합친다(권한 변화 없음).

-- connected_accounts: 본인 = 전권, 팀원 = 읽기만
drop policy if exists "own accounts" on public.connected_accounts;
drop policy if exists "team members read" on public.connected_accounts;
create policy "accounts read" on public.connected_accounts for select to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.team_members tm
      where tm.owner_user_id = connected_accounts.user_id
        and tm.member_user_id = (select auth.uid())
        and tm.status = 'active'
    )
  );
create policy "accounts insert" on public.connected_accounts for insert to public
  with check ((select auth.uid()) = user_id);
create policy "accounts update" on public.connected_accounts for update to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "accounts delete" on public.connected_accounts for delete to public
  using ((select auth.uid()) = user_id);

-- team_members: 주인 = 전권, 멤버 = 자기 행 읽기만
drop policy if exists "owner manage members" on public.team_members;
drop policy if exists "member reads own membership" on public.team_members;
create policy "members read" on public.team_members for select to public
  using ((select auth.uid()) = owner_user_id or (select auth.uid()) = member_user_id);
create policy "members insert" on public.team_members for insert to public
  with check ((select auth.uid()) = owner_user_id);
create policy "members update" on public.team_members for update to public
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "members delete" on public.team_members for delete to public
  using ((select auth.uid()) = owner_user_id);
