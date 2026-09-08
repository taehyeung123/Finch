-- 0088_lock_ad_account_id.sql — 광고 계정 id 를 잠근다 (High)
--
-- 무엇이 문제였나 (2026-09-08 보안 감사, High)
-- ------------------------------------------------------------------
-- `meta_ad_accounts` 에는 0077 이후 **열 단위 GRANT 도 형식 제약도 한 번도 걸린 적이 없다.**
-- 0085 는 connected_accounts·meta_ad_connections 만, 0086 은 link_pages·meta_ad_write_log 만 다뤘다.
-- 그래서 로그인 사용자는 PostgREST 로 이 표를 자유롭게 쓸 수 있었고, RLS 는 «내 행인가»(user_id)만 본다:
--
--   ① `ad_account_id` 를 **임의 문자열**로 바꿀 수 있었다. 그런데 그 값이
--      `${GRAPH_FB_BASE}/act_${ad_account_id}/campaigns` 처럼 **인코딩 없이** URL 경로에 조립된다.
--      WHATWG URL 파서가 `..` 를 해석하므로 `1/../../me/accounts?fields=…&x=` 를 넣으면
--      최종 요청이 `https://graph.facebook.com/me/accounts?…` 가 된다.
--   ② 더 단순한 변형: 탈출 문자 없이 **다른 광고 계정의 숫자 id** 로 바꾸기만 해도 옆걸음이 된다.
--   ③ `connection_id` 에 **남의 연결 id** 를 넣을 수 있었다. 0077 정책은 «내 연결인가»를 보지 않는다.
--
-- 그 호출에 실리는 토큰은 **워크스페이스 소유자의 것**이다(lib/data/ads.ts 가 ownerId 로 토큰을 찾는다).
-- 즉 활성 팀원 한 명이 소유자의 ads_management 토큰으로 임의 Graph 노드를 읽고,
-- editor 면 쓸 수도 있었다 — 소유자가 핀치에 연결한 적 없는 광고 계정에 캠페인을 만드는 것까지.
-- 감사 로그(meta_ad_write_log)의 ad_account_id 도 공격자가 넣은 문자열이라 소유자가 원인을 못 찾는다.
--
-- 방어는 세 겹이고 이 파일은 마지막 겹이다:
--   ① lib/meta/ad-account-id.ts — 숫자만 통과시키는 경로 조립 헬퍼(`/act_${id}` 를 손으로 쓰지 않는다)
--   ② lib/data/ads.ts — 형식 위반 행을 목록에서 빼고, 계정 행을 **user_id + connection_id 둘 다**로 좁힌다
--   ③ 여기 — DB 가 애초에 못 만들게 한다
--
-- ⚠️ **코드를 먼저 배포하고 이 마이그레이션을 나중에 적용한다.** (0085 와 같은 순서 규칙)
--    OAuth 콜백이 계정 행을 세션 클라이언트로 쓰고 있었는데 같은 커밋에서 service_role 로 옮겼다.
--    옛 코드에 이 SQL 만 먼저 들어가면 광고 연동이 «ads_accounts_unavailable» 로 떨어진다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- ────────────────────────────────────────────────────────────────
-- 0) 적용 **전** 확인 — 아래 두 쿼리가 0행이어야 한다(이미 심어진 흔적)
--    0행이 아니면 그 행을 먼저 확인·정리하고 다시 실행한다.
-- ────────────────────────────────────────────────────────────────
select id, user_id, connection_id, ad_account_id, account_name
from public.meta_ad_accounts
where ad_account_id !~ '^[0-9]{1,32}$';

select a.id, a.user_id as "행 주인", c.user_id as "연결 주인", a.ad_account_id
from public.meta_ad_accounts a
join public.meta_ad_connections c on c.id = a.connection_id
where a.user_id is distinct from c.user_id;

-- ────────────────────────────────────────────────────────────────
-- 1) 형식 — 숫자만
--    저장은 `act_` 접두를 빼고 숫자만 한다(0077 주석). 현행 계정 id 는 15~17자리.
--    NOT VALID 로 붙인다 — 기존 행 전수 검사 없이 **새로 만들거나 고치는 행부터** 즉시 적용된다.
--    위 확인 쿼리 ①이 0행이면 맨 아래 validate 를 한 번 더 실행해 기존 행까지 확정한다.
-- ────────────────────────────────────────────────────────────────
alter table public.meta_ad_accounts drop constraint if exists meta_ad_accounts_id_shape;
alter table public.meta_ad_accounts add constraint meta_ad_accounts_id_shape
  check (ad_account_id ~ '^[0-9]{1,32}$') not valid;

