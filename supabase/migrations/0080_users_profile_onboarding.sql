-- 0080_users_profile_onboarding.sql — 온보딩 완료 기록 + 사용 목적 저장 (2026-09-02)
--
-- 문제: 온보딩 마법사(크리에이터/광고주/대행사 선택)가 «완료했는지»를 아무 데도 안 적어서
--   · 회원가입 버튼으로 로그인한 기존 회원에게도 매번 떴다
--   · 동의 화면(0079)을 거친 기존 회원이 마법사로 떨어졌다 (2026-09-02 사장님 실경험)
--   · 고른 목적(purpose)은 로컬 상태로만 있다가 **그냥 버려졌다** — 저장 코드가 0줄
--
-- 해결: users_profile 에 두 컬럼을 더한다.
--   onboarded_at — 마법사를 마친(또는 건너뛴) 시각. 있으면 온보딩 페이지가 대시보드로 보낸다.
--   purpose     — 가입 목적. 화면 개인화에 쓸 원료(지금은 기록만).
--
-- 채널 연동 단계는 마법사에서 빠진다 — 로그인 뒤 대시보드의 연동 가이드 모달이 맡는다(같은 커밋).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

alter table public.users_profile
  add column if not exists purpose text
    check (purpose in ('creator', 'advertiser', 'agency'));

alter table public.users_profile
  add column if not exists onboarded_at timestamptz;

-- 기존 회원 백필 — 이미 쓰고 있는 사람에게 «처음 오셨나요?» 마법사를 들이밀지 않는다.
-- purpose 는 안 물어봤으니 null 그대로 둔다(모르는 것을 지어내지 않는다).
update public.users_profile
set onboarded_at = coalesce(onboarded_at, created_at);

comment on column public.users_profile.onboarded_at is
  '온보딩 마법사 완료(또는 건너뛰기) 시각. null 이면 신규 — 온보딩 페이지가 마법사를 보여준다.';
comment on column public.users_profile.purpose is
  '가입 목적(creator/advertiser/agency). null = 건너뛰었거나 0080 이전 가입.';
