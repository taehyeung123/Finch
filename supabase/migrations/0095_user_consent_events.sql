-- 0095_user_consent_events.sql — 동의·철회 이력(추가만 되는 표) + 메타 삭제 요청의 «남은 정보» 후속 삭제 대상 + 보존 파기용 인덱스 (2026-09-12)
--
-- 왜(2026-09 약관·방침 정식본, docs/LEGAL_REVIEW_2026-09.md):
--   0079 user_consents 는 «사용자당 1행, 최신 상태만» 이다. 약관이 개정돼 재동의를 받으면 terms_at·terms_version 을
--   덮어써서 «이 회원이 언제 옛 약관에 동의했었나»가 사라지고, 광고성 정보 수신 동의를 켰다 껐다 하면 마지막 값만 남는다.
--   · 약관 개정 후 분쟁에서 «어느 문서에, 언제 동의했나»의 증빙이 필요하다(약관규제법 §3·§12).
--   · 광고성 정보 수신 동의·철회는 처리 결과를 14일 안에 알려야 하고(정보통신망법 §50⑦), 2년마다 재확인해야 한다(시행령 §62의3) —
--     «언제 동의했나»의 이력이 있어야 둘 다 할 수 있다.
--   그래서 동의 화면·알림 설정이 저장할 때마다 여기에 한 줄씩 **추가**한다. 고치거나 지우는 경로는 없다.
--
-- 권한: 쓰기는 서버(service_role)만. 로그인 사용자는 **자기 행 읽기만** 된다(설정 > 사업자 정보 > 내 동의 기록).
--   사용자가 이력을 쓸 수 있으면 증빙이 증빙이 아니다 — insert 정책을 두지 않고, 표 권한도 명시적으로 회수한다(아래).
-- 파기: 회원 탈퇴 시 cascade 로 함께 지운다(방침 제4조 «동의 기록 — 회원 탈퇴 시까지»).
--
-- ⚠️ 적용 순서: **배포 전에 적용하기를 권한다** — 이 파일은 표·인덱스를 **더하기만** 해서, 지금 돌고 있는 옛 코드는 영향이 없다
--   (옛 코드는 이 표들을 모른다. user_consents 의 정책·칸은 건드리지 않는다). 그래서 먼저 넣어 두는 것이 가장 안전하다.
--   깜빡하고 코드가 먼저 나가도 **아무도 갇히지 않는다** — 코드는 표가 없다는 오류를 로그로 남기고 넘어간다:
--     · 동의 저장은 user_consents 로 그대로 되고 이력만 빠진다(lib/legal/consent-events.ts — 이 함수들은 던지지 않는다).
--     · 광고성 정보 동의의 하루 상한이 꺼진다(셀 표가 없다 — 켜고 끄는 것 자체는 된다).
--     · 메타 삭제 요청의 후속 삭제 대상이 표 대신 로그에만 남는다(lib/legal/deletion-log.ts — «0095 적용 필요» 로그에 회원 id 가 있다).
--   즉 적용 전 배포의 손실은 «증빙·알림»이지 «이용»이 아니다. 늦게 넣은 동안의 로그는 13절 SQL 로 옮겨 적는다.
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(if not exists · drop policy if exists · revoke 는 여러 번 해도 같다).
-- 참고: 이 파일의 첫 초안(배포된 적 없음)은 data_deletion_requests.user_id 칸을 더했다. 여러 회원·이미 해제된 계정을 담지 못해
--   ② 의 표로 바꿨다. 초안을 이미 넣은 DB 에 그 칸이 있으면 비어 있다(쓰는 코드가 나간 적이 없다) — 그대로 둬도 된다.

-- ────────────────────────────────────────────────────────────────
-- ① user_consent_events — 동의·철회 이력
-- ────────────────────────────────────────────────────────────────
create table if not exists public.user_consent_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- 무엇에 대한 기록인가: 만 14세 확인 · 이용약관(운영정책 포함) · 개인정보처리방침 확인 · 광고성 정보(이메일) 수신
  doc         text not null check (doc in ('over14', 'terms', 'privacy', 'marketing_email')),
  -- 동의한 문서의 버전(시행일, ISO). 만 14세·광고성 정보는 null
  version     text check (version is null or char_length(version) <= 20),
  -- agree = 동의, acknowledge = 확인(방침 안내 확인), withdraw = 철회
  action      text not null check (action in ('agree', 'acknowledge', 'withdraw')),
  -- 어느 화면에서: 첫 가입 · 약관 개정 재동의 · 알림 설정
  source      text not null check (source in ('signup', 'reconsent', 'settings')),
  created_at  timestamptz not null default now()
);

create index if not exists user_consent_events_user_idx on public.user_consent_events (user_id, created_at desc);

alter table public.user_consent_events enable row level security;

drop policy if exists "consent events read own" on public.user_consent_events;
create policy "consent events read own" on public.user_consent_events for select to authenticated
  using ((select auth.uid()) = user_id);

-- insert/update/delete 정책은 일부러 없다 — RLS 가 켜져 있으니 로그인 사용자는 쓸 수 없고, service_role 만 쓴다.
-- 한 겹 더: Supabase 는 새 표에 anon·authenticated 전체 권한을 기본으로 준다. 정책이 실수로 생겨도 쓰지 못하게 표 권한부터 뺀다(0092 와 같은 방식).
revoke insert, update, delete, truncate, references, trigger on public.user_consent_events from anon, authenticated;
revoke select on public.user_consent_events from anon;

