-- 0092_auto_dm_manual_checks.sql — 자동 DM «지금 확인» 남용 제한 + 발송 원장이 규칙 삭제를 견디게 (2026-09-11)
--
-- 왜: «지금 확인»은 버튼 한 번에 게시물 댓글(최대 50개)을 인스타에서 읽고 규칙대로 비공개 답장을 보낸다.
-- 댓글 알림(웹훅)은 앱이 Live·고급 권한 승인을 받은 뒤에야 오기 때문에, 그 전(심사 녹화·사전 시험)에는 이 버튼이 유일한 길이다.
-- 연타·스크립트 호출을 막지 않으면 한 사람이 우리 함수 시간과 **그 사람 토큰의 호출 한도**를 태운다.
-- 제한은 규칙당 30초에 한 번(lib/auto-dm/check-now-types.ts CHECK_NOW_COOLDOWN_SEC).
--
-- 왜 표인가: 인스턴스 메모리 카운터는 서버리스 인스턴스마다 따로 살아 요청을 흩뿌리면 제한이 사라진다(0072 와 같은 결론).
-- 왜 auto_dm_rules 에 컬럼을 달지 않나: 그 표는 "own rules" 정책으로 **사용자가 직접 update** 할 수 있다 —
-- 제한 시각을 거기 두면 PostgREST 로 지워 제한을 풀 수 있다. 이 표는 정책이 없어 service_role 만 읽고 쓴다.
--
-- 판정은 함수 한 번(원자적): 처음이면 넣고, 있으면 30초가 지났을 때만 시각을 바꾼다.
-- 두 요청이 동시에 와도 on conflict 가 한쪽만 통과시킨다.
--
-- ⚠️ 코드(lib/auto-dm/check-now.ts)는 이 함수가 없으면 «지금 확인»을 **막는다**(닫는 쪽 실패 + 로그).
--    이 마이그레이션을 적용해야 버튼이 동작한다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

