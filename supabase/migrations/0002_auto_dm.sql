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
