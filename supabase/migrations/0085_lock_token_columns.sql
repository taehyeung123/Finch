-- 0085_lock_token_columns.sql — 채널·광고 토큰 암호문을 로그인 사용자에게서 회수한다 (Critical)
--
-- 무엇이 문제였나 (2026-09-07 보안 감사, Critical)
-- ------------------------------------------------------------------
-- 0064 의 "accounts read" 와 0077 의 "ad connections read" 는 **활성 팀원에게 소유자 행의 SELECT** 를
-- 열어 준다. 의도는 «팀원도 대시보드에서 소유자 계정 지표를 본다» 였는데, 정책은 행 단위라
-- 그 행의 **모든 컬럼**이 함께 열렸다 — access_token_cipher·refresh_token_cipher 를 포함해서.
--
-- 그리고 이 두 표에는 마이그레이션 전체에서 열 단위 GRANT 가 한 번도 걸린 적이 없다.
-- 즉 팀원(viewer 포함)은 앱 화면을 거치지 않고 PostgREST 로 이렇게 부를 수 있었다:
--
--   GET /rest/v1/connected_accounts?select=access_token_cipher,refresh_token_cipher
--
-- 실제 피해는 «암호문을 봤다» 로 끝나지 않는다. 우리 복호화(lib/crypto/tokens.ts)는 AES-256-GCM 인데
-- **AAD 가 없어** 암호문이 «누구의 것인지» 를 담고 있지 않다. 그래서 복사해 둔 암호문을 자기 연동 행에
-- 붙여 넣으면 서버가 그것을 자기 토큰으로 알고 그대로 써 준다:
--
--   ① 팀에서 빠진 뒤에도 소유자의 광고 계정에 캠페인을 만들고 켤 수 있다 — **소유자 카드로 실제 돈이 나간다.**
--   ② lib/team.ts 의 «viewer 는 광고 쓰기 금지(role_denied)» 관문이 통째로 우회된다.
--   ③ 감사 로그(meta_ad_write_log)에는 공격자 워크스페이스의 정상 쓰기로 남아 소유자 화면엔 보이지도 않는다.
--   ④ 팀원 제거가 접근 차단이 되지 못한다. 메타 장기 토큰은 자동 갱신이 없어 60일 뒤 만료되지만,
--      그때까지 우리 쪽에서 무효화할 방법이 없다(소유자가 메타에서 직접 앱 권한을 끊어야만 멎는다).
--
-- 고치는 방법
-- ------------------------------------------------------------------
-- **열 단위 GRANT** 로 암호문을 authenticated 의 SELECT/INSERT/UPDATE 대상에서 통째로 뺀다.
-- 0046 이 users_profile 의 결제 컬럼에 쓴 것과 같은 수법이다. RLS 정책은 손대지 않는다 —
-- 팀원은 지금처럼 소유자 행을 읽되, 그 행에서 토큰 컬럼만 사라진다.
-- service_role 은 이 revoke 의 대상이 아니므로 서버 코드(크론·웹훅·콜백)는 그대로 동작한다.
--
-- ⚠️ 적용 순서: **코드를 먼저 배포하고 이 마이그레이션을 나중에 적용한다.**
--   토큰 암호문을 세션 클라이언트로 읽던 곳(lib/data/live.ts·lib/data/ads.ts·OAuth 콜백 4개)을
--   같은 커밋에서 service_role 로 옮겼고, settings/channels 의 select("*") 도 컬럼 목록으로 바꿨다.
--   옛 코드에 이 마이그레이션만 먼저 들어가면 연동 저장과 채널 화면이 권한 오류로 떨어진다.
--
-- 남은 과제(별도): 암호문에 AAD(소유자·컬럼 결속)를 넣어 «남의 암호문 붙여넣기» 자체를 무효화한다.
--   이 마이그레이션은 «암호문을 손에 넣는 경로» 를 닫고, AAD 는 «손에 넣어도 못 쓰게» 만든다 — 둘 다 필요하다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- ── connected_accounts (인스타·스레드·틱톡) ────────────────────────────
-- 비밀 컬럼: access_token_cipher, refresh_token_cipher
revoke select, insert, update on public.connected_accounts from anon, authenticated;
revoke delete on public.connected_accounts from anon;

