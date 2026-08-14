-- ============================================================================
-- 0039_plan_credits_topup.sql — grant_plan_credits 시맨틱 수정: 리셋 → 채우기(top-up)
-- ----------------------------------------------------------------------------
-- 0037의 "그 값으로 맞춘다(reset)"는 관리자 지급(add_credits) 크레딧까지 파괴했다
-- (2026-08-14 멀티에이전트 리뷰 확정 결함). 예: 유료 사용자가 HQ에서 500크레딧을
-- 받아 잔액 960인 상태에서 정기갱신이 돌면 460으로 깎여 500이 증발한다. 향후
-- 크레딧 판매까지 붙으면 "산 크레딧이 결제일에 사라지는" 사고가 된다.
--
-- 새 시맨틱: credits = greatest(현재 잔액, 월 지급량) — "지급량까지 채우기".
--  - 다 쓴 사용자: 지급량으로 리필 (기존과 동일)
--  - 안 쓴 사용자: 잔액 유지, 이월 누적 없음 (460 → 다음 달에도 460, 920 아님)
--  - 관리자 지급·환불로 지급량을 넘는 잔액: 보존 (파괴 없음)
-- 최악 원가 상한도 유지된다 — 잔액이 지급량을 넘는 경로는 관리자 지급/환불뿐이고
-- 둘 다 회사가 명시적으로 준 돈이라 상한 계산 밖이다.
--
-- 감사 원장: 0037은 잔액 무변동이면 기록을 안 남겼는데, "청구는 성공했는데 지급
-- 기록이 없는" 달이 생겨 전자상거래법 5년 보관 취지에 어긋난다(리뷰 확정). 이제
-- 델타가 0이어도 항상 기록한다.
-- ============================================================================

create or replace function public.grant_plan_credits(p_user_id uuid, p_amount int, p_reason text)
returns void as $$
declare
  v_old int;
  v_new int;
begin
  if p_amount < 0 then
    raise exception 'grant_plan_credits: 음수 불가';
  end if;

  select credits into v_old from public.users_profile where id = p_user_id for update;
  if v_old is null then
    raise exception 'grant_plan_credits: 사용자를 찾을 수 없음 (%)', p_user_id;
  end if;

  v_new := greatest(v_old, p_amount);
  update public.users_profile set credits = v_new where id = p_user_id;

  -- 델타 0이어도 항상 기록 — "이 결제 주기에 지급이 실행됐다"는 감사 증거
  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, v_new - v_old, p_reason);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.grant_plan_credits(uuid, int, text) from public, anon, authenticated;
