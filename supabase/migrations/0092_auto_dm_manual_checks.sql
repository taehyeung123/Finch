-- 0092_auto_dm_manual_checks.sql — 자동 DM «지금 확인» 남용 제한 (2026-09-11)
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
-- 적용 확인 — 표 1개·함수 1개, authenticated 에게 표 권한이 없어야 한다
-- ────────────────────────────────────────────────────────────────
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'claim_auto_dm_check';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'auto_dm_manual_checks'
  and grantee in ('anon', 'authenticated');
