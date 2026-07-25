-- ============================================================================
-- 0011_credits.sql — 관리자 지급용 크레딧 신설 (딥레드 HQ 연동)
-- ----------------------------------------------------------------------------
-- 뷰스코프의 credits/add_credits/deduct_credits/credit_transactions 패턴을
-- 그대로 이식한다 — 서버(service_role)만 지급/차감 가능, 클라이언트 직접 호출 금지.
--
-- 범위(2026-07-25 기준): 이번 마이그레이션은 "크레딧 잔액을 갖고, HQ에서 관리자가
-- 지급할 수 있다"까지만 만든다. 콘텐츠분석·AI 카드뉴스 생성이 실제로 크레딧을
-- 소비하도록 만드는 건 별도 작업(가격 책정·기존 무료 사용자 처리 등 제품 결정이
-- 먼저 필요) — 코드에 TODO로 남겨둔다.
--
-- 법적 판단 필요(뷰스코프 CLAUDE.md에도 동일 TODO 있음): 크레딧이 선불전자지급수단에
-- 해당하는지는 사람이 확인해야 할 영역 — 이 마이그레이션은 그 판단을 막지 않되
-- 진행한다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.
-- ============================================================================

alter table public.users_profile
  add column if not exists credits integer not null default 0;

alter table public.users_profile
  add constraint users_profile_credits_nonneg check (credits >= 0);

-- 크레딧 트랜잭션(감사 추적용, 삭제 금지 — 전자상거래법 5년 보관)
create table if not exists public.credit_transactions (
  id bigserial primary key,
  user_id uuid references public.users_profile(id) on delete cascade,
  amount int not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.credit_transactions enable row level security;
create policy "본인 내역만 조회" on public.credit_transactions for select using (auth.uid() = user_id);

-- 크레딧 충전(지급) — 양수만 허용
create or replace function public.add_credits(p_user_id uuid, p_amount int, p_reason text)
returns void as $$
begin
  if p_amount <= 0 then
    raise exception 'add_credits: 양수만 허용';
  end if;
  update public.users_profile set credits = credits + p_amount where id = p_user_id;
  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, p_amount, p_reason);
end;
$$ language plpgsql security definer set search_path = public;

-- 크레딧 차감 — 잔액 부족 시 false 반환(원자적 처리)
create or replace function public.deduct_credits(p_user_id uuid, p_amount int, p_reason text)
returns boolean as $$
declare
  current_balance int;
begin
  select credits into current_balance from public.users_profile where id = p_user_id for update;
  if current_balance is null or current_balance < p_amount then
    return false;
  end if;
  update public.users_profile set credits = credits - p_amount where id = p_user_id;
  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, -p_amount, p_reason);
  return true;
end;
$$ language plpgsql security definer set search_path = public;

-- 클라이언트(anon/authenticated)에서 임의 호출 금지 — service_role만 호출
revoke execute on function public.add_credits(uuid, int, text) from public, anon, authenticated;
revoke execute on function public.deduct_credits(uuid, int, text) from public, anon, authenticated;

-- 본인 크레딧만 차감할 수 있는 인증 사용자용 래퍼(추후 콘텐츠분석/AI 카드뉴스에서 사용 예정)
create or replace function public.deduct_my_credits(p_amount int, p_reason text)
returns boolean as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return public.deduct_credits(auth.uid(), p_amount, p_reason);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.deduct_my_credits(int, text) from public, anon;
grant execute on function public.deduct_my_credits(int, text) to authenticated;
