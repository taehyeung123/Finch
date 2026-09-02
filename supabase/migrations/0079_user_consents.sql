-- 0079_user_consents.sql — 회원가입 필수 동의 기록 (2026-09-02)
--
-- 지금까지 가입 화면에 «가입 시 이용약관과 개인정보처리방침에 동의하게 됩니다» 한 줄뿐이었다.
-- 그건 개인정보보호법상 유효한 동의가 아니다:
--   · §22 — 동의 항목을 **구분해서** 각각 받아야 한다 (묶음 문구 금지)
--   · §22의2 — 만 14세 미만은 법정대리인 동의가 필요하다 → 실무상 «만 14세 이상» 확인으로 차단
--   · 정보통신망법 §50 — 마케팅 수신 동의는 **선택**이고 따로 받아야 한다
-- 게다가 OAuth 는 가입=로그인이라, 가입 페이지에 체크박스를 놔도 /login 으로 우회된다.
-- → 첫 로그인 직후 동의 화면에서 받고 **여기에 기록**한다(누가·언제·어떤 버전에).
--
-- 버전 컬럼을 두는 이유: 약관·방침이 «중요 변경»되면 재동의를 받아야 한다.
-- 그때 이 컬럼과 현행 버전을 비교해 게이트를 다시 세울 수 있다(코드 lib/legal/consent.ts).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

create table if not exists public.user_consents (
  -- 사용자당 1행 — 동의는 최신 상태만 유지한다(과거 이력이 필요해지면 로그 표를 따로 판다)
  user_id            uuid primary key references auth.users(id) on delete cascade,
  -- 만 14세 이상 확인 시각 (개인정보보호법 §22의2)
  over14_at          timestamptz not null,
  -- 이용약관 동의 시각 + 동의한 문서의 시행일
  terms_at           timestamptz not null,
  terms_version      text not null,
  -- 개인정보 수집·이용 동의 시각 + 동의한 문서의 시행일
  privacy_at         timestamptz not null,
  privacy_version    text not null,
  -- 마케팅 정보 수신 동의(선택) — null 은 «미동의»다. 거부를 이유로 가입을 막지 않는다.
  marketing_email_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.user_consents enable row level security;

-- 본인 행만 읽고 쓴다 (0064 패턴 — (select auth.uid()) 는 initplan 최적화).
-- delete 정책은 일부러 없다 — 동의 기록은 사용자가 지우는 것이 아니라
-- 계정 삭제(cascade)로만 사라진다. 분쟁 시 «동의했다»의 증빙이 이 행이다.
drop policy if exists "consents read" on public.user_consents;
create policy "consents read" on public.user_consents for select to public
  using ((select auth.uid()) = user_id);
drop policy if exists "consents insert" on public.user_consents;
create policy "consents insert" on public.user_consents for insert to public
  with check ((select auth.uid()) = user_id);
drop policy if exists "consents update" on public.user_consents;
create policy "consents update" on public.user_consents for update to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists trg_user_consents_updated on public.user_consents;
create trigger trg_user_consents_updated before update on public.user_consents
  for each row execute function public.set_updated_at();

comment on table public.user_consents is
  '가입 필수 동의 기록(만14세·약관·개인정보) + 선택 마케팅 수신. 행이 없으면 동의 전 — 앱 레이아웃이 동의 화면으로 보낸다.';
