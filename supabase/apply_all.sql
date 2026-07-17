-- 핀치(Finch) 전체 스키마 통합 적용본 — 0001~0004를 순서대로 이어붙인 파일.
-- 새 프로젝트에 한 번에 붙여넣고 실행한다. (개별 파일: migrations/ 폴더)


-- ============================================================
-- 0001_core.sql
-- ============================================================
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
-- TODO: 암호화 방식 확정(pgsodium/Vault vs 앱단 AES) — CLAUDE.md 인증/보안 규칙.
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

-- ============================================================
-- 0002_auto_dm.sql
-- ============================================================
-- 인스타 댓글 자동 DM 스키마 (Instagram 전용)
-- 근거: PRD 4.14 + docs/AUTO_DM_COST_RISK.md. 실제 발송 연동은 API-last.
-- 핵심 안전장치: 댓글당 Private Reply 1회를 (rule_id, ig_comment_id) 유니크 제약으로 강제.

-- ── auto_dm_rules ── 게시물별 규칙 (AutoDmRule 대응) ──────────────
create table public.auto_dm_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  post_id        text not null,          -- 인스타그램 미디어 id
  post_caption   text not null default '',
  post_type      text not null check (post_type in ('reels','feed','story','video','carousel','text')),
  post_views     integer not null default 0,
  trigger        text not null check (trigger in ('all','keyword')),
  keywords       text[] not null default '{}',
  public_reply   text,
  dm_message     text not null,
  button_label   text,
  button_url     text,
  status         text not null default 'active' check (status in ('active','paused','review')),
  is_advertising boolean not null default false,
  daily_cap      integer not null default 300 check (daily_cap >= 1),
  sent_total     integer not null default 0,
  sent_today     integer not null default 0,
  failed_total   integer not null default 0,
  last_sent_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.auto_dm_rules enable row level security;
create policy "own rules" on public.auto_dm_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_auto_dm_rules_updated before update on public.auto_dm_rules
  for each row execute function public.set_updated_at();
create index auto_dm_rules_user_post_idx on public.auto_dm_rules (user_id, post_id);

-- ── dm_sends ── 발송 멱등 원장 + 결과 (중복 발송·1회 초과 차단) ──────
-- (rule_id, ig_comment_id) 유니크가 "댓글당 1회" + "웹훅 재전송 중복" 을 동시에 막는다.
-- INSERT ... ON CONFLICT DO NOTHING 이 성공한 행에 대해서만 실제 발송을 큐잉한다.
create table public.dm_sends (
  id             uuid primary key default gen_random_uuid(),
  rule_id        uuid not null references public.auto_dm_rules(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  ig_comment_id  text not null,
  status         text not null default 'pending'
                   check (status in ('pending','sent','delivered','failed_unavailable','failed_permission','failed_window_expired','skipped_comment_gone','skipped_limit_reached','skipped_duplicate')),
  error          text,
  ig_message_id  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (rule_id, ig_comment_id)
);
alter table public.dm_sends enable row level security;
create policy "own sends" on public.dm_sends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_dm_sends_updated before update on public.dm_sends
  for each row execute function public.set_updated_at();
create index dm_sends_rule_created_idx on public.dm_sends (rule_id, created_at desc);

-- ── webhook_events ── 수신 이벤트 로그(멱등·감사용) ────────────────
-- 비용 주의: 원본 payload를 장기 보관하지 말 것. 추출 필드만 남기고 30~90일 후 파기.
-- TODO(비용): 월별 파티션 + 오래된 파티션 DROP + Supavisor 풀러 (docs/AUTO_DM_COST_RISK.md 1-2/1-3).
create table public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  ig_comment_id  text,
  media_id       text,
  from_id        text,
  verb           text,
  received_at    timestamptz not null default now()
);
create index webhook_events_comment_idx on public.webhook_events (ig_comment_id);
create index webhook_events_received_idx on public.webhook_events (received_at);
-- 서버(서비스 롤)만 기록/조회 — 클라이언트 접근 차단(정책 없음 + RLS on).
alter table public.webhook_events enable row level security;