comment on table public.user_consent_events is
  '동의·철회 이력(추가 전용). 가입 동의·약관 개정 재동의·광고성 정보 수신 동의 변경마다 한 줄. 쓰기는 서버만, 읽기는 본인만. 탈퇴 시 cascade.';

-- ────────────────────────────────────────────────────────────────
-- ② data_deletion_followups — 메타 삭제 요청 뒤 «남은 정보»를 10일 안에 지우기 위한 대기 목록
-- ────────────────────────────────────────────────────────────────
-- 방침 정식본 제9조①4: 메타를 통해 삭제를 요청하면 연결·토큰은 바로 지우고, 그 채널과 관련해 남은 정보
-- (자동 DM 규칙·발송 기록, 광고 변경 기록, 발행 게시물 식별값, 알림, 프로필 링크 게시물 미리보기)도 10일 안에 지운다.
-- 콜백은 연결 행을 지우므로, 여기 핀치 회원을 적어 두지 않으면 «누구의 남은 정보인지» 되찾을 길이 없다
-- (플랫폼 계정 id 는 해시로만 남긴다 — 0076).
--   · 요청 한 건에 회원이 **여럿**일 수 있다 — 같은 페이스북 계정을 여러 핀치 계정이 광고에 연결할 수 있다(0077: fb_user_id 는 전역 유일이 아니다).
--   · 연결이 이미 없던 요청(핀치 설정에서 먼저 해제)도 발행 기록(scheduled_posts.account_platform_id, 0094)으로 주인을 찾으면 적는다(found_by).
--   · **행이 있다 = 아직 안 지웠다.** 후속 삭제를 마치면 그 행을 지운다(docs/LEGAL_REVIEW_2026-09.md 13절 4번).
--     retention 크론이 행이 남아 있는 동안 매일 알린다. 상태 확인 페이지는 행이 있으면 «남은 정보는 요청일+10일까지 삭제»라고 말한다.
--   · 요청 기록이 1년 뒤 파기되면(retention) 함께 사라진다. 회원이 탈퇴하면 탈퇴가 이미 다 지웠으니 함께 사라진다.
-- RLS: 정책 없음 = service_role 전용(0076 과 같은 «정책 없는 표»). 표 권한도 회수한다.
create table if not exists public.data_deletion_followups (
  id                bigint generated always as identity primary key,
  confirmation_code text not null references public.data_deletion_requests(confirmation_code) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  channel           text not null check (channel in ('instagram', 'threads', 'tiktok', 'meta_ads')),
  -- 연결 행에서 찾았나(connection) · 연결이 이미 없어 발행 기록에서 찾았나(publish_history)
  found_by          text not null default 'connection' check (found_by in ('connection', 'publish_history')),
  -- 요청 시각 — 후속 삭제는 이 시각 **이전** 행만 지운다(그 뒤 다시 연결해 쌓인 새 정보는 지우지 않는다). 기한 = 이 시각 + 10일
  requested_at      timestamptz not null default now(),
  unique (confirmation_code, user_id)
);

create index if not exists data_deletion_followups_requested_idx on public.data_deletion_followups (requested_at);

alter table public.data_deletion_followups enable row level security;
revoke all on public.data_deletion_followups from anon, authenticated;

comment on table public.data_deletion_followups is
  '메타 데이터 삭제 요청의 남은 정보 후속 삭제 대기 목록(방침 제9조①4, 10일). 행이 있으면 아직 안 지운 것 — 지운 뒤 행을 삭제한다. service_role 전용.';

-- ────────────────────────────────────────────────────────────────
-- ③ 보존 파기(app/api/cron/retention)용 시간 인덱스 — 큰 표 셋
-- ────────────────────────────────────────────────────────────────
-- retention 크론이 매일 `delete … where created_at < now() - 365일` 을 돈다. 세 표 모두 created_at 을 앞에 둔 인덱스가 없어
-- (link_views·link_clicks 는 (page_id, created_at), dm_sends 는 (rule_id…)·(user_id…) 뿐) 매일 전체를 순차로 훑는다 —
-- 비용은 가장 큰 표(방문 1회 = 1행)를 따라 커지고, statement_timeout 에 걸리면 매일 실패하고 아무것도 파기되지 않는다.
-- 추가만 되는 표라 시간 순서와 저장 순서가 거의 같다 → BRIN 이 작고 싸다(B-tree 의 수백분의 1 크기).
create index if not exists link_views_created_brin  on public.link_views  using brin (created_at);
create index if not exists link_clicks_created_brin on public.link_clicks using brin (created_at);
create index if not exists dm_sends_created_brin    on public.dm_sends    using brin (created_at);

-- 적용 확인(선택):
--   select count(*) from public.user_consent_events;                         -- 0 이어도 정상(적용 직후)
--   select polname from pg_policy where polrelid = 'public.user_consent_events'::regclass;  -- consent events read own 하나
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name in ('user_consent_events', 'data_deletion_followups')
--      and grantee in ('anon', 'authenticated');                             -- authenticated · SELECT · user_consent_events 한 줄만
--   select indexname from pg_indexes where indexname like '%_created_brin';   -- 셋
