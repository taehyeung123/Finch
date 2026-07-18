-- 핀치(Finch) 요금제 개편 — 유료 4단계 (Enterprise 최상위 티어 추가)
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
-- plan check 제약에 'enterprise'를 추가한다 (users_profile / payment_orders).

alter table public.users_profile drop constraint if exists users_profile_plan_check;
alter table public.users_profile add constraint users_profile_plan_check
  check (plan in ('free','creator','pro','agency','enterprise'));

alter table public.payment_orders drop constraint if exists payment_orders_plan_check;
alter table public.payment_orders add constraint payment_orders_plan_check
  check (plan in ('creator','pro','agency','enterprise'));
