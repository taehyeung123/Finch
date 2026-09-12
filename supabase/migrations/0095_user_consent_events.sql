-- 0095_user_consent_events.sql — 동의·철회 이력(추가만 되는 표) + 삭제 요청의 회원 연결 (2026-09-12)
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
--   사용자가 이력을 쓸 수 있으면 증빙이 증빙이 아니다 — insert 정책을 두지 않는다.
-- 파기: 회원 탈퇴 시 cascade 로 함께 지운다(방침 제4조 «동의 기록 — 회원 탈퇴 시까지»).
--
-- 적용 순서: 코드보다 먼저든 뒤든 상관없다. 적용 전에는 코드가 이 표가 없다는 오류를 한 번 로그로 남기고 넘어간다
--   (동의 저장 자체는 user_consents 로 그대로 된다 — lib/legal/consent-events.ts).
--   ② 의 user_id 칸도 같다 — 없으면 삭제 기록에서 그 칸만 떼고 남긴다(lib/legal/deletion-log.ts).
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(if not exists · drop policy if exists).

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

comment on table public.user_consent_events is
  '동의·철회 이력(추가 전용). 가입 동의·약관 개정 재동의·광고성 정보 수신 동의 변경마다 한 줄. 쓰기는 서버만, 읽기는 본인만. 탈퇴 시 cascade.';

-- ────────────────────────────────────────────────────────────────
-- ② data_deletion_requests.user_id — 메타 삭제 요청 뒤 «남은 정보»를 10일 안에 지우기 위한 연결
-- ────────────────────────────────────────────────────────────────
-- 방침 정식본 제9조①4: 메타를 통해 삭제를 요청하면 연결·토큰은 바로 지우고, 그 채널과 관련해 남은 정보
-- (자동 DM 규칙·발송 기록, 광고 변경 기록, 발행 게시물 식별값, 알림, 프로필 링크 게시물 미리보기)도 10일 안에 지운다.
-- 콜백은 연결 행을 지우므로, 여기 핀치 회원 id 를 적어 두지 않으면 «누구의 남은 정보인지» 되찾을 길이 없다
-- (플랫폼 계정 id 는 해시로만 남긴다 — 0076). 후속 삭제를 마치면 이 칸을 비운다(docs/LEGAL_REVIEW_2026-09.md 의 SQL).
-- 회원이 탈퇴하면 set null — 탈퇴로 남은 정보가 이미 다 지워졌으니 연결도 필요 없다.
alter table public.data_deletion_requests
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists data_deletion_requests_user_idx on public.data_deletion_requests (user_id)
  where user_id is not null;

comment on column public.data_deletion_requests.user_id is
  '삭제 요청이 지운 연결의 핀치 회원(후속 삭제용). 남은 정보를 지운 뒤 null 로 비운다. 회원 탈퇴 시 set null.';

-- 적용 확인(선택):
--   select count(*) from public.user_consent_events;                         -- 0 이어도 정상(적용 직후)
--   select polname from pg_policy where polrelid = 'public.user_consent_events'::regclass;  -- consent events read own 하나
