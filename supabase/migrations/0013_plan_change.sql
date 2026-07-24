-- 핀치(Finch) 유료 플랜 간 전환 — 업그레이드(즉시 청구)/다운그레이드(다음 결제일 예약).
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
--
-- pending_plan: 다운그레이드를 예약해 둔 목표 플랜. 다음 정기결제 크론이 도래하면
-- (app/api/cron/refresh-tokens/route.ts의 processSubscriptions) pending_plan 금액으로 청구하고
-- subscriptions.plan을 pending_plan으로 갱신, pending_plan은 다시 null로 되돌린다.
-- 업그레이드는 예약 없이 즉시 청구하므로 pending_plan을 거치지 않는다.

alter table public.subscriptions
  add column if not exists pending_plan text
    check (pending_plan in ('creator','pro','agency','enterprise') or pending_plan is null);
