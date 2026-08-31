-- 0077_meta_ad_accounts.sql — 메타 광고 계정 연동
--
-- 왜 connected_accounts 를 재사용하지 않는가 (2026-09-01 설계 검토):
--  ① 0001_core.sql:58 의 check 가 channel 을 instagram/tiktok/threads 로 못박아 값을 못 넣는다.
--  ② 0004 의 `unique (channel, platform_user_id)` 는 **사용자를 넘는 전역 유니크**다.
--     목적이 «웹훅 소유자 판정의 모호성 제거»(그 파일 주석)인데 광고엔 웹훅 소유자 개념이 없고,
--     대행사와 광고주가 같은 계정을 각자 연결하는 것이 정상 시나리오다.
--  ③ 광고 계정은 **한 사람이 여러 개**를 갖는 것이 정상인데, connected_accounts 는
--     채널당 1행을 전제로 조회된다(live.ts·publish/actions.ts 등이 .maybeSingle()).
--  ④ handle·followers·posts·avg_engagement_rate 가 광고엔 의미 없는 더미가 된다.
--
-- 왜 표를 둘로 나누는가:
--   **토큰은 계정이 아니라 사람에 붙는다.** FB 사용자 토큰 하나가 /me/adaccounts 의 N개를 전부 커버한다.
--   계정 행마다 토큰을 복사하면 같은 토큰이 N번 암호화 저장되는데, AES-256-GCM 은 IV 가 매번 달라
--   **같은 값인지 대조조차 불가능**하다. 60일 재연동·스코프 변경 때마다 N행 정합성 문제가 된다.
--
-- ⚠️ 페이스북 장기 사용자 토큰은 **자동 갱신이 없다**(공식 문서 확인, 2026-09-01).
--   약 60일 뒤 만료되고 재로그인 외에는 방법이 없다 — 인스타/스레드(ig_refresh_token·th_refresh_token)와
--   근본적으로 다르다. 그래서 만료일을 화면에 **숨기지 않고 보여준다**(틱톡과 반대 규칙).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- ── 연결(사람 단위) — 토큰이 사는 곳 ──────────────────────────────────
create table if not exists public.meta_ad_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- 연동 해제·데이터 삭제 콜백이 signed_request 의 user_id 로 이 행을 찾는다
  fb_user_id          text not null,
  fb_name             text,
  access_token_cipher text,
  token_expires_at    timestamptz,
  -- 동의 시점에 실제로 부여된 스코프. null = 확인 불가(«권한 없음»과 다르다, 0075 규칙)
  granted_scopes      text[],
  connected           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, fb_user_id)
);
-- 해제·삭제 콜백은 사용자 전체에서 fb_user_id 로 찾는다 — 유니크가 (user_id, …)라 이 조회는 인덱스가 없다
create index if not exists meta_ad_connections_fb_uid_idx
  on public.meta_ad_connections (fb_user_id);

-- ── 광고 계정(N개) ────────────────────────────────────────────────────
create table if not exists public.meta_ad_accounts (
  id             uuid primary key default gen_random_uuid(),
  connection_id  uuid not null references public.meta_ad_connections(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- ⚠️ act_ 접두를 **빼고 숫자만** 저장하고 호출할 때 act_${id} 로 조립한다.
  --    접두 유무가 섞이면 조회가 조용히 404 로 떨어진다(Meta 는 /act_123 과 /123 을 다르게 본다).
  ad_account_id  text not null,
  account_name   text,
  -- 계정 통화. **환산하지 않는다** — 화면이 계정 통화 그대로 표기한다(KRW 가정 금지)
  currency       text,
  timezone_name  text,
  -- 1=활성, 2=비활성, 3=미납 등 (Meta AdAccount.account_status)
  account_status integer,
  -- 사용자가 기본으로 보는 계정. 여러 개 연결해도 화면은 하나를 먼저 보여준다
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, ad_account_id)
);
create index if not exists meta_ad_accounts_conn_idx
  on public.meta_ad_accounts (connection_id);