grant select (
  id, user_id, channel, handle, display_name, bio, connected,
  followers, followers_delta_7d, posts, avg_engagement_rate,
  token_expires_at, created_at, updated_at, platform_user_id, avatar_url, granted_scopes
) on public.connected_accounts to authenticated;

-- INSERT 는 **아예 주지 않는다.** 연동 행을 만드는 것은 OAuth 콜백 4개뿐이고 그것들은 이제
-- service_role 로 쓴다. 덤으로 옛 구멍 하나가 함께 닫힌다 — 0004 의 (channel, platform_user_id)
-- 유니크는 **사용자를 넘는 전역 유니크**라, 남의 인스타 계정 id 로 빈 행을 먼저 심어 두면
-- 그 사람이 영영 연동을 못 하게 만들 수 있었다(선점 DoS).
--
-- UPDATE 는 화면이 실제로 갱신하는 프로필 스냅샷 컬럼만 남긴다. 암호문 «쓰기» 가 열려 있으면
-- 남의 암호문을 자기 행에 심을 수 있어서(위 ①), 읽기만 막는 것으로는 절반짜리 수리가 된다.
-- user_id·channel·platform_user_id 를 뺀 것도 같은 이유다 — 행을 남에게 옮기지 못하게 한다.
grant update (
  handle, display_name, bio, connected,
  followers, followers_delta_7d, posts, avg_engagement_rate,
  updated_at, avatar_url
) on public.connected_accounts to authenticated;

-- 연동 해제(settings/channels/actions.ts)는 행을 지운다 — DELETE 는 표 단위로 그대로 둔다.
grant delete on public.connected_accounts to authenticated;

-- ── meta_ad_connections (메타 광고) ────────────────────────────────────
-- 비밀 컬럼: access_token_cipher
revoke select, insert, update on public.meta_ad_connections from anon, authenticated;
revoke delete on public.meta_ad_connections from anon;

grant select (
  id, user_id, fb_user_id, fb_name, token_expires_at,
  granted_scopes, connected, created_at, updated_at
) on public.meta_ad_connections to authenticated;

-- INSERT 없음 — 광고 연동 행은 OAuth 콜백(service_role)만 만든다.
grant update (fb_name, connected, updated_at) on public.meta_ad_connections to authenticated;

grant delete on public.meta_ad_connections to authenticated;

comment on column public.connected_accounts.access_token_cipher is
  '암호화된 액세스 토큰. 0085 이후 authenticated 에게 select/insert/update 권한이 없다 — 서버(service_role) 코드만 읽고 쓴다.';
comment on column public.connected_accounts.refresh_token_cipher is
  '암호화된 리프레시 토큰. 0085 이후 authenticated 권한 없음(access_token_cipher 와 동일).';
comment on column public.meta_ad_connections.access_token_cipher is
  '암호화된 페이스북 사용자 토큰. 0085 이후 authenticated 권한 없음 — 서버(service_role) 코드만 읽고 쓴다.';

-- ────────────────────────────────────────────────────────────────
-- 적용 확인 — 아래 두 그리드가 기대대로 나와야 한다
--   ① 0행이어야 한다(암호문에 로그인 사용자 권한이 남아 있으면 여기 뜬다)
--   ② 두 표의 남은 권한 목록 — 토큰 컬럼이 하나도 없어야 한다
-- ────────────────────────────────────────────────────────────────
select
  table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and column_name in ('access_token_cipher', 'refresh_token_cipher')
order by table_name, column_name, grantee;

select
  table_name,
  grantee,
  privilege_type,
  string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('connected_accounts', 'meta_ad_connections')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee, privilege_type
order by table_name, grantee, privilege_type;
