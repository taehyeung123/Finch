-- 0047_server_side_quota_limits.sql — 무료 한도 우회 차단
--
-- 2026-08-17 프로덕션 점검에서 발견. 0046 과 같은 부류(클라이언트가 정하면 안 되는
-- 값을 클라이언트가 정하고 있었다)인데, 0046 을 먼저 적용하실 수 있게 분리했다.
--
-- ─────────────────────────────────────────────────────────────────────
-- 문제: use_quota 가 **클라이언트가 보낸 한도를 그대로 저장**한다
-- ─────────────────────────────────────────────────────────────────────
--   insert into usage_counters (..., limit_value) values (..., p_limit)
--     on conflict do update set limit_value = excluded.limit_value;
--   update usage_counters set used = used + p_amount
--    where ... and used + p_amount <= limit_value;
--
-- use_quota 는 authenticated 가 RPC 로 직접 부를 수 있다. 그래서 두 가지로 뚫린다:
--   ① p_limit 에 999999 를 넣으면 그 달 한도가 그 값으로 덮인다 → 무료로 무제한
--   ② p_amount 에 음수를 넣으면 used 가 **줄어든다** → 역시 무제한
-- (0046 에서 막은 deduct_credits 음수 문제와 정확히 같은 모양이다)
--
-- ─────────────────────────────────────────────────────────────────────
-- 해결: 한도를 **DB 가 갖는다**. p_limit 은 무시한다.
-- ─────────────────────────────────────────────────────────────────────
-- 함수 시그니처는 그대로 둔다 — 호출부(lib/actions/credits.ts,
-- app/(app)/insights/link/actions.ts)를 건드리지 않고 배포 순서에 자유롭게.
-- 값은 lib/pricing/credit-config.ts 의 FREE_MONTHLY_LIMITS 와 같다.
-- ⚠️ 한쪽만 고치면 화면과 과금이 갈린다 — **둘을 같이 바꿀 것.**
--
-- 적용: Supabase 대시보드 → SQL Editor. 0046 다음에.

create table if not exists public.free_plan_limits (
  metric      text primary key,
  limit_value int not null check (limit_value >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.free_plan_limits enable row level security;
-- 정책을 만들지 않는다 = service_role 과 SECURITY DEFINER 함수만 읽는다.
-- 사용자가 자기 한도를 조회할 이유가 없고, 조회할 수 있으면 바꿔볼 생각을 한다.

insert into public.free_plan_limits (metric, limit_value) values
  ('ai_cardnews', 0),
  ('growth_diagnosis', 0),
  ('reference_collect', 1),
  ('ad_collect', 1),
  ('reference_transcript', 1),
  ('ai_ideas', 0),
  ('ai_brand_tone', 0),
  ('ai_agent_chat', 3),
  ('ai_video_analysis', 1),
  ('board_saves', 20)
on conflict (metric) do update set limit_value = excluded.limit_value, updated_at = now();

create or replace function public.use_quota(p_metric text, p_limit int, p_amount int default 1)
returns boolean as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_used  integer;
  v_limit integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- ① 음수·0·null 차단. 이게 없으면 used 를 되돌려 한도를 무한으로 만들 수 있다.
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;

  -- ② 한도는 **DB 에서** 읽는다. p_limit 인자는 하위 호환을 위해 남겨두되 쓰지 않는다.
  select limit_value into v_limit from public.free_plan_limits where metric = p_metric;
  if v_limit is null then
    -- 등록되지 않은 계량기는 막는다(모르는 metric 으로 무한히 쓰는 걸 방지)
    return false;
  end if;

  insert into public.usage_counters (user_id, metric, period_month, used, limit_value)
    values (auth.uid(), p_metric, v_month, 0, v_limit)
    on conflict (user_id, metric, period_month)
      do update set limit_value = v_limit;   -- 한도 변경 시 동기화(클라이언트 값 아님)

  update public.usage_counters
    set used = used + p_amount
    where user_id = auth.uid()
      and metric = p_metric
      and period_month = v_month
      and used + p_amount <= limit_value
    returning used into v_used;

  return v_used is not null;
end;
$$ language plpgsql security definer set search_path = public;

-- ─────────────────────────────────────────────────────────────────────
-- 부수: 어드바이저가 지적한 "anon 이 SECURITY DEFINER 함수를 부를 수 있다" 정리
-- ─────────────────────────────────────────────────────────────────────
-- handle_new_user·enforce_dm_content_limit 은 트리거 함수라 RPC 로 부르면 어차피
-- 실패하지만(record "new" 미할당), 노출 자체를 없애는 게 맞다.
-- 트리거 실행은 GRANT 와 무관하므로 기능에 영향 없다.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.enforce_dm_content_limit() from anon, authenticated;
revoke execute on function public.set_updated_at() from anon, authenticated;
revoke execute on function public.use_quota(text, int, int) from anon;  -- 로그인 필수 기능이다
