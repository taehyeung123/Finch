-- ============================================================================
-- 0017_inquiries.sql — 문의(CS) 테이블 신설 (딥레드 HQ 고객센터 연동)
-- ----------------------------------------------------------------------------
-- 지금까지 핀치에는 문의 접수 창구 자체가 없었다(스키마 정독으로 확인된 사실).
-- 뷰스코프 0040_inquiries.sql과 동일 패턴 — 로그인 사용자 전용 접수 + 본인
-- 문의/답변 열람, 답변 작성은 HQ(service role)에서만.
--
-- 참고: 이 마이그레이션은 테이블만 만든다. 핀치 앱 안의 "문의하기" 화면은
-- 별도 작업(현재 앱 UI는 다른 세션에서 병렬 작업 중이라 충돌 방지 차원에서
-- 분리) — 테이블이 먼저 있어야 화면을 붙일 수 있다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

create table if not exists public.inquiries (
  id bigserial primary key,
  user_id uuid not null references public.users_profile (id) on delete cascade,
  type text not null default '기타' check (type in ('결제', '계정', '기능', '기타')),
  subject text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'replied', 'closed')),
  reply_body text,
  created_at timestamptz not null default now(),
  replied_at timestamptz
);

alter table public.inquiries enable row level security;

drop policy if exists "본인 문의 조회" on public.inquiries;
create policy "본인 문의 조회" on public.inquiries
  for select using (auth.uid() = user_id);

drop policy if exists "본인 문의 접수" on public.inquiries;
create policy "본인 문의 접수" on public.inquiries
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and reply_body is null
    and replied_at is null
  );

-- update/delete 정책 없음 = 클라이언트 수정·삭제 불가(HQ service role만)

create index if not exists inquiries_user_idx on public.inquiries (user_id, created_at desc);
create index if not exists inquiries_status_idx on public.inquiries (status, created_at);