create table if not exists public.auto_dm_manual_checks (
  rule_id    uuid primary key references public.auto_dm_rules(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null default now()
);

comment on table public.auto_dm_manual_checks is
  '자동 DM «지금 확인» 마지막 실행 시각(규칙당 1행) — 남용 제한 전용. service_role 만 접근(0092).';

alter table public.auto_dm_manual_checks enable row level security;
-- 정책 없음 + 기본 grant 회수 — 사용자가 기록을 지워 제한을 푸는 경로를 닫는다
revoke all on table public.auto_dm_manual_checks from anon, authenticated;

-- ── claim_auto_dm_check ── 이번 확인을 해도 되는가
-- 반환: 0 = 통과(시각 기록함) · 양수 = 그만큼(초) 더 기다려야 한다 · -1 = 그 사용자의 규칙이 아니다
create or replace function public.claim_auto_dm_check(
  p_rule_id     uuid,
  p_owner       uuid,
  p_min_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
  v_last    timestamptz;
begin
  -- 소유 대조 — 호출측(서버 액션)이 이미 확인하지만 함수도 스스로 본다(남의 규칙 시각을 건드리지 못하게)
  if not exists (select 1 from public.auto_dm_rules where id = p_rule_id and user_id = p_owner) then
    return -1;
  end if;

  insert into public.auto_dm_manual_checks as c (rule_id, user_id, checked_at)
    values (p_rule_id, p_owner, now())
    on conflict (rule_id) do update
      set checked_at = excluded.checked_at, user_id = excluded.user_id
      where c.checked_at <= now() - make_interval(secs => greatest(p_min_seconds, 1))
    returning true into v_claimed;

  if v_claimed then
    return 0;
  end if;

  select checked_at into v_last from public.auto_dm_manual_checks where rule_id = p_rule_id;
  return greatest(
    1,
    ceil(extract(epoch from (v_last + make_interval(secs => greatest(p_min_seconds, 1)) - now())))::integer
  );
end;
$$;

-- 서비스 롤 전용 — 클라이언트(anon/authenticated)에서 직접 호출 금지
revoke all on function public.claim_auto_dm_check(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_auto_dm_check(uuid, uuid, integer) to service_role;

-- ────────────────────────────────────────────────────────────────
-- 발송 원장이 규칙 삭제를 견디게 한다 (2026-09-11 소넷 점검 적발)
--
-- 왜: dm_sends.rule_id 가 on delete cascade 라서 규칙을 지우면 그 규칙의 발송 기록이 **통째로 사라졌다.**
-- 그 기록이 «댓글당 1회»와 «수신자 24시간 1회»의 유일한 근거라, 규칙을 지우고 같은 게시물에 새 규칙을 만든 뒤
-- «지금 확인»(또는 웹훅 재전송)이 오면 **같은 댓글 작성자에게 DM·공개 답글이 한 번 더** 나갈 수 있었다.
-- «지금 확인»은 규칙을 고쳐 가며 같은 7일치 댓글을 여러 번 훑는 기능이라 이 경로를 일상적으로 밟는다.
-- 수리: 규칙이 지워지면 rule_id 만 비우고(set null) 기록은 남긴다. 발송 이력은 방침 5조대로 탈퇴 때 user_id cascade 로 파기된다.
-- ────────────────────────────────────────────────────────────────
alter table public.dm_sends alter column rule_id drop not null;

do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.dm_sends'::regclass
    and c.contype = 'f'
    and a.attname = 'rule_id';
  if v_name is not null then
    execute format('alter table public.dm_sends drop constraint %I', v_name);
  end if;
end $$;

alter table public.dm_sends
  add constraint dm_sends_rule_id_fkey
  foreign key (rule_id) references public.auto_dm_rules(id) on delete set null;

-- «지금 확인»의 처리 기록 조회와 아래 댓글당 1회 가드가 쓰는 색인
create index if not exists dm_sends_user_comment_idx on public.dm_sends (user_id, ig_comment_id);

-- ── reserve_dm_send — 0090 판에 «댓글당 1회» 가드(0.5)만 더했다. 시그니처·권한은 그대로 ──
create or replace function public.reserve_dm_send(
  p_owner         uuid,
  p_rule_id       uuid,
  p_comment_id    text,
  p_user_hash     text,
  p_monthly_limit integer,
  -- 옛 방식(키 없는 sha256) 해시. null 이면 페퍼 미설정이라 p_user_hash 와 같은 값이다.
  p_user_hash_legacy text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_send_id    uuid;
  v_rule       public.auto_dm_rules%rowtype;
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_sent_today integer;
  v_month      date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_used       integer;
  -- 조회에 쓸 후보 둘 — 새 값과 옛 값. 저장은 언제나 p_user_hash(새 값) 로만 한다.
  v_hashes     text[] := array_remove(array[p_user_hash, p_user_hash_legacy], null);
begin
  -- 0) 수신자 단위 직렬화 — 같은 사람의 댓글 2건이 동시에 들어와도 쿨다운 검사가 경합하지 않게
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || coalesce(p_user_hash, ''), 0));

  -- 0.5) 댓글당 1회(0092) — 규칙이 달라도 같은 댓글에는 다시 보내지 않는다.
  --      (rule_id, ig_comment_id) 유니크만으로는 «규칙을 지우고 새 규칙을 만든 뒤 다시 확인»을 못 막는다.
  --      위 advisory lock 이 같은 수신자(=같은 댓글 작성자)를 직렬화하므로 이 확인과 아래 삽입 사이에 경합이 없다.
  if exists (
    select 1 from public.dm_sends
    where user_id = p_owner and ig_comment_id = p_comment_id
  ) then
    return null;
  end if;

  -- 1) 멱등 삽입 — 같은 (rule, comment)가 이미 있으면 중복 웹훅/재시도이므로 즉시 종료
  insert into public.dm_sends (rule_id, user_id, ig_comment_id, ig_user_hash, status)
    values (p_rule_id, p_owner, p_comment_id, p_user_hash, 'pending')
    on conflict (rule_id, ig_comment_id) do nothing
    returning id into v_send_id;
  if v_send_id is null then
    return null;
  end if;

  -- 2) 규칙 행 잠금 + 하루 상한 — "예약식"으로 즉시 증가시켜 동시 통과를 막는다.
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

  -- 3) 수신자 옵트아웃 — **옛 해시로 남은 수신거부도 반드시 잡는다.**
  --    여기서 놓치면 수신거부한 사람에게 DM 이 나간다(되돌릴 수 없다).
  if exists (
    select 1 from public.commenter_consent
    where user_id = p_owner and ig_user_hash = any(v_hashes) and withdrawn
  ) then
    update public.dm_sends set status = 'skipped_optout', error = 'recipient_opted_out' where id = v_send_id;
    return null;
  end if;

  -- 4) 수신자당 24시간 1회 — 규칙이 달라도 같은 사람에게 반복 발송 금지 (스팸 방지)
  if p_user_hash is not null and exists (
    select 1 from public.dm_sends
    where user_id = p_owner
      and ig_user_hash = any(v_hashes)
      and id <> v_send_id
      and status in ('pending','sent','delivered','held_night')
      and created_at > now() - interval '24 hours'
  ) then
    update public.dm_sends set status = 'skipped_cooldown', error = 'recipient_24h_cooldown' where id = v_send_id;
    return null;
  end if;

  -- 5) 월 한도 — 폐지됐지만 시그니처·호출 규약 유지를 위해 그대로 둔다
  select coalesce(sum(1), 0) into v_used
    from public.dm_sends
    where user_id = p_owner
      and status in ('sent','delivered')
      and (created_at at time zone 'Asia/Seoul')::date >= v_month;
  if v_used >= p_monthly_limit then
    update public.dm_sends set status = 'skipped_limit_reached', error = 'monthly_limit' where id = v_send_id;
    return null;
  end if;

  return v_send_id;
end;
$$;

revoke all on function public.reserve_dm_send(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.reserve_dm_send(uuid, uuid, text, text, integer, text) to service_role;

-- ────────────────────────────────────────────────────────────────
-- 적용 확인 — 표 1개·함수 1개, authenticated 에게 표 권한이 없어야 한다
-- ────────────────────────────────────────────────────────────────
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'claim_auto_dm_check';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'auto_dm_manual_checks'
  and grantee in ('anon', 'authenticated');

-- 발송 원장 확인 — rule_id 가 null 허용이고 FK 가 set null 이어야 한다
select c.conname, c.confdeltype  -- 'n' = set null
from pg_constraint c
where c.conrelid = 'public.dm_sends'::regclass and c.contype = 'f';
