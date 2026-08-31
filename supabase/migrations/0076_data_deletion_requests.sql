-- 0076_data_deletion_requests.sql — 데이터 삭제 요청 기록
--
-- 왜: Meta 는 데이터 삭제 콜백에 `{ url, confirmation_code }` 응답을 요구하고,
--     그 url 은 «사용자가 삭제 상태를 확인할 수 있는 공개 페이지» 여야 한다.
--
--     그런데 지금 코드는 확인 코드를 즉석에서 만들어 돌려줄 뿐 **어디에도 기록하지 않는다.**
--     그래서 상태 페이지가 조회 없이 «데이터 삭제가 완료되었어요» 를 무조건 띄운다 —
--     아무 문자열이나 넣어도, 아예 코드가 없어도 완료 화면이 나온다(2026-08-31 적발).
--     사실이 아닌 것을 확언하는 화면이고, 심사관이 실제로 열어 보는 URL 이다.
--
-- 개인정보 최소화: 플랫폼 사용자 id 를 원문으로 두지 않고 해시로 남긴다.
--   삭제 요청 이력에 식별자를 그대로 보관하면 «지웠다면서 남겨 뒀다» 가 된다.
--   조회 키는 confirmation_code 하나이고, 그건 무작위 16자다.
--
-- RLS: **정책을 만들지 않는다.** 상태 페이지는 서버에서 service_role 로 조회한다
--   (익명 SELECT 를 열면 코드를 무차별 대입해 남의 요청을 확인할 수 있다).
--   page_reports(0071) 와 같은 «정책 없는 표» 패턴이다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

create table if not exists public.data_deletion_requests (
  id                bigserial primary key,
  -- 조회 키. 콜백이 만들어 Meta 에 돌려주는 값과 같다.
  confirmation_code text not null unique check (char_length(confirmation_code) between 8 and 64),
  channel           text not null check (channel in ('instagram', 'threads', 'tiktok')),
  -- 원문 대신 해시 — 어느 요청인지 대조는 되지만 식별자를 복원할 수는 없다
  platform_user_hash text,
  -- 실제로 지운 행 수. 0 이면 «지울 것이 없었다»(이미 해제했거나 연동한 적 없음)
  deleted_rows      integer not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists data_deletion_requests_code_idx
  on public.data_deletion_requests (confirmation_code);

alter table public.data_deletion_requests enable row level security;
-- 정책 없음(위 주석) — service_role 만 읽고 쓴다.

comment on table public.data_deletion_requests is
  '플랫폼 데이터 삭제 콜백 요청 이력. 상태 확인 페이지가 confirmation_code 로 조회한다. RLS 정책 없음 = service_role 전용.';
