-- 0074_order_amount_tamper_guard.sql — 🚨 주문 금액 조작으로 상위 플랜을 헐값에 사는 경로 차단
--
-- 0046이 payment_orders INSERT를 status='ready' + payment_key/approved_at null로 좁혔지만
-- **amount는 제한하지 않았다.** 그런데 승인 코드가 그 amount를 "신뢰 원천"으로 쓴다
-- (app/(finch)/(app)/settings/billing/success/page.tsx — "본인 주문 조회(RLS) — 예정
-- 금액/플랜의 신뢰 원천"). 그래서 아래가 그대로 통과한다:
--
--   1) PostgREST 직접 호출로 주문을 만든다(0046 정책을 모두 만족한다)
--      POST /rest/v1/payment_orders
--      {"user_id":"<자기 id>","order_id":"finch_agency_...","plan":"agency",
--       "amount":100,"order_name":"...","status":"ready"}
--
--   2) 체크아웃으로 100원을 결제한다. 토스는 우리가 넘긴 금액만 알 뿐 정가를 모른다.
--
--   3) processConfirmation이 amountParam(100) === order.amount(100) 검증을 통과하고,
--      confirmPayment({amount: order.amount})로 100원을 승인한 뒤
--      users_profile.plan = order.plan("agency")를 부여한다.
--
--   → 99,000원 Agency 플랜을 100원에 구매. Enterprise(249,000원)도 동일하다.
--
-- 근본 원인은 "가맹점이 정한 금액"이어야 할 값을 사용자가 쓸 수 있다는 것이다.
-- 금액 검사를 정책에 넣는 방법(amount = 플랜별 정가)도 있지만, 가격이 앱 코드
-- (lib/toss/config.ts PLAN_PRICES)에 있고 아직 "정식 가격 미정 — 잠정값" 상태라
-- DB에 이중으로 박아두면 가격을 바꿀 때마다 어긋난다. 그래서 쓰기 자체를 서버로 옮긴다.
--
-- 동반 코드 변경: createCheckout이 admin(service role) 클라이언트로 주문을 넣도록 수정.
-- user.id는 그 직전 getAuthUser()로 검증된 값이라 남의 주문을 만들 수는 없고,
-- amount는 서버가 PLAN_PRICES에서 계산한 값만 들어간다.
--
-- 적용: Supabase 대시보드 → SQL Editor. **코드 배포와 함께.**
--   (코드를 먼저 배포하면 정책이 남아 있어도 정상 동작하고, 이 SQL을 먼저 적용하면
--    구버전 코드의 결제 시작이 막히므로 코드 → SQL 순서를 권장한다)

-- ════════════════════════════════════════════════════════════════════
-- payment_orders — 주문 생성을 service_role 전용으로
-- ════════════════════════════════════════════════════════════════════

-- 정책을 걷는다. 승인 이후 상태 변경은 원래부터 service_role 전용이다(UPDATE 정책 없음).
drop policy if exists "own orders insert" on public.payment_orders;

-- GRANT도 함께 회수한다(0046 주석과 같은 이유 — 정책만 지우면 나중에 누가 정책을
-- 되살리는 순간 다시 뚫린다. 두 겹으로 막는다).
revoke insert, update, delete on public.payment_orders from anon, authenticated;

-- 조회는 그대로 본인 주문만(0064의 select 정책 유지). 결제 내역 화면이 이걸 쓴다.

-- ── 적용 후 확인 ──
-- authenticated에 payment_orders 쓰기 권한이 남아 있지 않아야 한다.
--
--   select privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='payment_orders'
--      and grantee in ('anon','authenticated');
--   -- 기대: SELECT 만 (또는 0건)