-- ── commenter_consent ── 수신 동의·수신거부 (개인정보, 별도 보존) ────
-- 로그류와 함께 일괄 TTL 하지 말 것. 핸들은 해시로 최소 저장. 정보통신망법·개인정보보호법.
create table public.commenter_consent (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  ig_user_hash      text not null,        -- 원문 핸들이 아니라 해시
  basis             text,                 -- 동의 근거(키워드 요청/광고 수신동의 등)
  source_comment_id text,
  withdrawn         boolean not null default false,  -- 수신거부 시 true (영구 제외)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, ig_user_hash)
);
alter table public.commenter_consent enable row level security;
create policy "own consent" on public.commenter_consent
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_commenter_consent_updated before update on public.commenter_consent
  for each row execute function public.set_updated_at();

-- ============================================================
-- 0003_functions.sql
-- ============================================================
-- 사용량/한도 트랜잭션 함수
-- 원칙(CLAUDE.md): 한도 차감은 애플리케이션 코드의 직접 UPDATE가 아니라 항상 이 함수로만 처리한다.

-- use_quota: 이번 달 metric 사용량을 원자적으로 p_amount 만큼 증가시키되, 한도 초과면 증가시키지 않고 false 반환.
-- 반환값 true = 허용(차감됨), false = 한도 초과(차감 안 됨). 호출측은 false면 기능을 막는다.
create or replace function public.use_quota(p_metric text, p_limit integer, p_amount integer default 1)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_used  integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.usage_counters (user_id, metric, period_month, used, limit_value)
    values (auth.uid(), p_metric, v_month, 0, p_limit)
    on conflict (user_id, metric, period_month)
      do update set limit_value = excluded.limit_value;  -- 플랜 변경 시 한도 동기화

  update public.usage_counters
    set used = used + p_amount
    where user_id = auth.uid()
      and metric = p_metric
      and period_month = v_month
      and used + p_amount <= limit_value
    returning used into v_used;

  return v_used is not null;
end;
$$;

revoke all on function public.use_quota(text, integer, integer) from public;
grant execute on function public.use_quota(text, integer, integer) to authenticated;

-- TODO(API-last): 자동 DM 월 한도용 "예약-확정" 함수 세트
--   reserve_dm_send()  — 발송 직전 한도 예약(성공 가정 차감)
--   commit_dm_send()   — Meta 200 응답 시 확정
--   release_dm_send()  — 실패/윈도우 만료 시 롤백(한도 복구)
-- 근거: docs/AUTO_DM_COST_RISK.md 4-11 (성공만 차감), CLAUDE.md 크레딧 트랜잭션 원칙.

-- ============================================================
-- 0004_dm_send_pipeline.sql
-- ============================================================
-- 자동 DM 발송 파이프라인 — 웹훅 수신 → 예약(멱등·한도) → 발송 → 확정.
-- 웹훅 라우트는 사용자 세션이 없으므로 이 함수들은 service_role 전용이다.
-- 정책 근거: docs/AUTO_DM_COST_RISK.md (댓글당 1회, 하루 상한, 월 한도 예약-확정, 24h 쿨다운).

-- ── 스키마 보강 ───────────────────────────────────────────────
-- 웹훅 entry.id(IG 사용자 id) → 소유자 매핑용.
-- 유니크: 같은 IG 계정이 두 핀치 계정에 중복 연동되면 웹훅 소유자 판정이 모호해지므로 막는다.
alter table public.connected_accounts add column if not exists platform_user_id text;
create unique index if not exists connected_accounts_platform_uidx
  on public.connected_accounts (channel, platform_user_id) where platform_user_id is not null;

-- 수신자 해시 — 수신자당 24시간 1회 쿨다운·옵트아웃 대조용 (원문 id 저장 금지)
alter table public.dm_sends add column if not exists ig_user_hash text;
create index if not exists dm_sends_recipient_idx on public.dm_sends (user_id, ig_user_hash, created_at desc);

