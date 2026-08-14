-- ============================================================================
-- 0037_plan_credits.sql — 유료 플랜 통합 크레딧 월간 지급/리셋
-- ----------------------------------------------------------------------------
-- 2026-08-14 4차 개편: 유료 플랜(creator/pro/agency/enterprise)은 기능별 월 한도
-- 대신 플랜당 "월 크레딧 지급량" 하나로 통합한다(lib/actions/credits.ts
-- PLAN_CREDIT_ALLOWANCE). 이 함수는 그 지급을 담당한다.
--
-- add_credits(0016)와 다르게 "더하기"가 아니라 "그 값으로 맞춘다"(리셋) —
-- 결제 성공 시점(첫 결제·업그레이드·정기갱신)마다 호출해서 미사용 크레딧이 달을
-- 넘겨 누적되지 않게 한다. 무료 티어 한도가 매달 리셋되는 것과 같은 원칙이며,
-- 누적을 허용하면 오래 안 쓴 유저가 크레딧을 쌓아뒀다가 한 달에 몰아 써서
-- "월 지급량 × 크레딧당 원가"로 잡아둔 최악 원가 상한이 깨진다.
--
-- add_credits처럼 service_role 전용, credit_transactions에 순증감(delta)을 기록한다.
-- ============================================================================

create or replace function public.grant_plan_credits(p_user_id uuid, p_amount int, p_reason text)
returns void as $$
declare
  v_old int;
begin
  if p_amount < 0 then
    raise exception 'grant_plan_credits: 음수 불가';
  end if;

  select credits into v_old from public.users_profile where id = p_user_id for update;
  if v_old is null then
    raise exception 'grant_plan_credits: 사용자를 찾을 수 없음 (%)', p_user_id;
  end if;

  update public.users_profile set credits = p_amount where id = p_user_id;

  if p_amount <> v_old then
    insert into public.credit_transactions (user_id, amount, reason)
    values (p_user_id, p_amount - v_old, p_reason);
  end if;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.grant_plan_credits(uuid, int, text) from public, anon, authenticated;
