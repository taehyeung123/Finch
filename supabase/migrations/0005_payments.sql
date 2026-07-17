-- 핀치(Finch) 결제 주문 — Toss Payments 단건 결제 (테스트 모드)
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
-- 규칙: RLS on, auth.uid() = user_id. 금액은 서버가 이 테이블에서 조회해 검증한다(리다이렉트/웹훅 신뢰 금지).

-- ── payment_orders ── 결제 주문/상태 (docs/REAL_API_SPEC.md 4절) ──
create table if not exists public.payment_orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  order_id      text not null unique,                 -- Toss orderId (영숫자-_ 6~64)
  plan          text not null check (plan in ('creator','pro','agency')),
  amount        integer not null check (amount > 0),  -- 결제 예정 금액(KRW). 서버 검증 기준값
  order_name    text not null,
  status        text not null default 'ready'
                  check (status in ('ready','paid','failed','canceled')),
  payment_key   text,                                 -- 승인 후 Toss paymentKey
  method        text,                                 -- 카드/간편결제 등
  approved_at   timestamptz,
  raw           jsonb,                                -- 승인/웹훅 원본(감사용)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.payment_orders enable row level security;

-- 본인 주문만 조회/생성. 상태 갱신(승인)은 서버(service_role)만 하므로 update 정책은 두지 않는다.
create policy "own orders select" on public.payment_orders
  for select using (auth.uid() = user_id);
create policy "own orders insert" on public.payment_orders
  for insert with check (auth.uid() = user_id);

create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);

create trigger trg_payment_orders_updated before update on public.payment_orders
  for each row execute function public.set_updated_at();
