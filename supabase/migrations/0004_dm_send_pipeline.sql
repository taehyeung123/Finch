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
