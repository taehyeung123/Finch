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