-- ── RLS — connected_accounts(0064) 와 같은 4정책 패턴 ─────────────────
-- 읽기는 본인 + 활성 팀 멤버(소유자 행), 쓰기는 본인만.
-- (select auth.uid()) 로 감싸는 것은 initplan 최적화 — 안 감싸면 행마다 재평가된다.
alter table public.meta_ad_connections enable row level security;
alter table public.meta_ad_accounts    enable row level security;

-- ⚠️ team_members 의 컬럼명은 owner_user_id / member_user_id 다(0012). 0064 정책을 그대로 옮긴다.
-- 쓰기를 ALL 하나로 두지 않고 3종으로 쪼개는 것도 0064 와 같은 이유다 —
-- ALL 은 SELECT 에도 걸려 읽기마다 정책이 두 번 평가된다.
drop policy if exists "ad connections read" on public.meta_ad_connections;
create policy "ad connections read" on public.meta_ad_connections for select to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.team_members tm
      where tm.owner_user_id = meta_ad_connections.user_id
        and tm.member_user_id = (select auth.uid())
        and tm.status = 'active'
    )
  );
drop policy if exists "ad connections insert" on public.meta_ad_connections;
create policy "ad connections insert" on public.meta_ad_connections for insert to public
  with check ((select auth.uid()) = user_id);
drop policy if exists "ad connections update" on public.meta_ad_connections;
create policy "ad connections update" on public.meta_ad_connections for update to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "ad connections delete" on public.meta_ad_connections;
create policy "ad connections delete" on public.meta_ad_connections for delete to public
  using ((select auth.uid()) = user_id);

drop policy if exists "ad accounts read" on public.meta_ad_accounts;
create policy "ad accounts read" on public.meta_ad_accounts for select to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.team_members tm
      where tm.owner_user_id = meta_ad_accounts.user_id
        and tm.member_user_id = (select auth.uid())
        and tm.status = 'active'
    )
  );
drop policy if exists "ad accounts insert" on public.meta_ad_accounts;
create policy "ad accounts insert" on public.meta_ad_accounts for insert to public
  with check ((select auth.uid()) = user_id);
drop policy if exists "ad accounts update" on public.meta_ad_accounts;
create policy "ad accounts update" on public.meta_ad_accounts for update to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "ad accounts delete" on public.meta_ad_accounts;
create policy "ad accounts delete" on public.meta_ad_accounts for delete to public
  using ((select auth.uid()) = user_id);

drop trigger if exists trg_meta_ad_connections_updated on public.meta_ad_connections;
create trigger trg_meta_ad_connections_updated before update on public.meta_ad_connections
  for each row execute function public.set_updated_at();
drop trigger if exists trg_meta_ad_accounts_updated on public.meta_ad_accounts;
create trigger trg_meta_ad_accounts_updated before update on public.meta_ad_accounts
  for each row execute function public.set_updated_at();

-- ── 0076 의 채널 목록에 광고를 넣는다 ─────────────────────────────────
-- 광고 연동 해제·데이터 삭제 콜백도 요청을 기록해야 하는데, 지금 check 가 세 채널뿐이라
-- 기록하는 순간 insert 가 막힌다(0077 을 만들면서 옆 표에서 같은 함정이 반복될 뻔했다).
alter table public.data_deletion_requests
  drop constraint if exists data_deletion_requests_channel_check;
alter table public.data_deletion_requests
  add constraint data_deletion_requests_channel_check
  check (channel in ('instagram', 'threads', 'tiktok', 'meta_ads'));

comment on table public.meta_ad_connections is
  '메타 광고 연동(사람 단위) — FB 사용자 토큰이 여기 산다. ⚠️ FB 장기토큰은 자동 갱신이 없어 약 60일마다 재연동이 필요하다.';
comment on table public.meta_ad_accounts is
  '연동된 광고 계정(N개). ad_account_id 는 act_ 접두 없이 숫자만 — 호출 시 조립한다.';
