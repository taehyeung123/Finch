-- 핀치(Finch) 코어 스키마 — 인증 프로필 · 연동 계정 · 사용량 · 알림 · 리포트
-- 적용: Supabase 대시보드 SQL 편집기에 붙여넣거나, CLI로 `supabase db push`.
-- 규칙: 모든 사용자 소유 테이블에 RLS를 켜고 auth.uid() = user_id 만 접근. 시크릿(토큰)은 암호화 저장.

create extension if not exists pgcrypto;

-- ── 공통 트리거: updated_at 자동 갱신 ─────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users_profile ── auth.users 1:1 확장 프로필 ───────────────────
create table public.users_profile (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  plan         text not null default 'free' check (plan in ('free','creator','pro','agency')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.users_profile enable row level security;
create policy "own profile" on public.users_profile
  for all using (auth.uid() = id) with check (auth.uid() = id);
create trigger trg_users_profile_updated before update on public.users_profile
  for each row execute function public.set_updated_at();

-- 회원가입 시 프로필 자동 생성 (Google/Kakao/매직링크 공통)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users_profile (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email,''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── connected_accounts ── 채널 OAuth 연동 (ChannelAccount 대응) ────
-- 토큰은 반드시 암호화해서 저장한다(앱단 암호화 또는 Supabase Vault). RLS만으로는 저장 시 평문이 되지 않도록.
-- 확정(2026-07-17): 앱단 AES-256-GCM (lib/crypto/tokens.ts, TOKEN_ENCRYPTION_KEY).
create table public.connected_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  channel               text not null check (channel in ('instagram','tiktok','threads')),
  handle                text not null,
  display_name          text,
  bio                   text,
  connected             boolean not null default true,
  followers             integer not null default 0,
  followers_delta_7d    integer not null default 0,
  posts                 integer not null default 0,
  avg_engagement_rate   numeric(6,2) not null default 0,
  access_token_cipher   text,   -- 암호화된 액세스 토큰 (평문 금지)
  refresh_token_cipher  text,   -- 암호화된 리프레시/장기 토큰
  token_expires_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, channel, handle)
);
alter table public.connected_accounts enable row level security;
create policy "own accounts" on public.connected_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_connected_accounts_updated before update on public.connected_accounts
  for each row execute function public.set_updated_at();

-- ── usage_counters ── 월별 사용량 (UsageStat 대응, use_quota 함수로만 차감) ──
create table public.usage_counters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  metric       text not null,          -- 예: 'content_analysis','ai_cardnews','auto_dm_send'
  period_month date not null,          -- date_trunc('month')
  used         integer not null default 0,
  limit_value  integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique (user_id, metric, period_month)
);
alter table public.usage_counters enable row level security;
-- 조회는 본인만. 증가는 use_quota(SECURITY DEFINER)로만 — 클라이언트 직접 UPDATE 금지.
create policy "read own usage" on public.usage_counters
  for select using (auth.uid() = user_id);
create trigger trg_usage_counters_updated before update on public.usage_counters
  for each row execute function public.set_updated_at();

-- ── notifications ── 알림함 (AppNotification 대응) ────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('competitor_ad','trend','account_spike','account_drop','token_expiry','budget')),
  title       text not null,
  body        text not null default '',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ── reports ── 리포트 (ReportItem 대응) ──────────────────────────
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  period      text not null,
  channels    text[] not null default '{}',
  format      text not null check (format in ('pdf','excel')),
  scheduled   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "own reports" on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