-- ────────────────────────────────────────────────────────────────
-- 2) 계정 행과 연결의 **주인이 같아야 한다** — 복합 FK 로 강제한다.
--    정책식으로는 표현할 수 없는 조건이라(다른 표의 값을 봐야 한다) 제약으로 못박는다.
--    기존 단일 FK(connection_id → meta_ad_connections.id, on delete cascade)는 **그대로 둔다** —
--    이름이 환경마다 다를 수 있고, 둘이 함께 있어도 해가 없으며 cascade 가 유지된다.
-- ────────────────────────────────────────────────────────────────
alter table public.meta_ad_connections
  drop constraint if exists meta_ad_connections_id_user_uniq;
alter table public.meta_ad_connections
  add constraint meta_ad_connections_id_user_uniq unique (id, user_id);

alter table public.meta_ad_accounts
  drop constraint if exists meta_ad_accounts_conn_owner_fkey;
alter table public.meta_ad_accounts
  add constraint meta_ad_accounts_conn_owner_fkey
  foreign key (connection_id, user_id)
  references public.meta_ad_connections (id, user_id)
  on delete cascade
  not valid;

-- ────────────────────────────────────────────────────────────────
-- 3) 열 단위 GRANT — 사용자가 바꿀 수 있는 것은 «기본 계정 고르기»와 «게시 주체»뿐이다.
--    소유·대상 컬럼(user_id·connection_id·ad_account_id)은 아예 쓰기 불가.
--    INSERT 는 통째로 회수한다 — 계정 행을 만드는 것은 OAuth 콜백(service_role)뿐이다.
-- ────────────────────────────────────────────────────────────────
revoke select, insert, update on public.meta_ad_accounts from anon, authenticated;
revoke delete on public.meta_ad_accounts from anon;

-- 읽기는 화면이 쓰는 컬럼 전부(팀원 읽기 정책은 0077 그대로 유지된다)
grant select (
  id, connection_id, user_id, ad_account_id, account_name, currency,
  timezone_name, account_status, is_default, created_at, updated_at,
  ad_page_id, ad_page_name, ad_ig_user_id, ad_ig_username,
  min_daily_budget_imp, min_daily_budget_high_freq, min_daily_budget_video_views,
  min_daily_budget_low_freq, min_budget_fetched_at
) on public.meta_ad_accounts to authenticated;

-- 쓰기는 «기본 계정»과 «게시 주체»만 (app/(finch)/(app)/ads/publisher-actions.ts 가 쓰는 컬럼)
grant update (
  is_default, updated_at, ad_page_id, ad_page_name, ad_ig_user_id, ad_ig_username
) on public.meta_ad_accounts to authenticated;

-- 연동 해제는 연결 행을 지우고 cascade 로 내려간다 — 계정 행 직접 삭제도 남겨 둔다
grant delete on public.meta_ad_accounts to authenticated;

comment on column public.meta_ad_accounts.ad_account_id is
  '광고 계정 id — act_ 접두를 빼고 **숫자만**(0077). 0088 이후 사용자 쓰기 불가·형식 check 적용. 이 값은 Graph URL 경로에 조립되므로 형식이 곧 보안 경계다(lib/meta/ad-account-id.ts).';

-- ────────────────────────────────────────────────────────────────
-- 적용 확인 — 셋 다 기대대로 나와야 한다
--   ① 0행 — 사용자에게 남은 쓰기 권한 중 소유·대상 컬럼
--   ② 형식·주인 위반 행 0건(위 0) 과 같은 쿼리)
--   ③ 위 ②가 0행이면 아래 validate 두 줄을 **따로** 실행해 기존 행까지 확정한다
-- ────────────────────────────────────────────────────────────────
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'meta_ad_accounts'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE')
  and column_name in ('user_id', 'connection_id', 'ad_account_id', 'account_name', 'currency');

select count(*) as "형식 위반(0 기대)" from public.meta_ad_accounts where ad_account_id !~ '^[0-9]{1,32}$';

-- ↓ 위 두 결과가 깨끗할 때만 실행 (기존 행까지 제약을 확정한다)
-- alter table public.meta_ad_accounts validate constraint meta_ad_accounts_id_shape;
-- alter table public.meta_ad_accounts validate constraint meta_ad_accounts_conn_owner_fkey;
