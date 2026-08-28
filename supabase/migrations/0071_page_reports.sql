-- 0071_page_reports.sql — 공개 페이지 신고함 (2026-08-28 사장님 지시 «리틀리 하단 Report»)
--
-- 방문자는 로그인 없이 신고한다 — inquiries(0017, 본인 세션 필수)와 분리한 **무기명 드롭박스**.
-- 쓰기만 열고 읽기는 안 연다(anon/authenticated SELECT 정책·grant 없음) — 접수함은
-- Supabase 대시보드(service role)에서만 보고, 처리 상태(status)도 거기서 바꾼다.
-- 신고가 신고 대상 페이지 주인에게 보이면 안 된다(보복 위험) — 읽기 무정책이 그 방어다.

create table if not exists public.page_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- 신고 대상 — slug 하나면 페이지를 특정한다(서브 페이지는 '부모/서브' 그대로)
  slug text not null check (char_length(slug) between 1 and 120),
  reason text not null check (reason in ('사칭', '사기·피싱', '불법·유해', '저작권 침해', '스팸', '기타')),
  detail text check (detail is null or char_length(detail) <= 2000),
  -- 회신용 연락처(선택) — 이메일·전화 자유 형식
  contact text check (contact is null or char_length(contact) <= 160),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed'))
);

alter table public.page_reports enable row level security;

-- 기본 grant 를 걷어내고 insert 만 되돌려준다 — 무기명 «넣기만 되는» 함
revoke all on table public.page_reports from anon, authenticated;
grant insert on table public.page_reports to anon, authenticated;

create policy page_reports_insert on public.page_reports
  for insert to anon, authenticated
  with check (status = 'pending');
