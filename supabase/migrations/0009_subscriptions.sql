-- 핀치(Finch) 정기결제(빌링) 구독 — Toss 빌링키 기반 자동갱신
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
-- billingKey는 발급 후 재조회 불가 → 앱단 AES-256-GCM 암호화 저장 (lib/crypto/tokens).
-- 쓰기는 전부 서버(service_role) 전용 — 클라이언트는 본인 행 조회만.

create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  plan                text not null check (plan in ('creator','pro','agency','enterprise')),
  toss_customer_key   text not null unique,      -- 추측 불가 랜덤 UUID (이메일/순번 금지)
  billing_key_cipher  text,                       -- 암호화된 빌링키 (평문 금지)
  card_summary        text,                       -- 표시용: 카드사 + 마스킹 번호
  status              text not null default 'pending'
                        check (status in ('pending','active','past_due','canceled','expired')),
  billing_retry_count integer not null default 0, -- 결제 실패 재시도 횟수 (3회 초과 시 해지)
  next_billing_at     timestamptz,
  canceled_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
-- 본인 조회만 — insert/update 정책 없음(서버 service_role 전용 쓰기)
create policy "own subscriptions select" on public.subscriptions
  for select using (auth.uid() = user_id);
create index if not exists subscriptions_due_idx on public.subscriptions (status, next_billing_at);
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- 알림 유형에 billing 추가 (정기결제 실패·갱신 안내)
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('competitor_ad','trend','account_spike','account_drop','token_expiry','budget','billing'));