-- 발송 상태 추가: held_night(광고 야간 보류), skipped_cooldown(24h 쿨다운), skipped_optout(수신거부)
alter table public.dm_sends drop constraint if exists dm_sends_status_check;
alter table public.dm_sends add constraint dm_sends_status_check check (status in (
  'pending','sent','delivered',
  'failed_unavailable','failed_permission','failed_window_expired',
  'skipped_comment_gone','skipped_limit_reached','skipped_duplicate','skipped_cooldown','skipped_optout',
  'held_night'
));

-- ── reserve_dm_send ── 발송 예약 (모든 가드를 원자적으로 통과해야 발송 자격) ──
-- 반환: 발송해야 하면 dm_sends.id, 발송하면 안 되면 null (사유는 행 status에 기록됨).
create or replace function public.reserve_dm_send(
  p_owner uuid,
  p_rule_id uuid,
  p_comment_id text,
  p_user_hash text,
  p_monthly_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_send_id    uuid;
  v_rule       public.auto_dm_rules%rowtype;
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_sent_today integer;
  -- 월 기준은 KST 달력월 (한국 서비스 — 일 상한과 동일 타임존)
  v_month      date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_used       integer;
begin
  -- 0) 수신자 단위 직렬화 — 같은 사람의 댓글 2건이 동시에 들어와도 쿨다운 검사가 경합하지 않게
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || coalesce(p_user_hash, ''), 0));

  -- 1) 멱등 삽입 — 같은 (rule, comment)가 이미 있으면 중복 웹훅/재시도이므로 즉시 종료
  insert into public.dm_sends (rule_id, user_id, ig_comment_id, ig_user_hash, status)
    values (p_rule_id, p_owner, p_comment_id, p_user_hash, 'pending')
    on conflict (rule_id, ig_comment_id) do nothing
    returning id into v_send_id;
  if v_send_id is null then
    return null;
  end if;

  -- 2) 규칙 행 잠금 + 하루 상한 — "예약식"으로 즉시 증가시켜 동시 통과를 막는다.
  --    (실패로 끝나면 finalize가 반납. last_sent_at은 예약 시각 기준 — KST 날짜 리셋 앵커)
  select * into v_rule from public.auto_dm_rules where id = p_rule_id for update;
  if not found or v_rule.status <> 'active' then
    update public.dm_sends set status = 'skipped_duplicate', error = 'rule_inactive' where id = v_send_id;
    return null;
  end if;
  v_sent_today := case
    when v_rule.last_sent_at is not null
     and (v_rule.last_sent_at at time zone 'Asia/Seoul')::date = v_today then v_rule.sent_today
    else 0
  end;
  if v_sent_today >= v_rule.daily_cap then
    update public.dm_sends set status = 'skipped_limit_reached', error = 'daily_cap' where id = v_send_id;
    return null;
  end if;
  update public.auto_dm_rules
    set sent_today = v_sent_today + 1, last_sent_at = now()
    where id = p_rule_id;

  -- 3) 수신자 옵트아웃 — 수신거부한 사람에게는 어떤 규칙으로도 보내지 않는다
  if exists (
    select 1 from public.commenter_consent
    where user_id = p_owner and ig_user_hash = p_user_hash and withdrawn
  ) then
    update public.dm_sends set status = 'skipped_optout', error = 'recipient_opted_out' where id = v_send_id;
    return null;
  end if;

  -- 4) 수신자당 24시간 1회 — 규칙이 달라도 같은 사람에게 반복 발송 금지 (스팸 방지)
  if p_user_hash is not null and exists (
    select 1 from public.dm_sends
    where user_id = p_owner
      and ig_user_hash = p_user_hash
      and id <> v_send_id
      and status in ('pending','sent','delivered','held_night')
      and created_at > now() - interval '24 hours'
  ) then
    update public.dm_sends set status = 'skipped_cooldown', error = 'recipient_24h_cooldown' where id = v_send_id;
    return null;
  end if;

  -- 5) 월 한도 예약 (성공 시 확정, 실패 시 finalize가 롤백) — 플랜별 한도는 앱이 전달
  insert into public.usage_counters (user_id, metric, period_month, used, limit_value)
    values (p_owner, 'auto_dm_send', v_month, 0, p_monthly_limit)
    on conflict (user_id, metric, period_month)
      do update set limit_value = excluded.limit_value;
  update public.usage_counters
    set used = used + 1
    where user_id = p_owner and metric = 'auto_dm_send' and period_month = v_month
      and used < limit_value
    returning used into v_used;
  if v_used is null then
    update public.dm_sends set status = 'skipped_limit_reached', error = 'monthly_cap' where id = v_send_id;
    return null;
  end if;

  return v_send_id;
