-- 0090_dm_hash_pepper.sql — 수신거부·발송 기록 조회가 «옛 해시»도 함께 보게 한다
--
-- 무엇이 문제였나 (2026-09-08 보안 감사, Low)
-- ------------------------------------------------------------------
-- 댓글 작성자 식별값을 **비밀 키 없는 SHA-256** 으로 저장했다. 인스타 사용자 id 는 숫자이고,
-- 무엇보다 «어떤 게시물에 누가 댓글을 달았는지»는 공개 정보다 — 후보 목록을 손에 넣은 사람은
-- 해시를 하나씩 대조해 «이 사람이 수신거부했는지»·«DM 을 받았는지»를 확인할 수 있었다.
-- 개인정보처리방침은 이 값을 「식별 최소화를 위해 해시 처리」라고 설명하는데, 키 없는 해시는 그 주장을 뒷받침하지 못한다.
--
-- ────────────────────────────────────────────────────────────────
-- ⚠️ 저장된 해시를 **다시 계산하지 않는다.** 이 마이그레이션은 데이터를 한 줄도 바꾸지 않는다.
-- ────────────────────────────────────────────────────────────────
-- 저장된 값은 이미 sha256(id) 라서 원문 id 를 되찾을 수 없다. 되찾을 수 없는 값을 한꺼번에 바꾸다
-- 잘못되면 **수신거부한 사람에게 DM 이 다시 나간다** — 이미 발송된 것은 되돌릴 수 없다.
-- 그래서 재계산 대신 **조회가 둘 다 보게** 한다:
--   · 새로 쓰는 값 = HMAC(페퍼, id)      (lib/auto-dm/recipient-hash.ts)
--   · 조회         = 새 값 **또는** 옛 값
-- 옛 행은 그대로 사람을 보호하고, 시간이 지나면 자연히 사라진다.
--
-- ⚠️ 함수 시그니처가 바뀐다(파라미터 하나 추가). 옛 시그니처는 **지운다** —
--    남겨 두면 그쪽으로 들어온 호출이 옛 해시만 보고 조용히 «수신거부 없음»으로 판정한다
--    (0059 의 남은 오버로드가 0065 가드를 우회할 뻔했던 것과 같은 함정).
--    코드는 새 시그니처를 부르되 «함수를 못 찾음» 오류면 옛 호출로 한 번 더 시도한다 —
--    그래서 배포와 적용의 순서가 어느 쪽이어도 자동 DM 이 멈추지 않는다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- ── reserve_dm_send — 옵트아웃·24시간 쿨다운 조회에 옛 해시를 함께 본다 ────
drop function if exists public.reserve_dm_send(uuid, uuid, text, text, integer);

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

-- ── mark_optout — 옛 해시로 남은 기록이 있으면 그것도 함께 세운다 ──────────
drop function if exists public.mark_optout(uuid, text);

create or replace function public.mark_optout(
  p_owner uuid,
  p_user_hash text,
  p_user_hash_legacy text default null
)
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

  /* 옛 해시로 이미 행이 있으면 그것도 «수신거부»로 세운다 — 없으면 아무 일도 하지 않는다.
     새로 만들지는 않는다(옛 방식으로 행을 늘릴 이유가 없다). */
  if p_user_hash_legacy is not null then
    update public.commenter_consent
      set withdrawn = true, updated_at = now()
      where user_id = p_owner and ig_user_hash = p_user_hash_legacy;
  end if;
end;
$$;

-- 서비스 롤 전용 — 클라이언트(anon/authenticated)에서 직접 호출 금지
revoke all on function public.reserve_dm_send(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.mark_optout(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_dm_send(uuid, uuid, text, text, integer, text) to service_role;
grant execute on function public.mark_optout(uuid, text, text) to service_role;

-- ────────────────────────────────────────────────────────────────
-- 적용 확인
--   ① 두 함수가 **새 시그니처 하나씩만** 있어야 한다(옛 것이 남아 있으면 그쪽이 옛 해시만 본다)
--   ② 데이터는 한 줄도 안 바뀐다 — 참고용 행 수
-- ────────────────────────────────────────────────────────────────
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('reserve_dm_send', 'mark_optout')
order by p.proname, args;

select
  (select count(*) from public.commenter_consent) as "수신거부 기록",
  (select count(*) from public.dm_sends)          as "발송 기록",
  (select count(*) from public.webhook_events)    as "웹훅 로그";