end;
$$;

-- ── finalize_dm_send ── 발송 결과 확정 (reserve를 통과한 행 전용) ──
-- 성공: 규칙 카운터 증가. 종결 실패: failed_total 증가 + 월 한도 반납(성공만 차감 원칙).
-- pending(일시 오류)·held_night(야간 보류)는 한도를 유지한 채 상태만 기록.
create or replace function public.finalize_dm_send(
  p_send_id uuid,
  p_status text,
  p_ig_message_id text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_send   public.dm_sends%rowtype;
  -- 반납 월은 "지금"이 아니라 예약이 일어난 시점(send 행 생성 시각) 기준 — 월 경계에서 오차 방지
  v_month  date;
begin
  select * into v_send from public.dm_sends where id = p_send_id for update;
  if not found then
    return;
  end if;
  v_month := date_trunc('month', v_send.created_at at time zone 'Asia/Seoul')::date;

  update public.dm_sends
    set status = p_status, ig_message_id = coalesce(p_ig_message_id, ig_message_id), error = p_error
    where id = p_send_id;

  if p_status in ('sent','delivered') then
    -- 하루 상한(sent_today)·last_sent_at은 reserve가 이미 예약식으로 반영 — 여기선 누적만
    update public.auto_dm_rules
      set sent_total = sent_total + 1
      where id = v_send.rule_id;
  elsif p_status like 'failed_%' or p_status = 'skipped_comment_gone' then
    -- 성공만 차감 원칙 — 예약했던 하루 상한·월 한도 반납
    update public.auto_dm_rules
      set sent_today = greatest(sent_today - 1, 0),
          failed_total = failed_total + (case when p_status like 'failed_%' then 1 else 0 end)
      where id = v_send.rule_id;
    update public.usage_counters
      set used = greatest(used - 1, 0)
      where user_id = v_send.user_id and metric = 'auto_dm_send' and period_month = v_month;
  end if;
end;
$$;

-- ── mark_optout ── 수신거부 답장 처리 (웹훅 messages 이벤트에서 호출) ──
create or replace function public.mark_optout(p_owner uuid, p_user_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.commenter_consent (user_id, ig_user_hash, basis, withdrawn)
    values (p_owner, p_user_hash, 'optout_reply', true)
    on conflict (user_id, ig_user_hash)
      do update set withdrawn = true, updated_at = now();
end;
$$;

-- 서비스 롤 전용 — 클라이언트(anon/authenticated)에서 직접 호출 금지
revoke all on function public.reserve_dm_send(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.finalize_dm_send(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_optout(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_dm_send(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.finalize_dm_send(uuid, text, text, text) to service_role;
grant execute on function public.mark_optout(uuid, text) to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 0005_payments.sql — Toss 결제 주문 (테스트)
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.payment_orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  order_id      text not null unique,
  plan          text not null check (plan in ('creator','pro','agency')),
  amount        integer not null check (amount > 0),
  order_name    text not null,
  status        text not null default 'ready'
                  check (status in ('ready','paid','failed','canceled')),
  payment_key   text,
  method        text,
  approved_at   timestamptz,
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.payment_orders enable row level security;

create policy "own orders select" on public.payment_orders
  for select using (auth.uid() = user_id);
create policy "own orders insert" on public.payment_orders
  for insert with check (auth.uid() = user_id);

create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);

create trigger trg_payment_orders_updated before update on public.payment_orders
  for each row execute function public.set_updated_at();
