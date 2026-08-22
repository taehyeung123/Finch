-- 0043: 권한(plan/credits)·결제 주문 클라이언트 쓰기 봉인
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행 (0042 다음)
--
-- 뷰스코프 0005/0018의 "쓰기는 service role 전용" 원칙을 핀치에도 맞춘다.
-- 3사 중 핀치만 이 봉인이 빠져 있었다(딥레드 HQ 실사, 2026-08-16).
--
-- ============================================================
-- 1) [critical] users_profile — 사용자가 자기 plan/credits를 직접 UPDATE
-- ============================================================
-- 0001의 "own profile" 정책이 for all(행 단위)이라 컬럼 제한이 없었다. 로그인
-- 사용자가 anon 키 + 본인 JWT로 PostgREST에 직접 UPDATE를 날리면
--   PATCH /rest/v1/users_profile?id=eq.<본인> { "plan": "enterprise", "credits": 999999 }
-- 가 그대로 통과한다. 결제 없이 최상위 플랜과 무제한 크레딧을 얻는 경로다.
--
-- 앱 코드 실사 결과 브라우저가 이 테이블에 쓰는 곳은 한 곳도 없다(프로필 수정
-- UI 자체가 없고, display_name은 가입 트리거가 한 번 넣는다). plan을 바꾸는 7곳은
-- 전부 service role이고, credits는 security definer RPC로만 변경된다
-- (add_credits/deduct_credits/grant_plan_credits — 0016·0039에서 이미 revoke됨).
-- 따라서 쓰기 권한을 통째로 회수해도 기능 영향이 없다.
drop policy if exists "own profile" on public.users_profile;

-- 조회는 그대로 본인 행만.
create policy "own profile select" on public.users_profile
  for select using (auth.uid() = id);

-- 정책 제거에 더해 grant 레벨에서도 봉인한다(뷰스코프 0005/0018과 동일한 이중 방어).
-- security definer 함수(handle_new_user, add_credits 등)는 정의자 권한으로 돌아
-- 이 회수의 영향을 받지 않는다.
revoke insert, update, delete on table public.users_profile from anon, authenticated;

-- ============================================================
-- 2) [critical] payment_orders — 금액을 조작한 주문 생성
-- ============================================================
-- 0005의 "own orders insert" 정책은 user_id만 검사했다. 승인 단계에서 서버가
-- "DB에 미리 저장된 금액"을 신뢰해 검증하는 구조(REAL_API_SPEC 4절)이므로,
-- 사용자가 직접
--   POST /rest/v1/payment_orders { plan: "agency", amount: 100, status: "ready" }
-- 를 넣고 100원을 결제하면 서버 검증(100 == 100)을 통과해 99,000원 플랜이 부여된다.
-- status: "paid"로 넣으면 결제 없이 딥레드 HQ의 실결제·매출 지표까지 오염시킨다.
--
-- 주문 생성은 서버 액션(createCheckout)이 유일한 정상 경로이고, 이 마이그레이션과
-- 함께 그 액션을 admin 클라이언트로 바꾼다. 따라서 클라이언트 insert는 불필요하다.
-- (update 정책은 원래부터 없다 — 승인은 service role만 한다)
drop policy if exists "own orders insert" on public.payment_orders;
revoke insert, update, delete on table public.payment_orders from anon, authenticated;

-- ============================================================
-- 3) 확인용 — 남은 클라이언트 쓰기 권한 점검 쿼리
-- ============================================================
-- 적용 후 아래를 실행하면 anon/authenticated에 남아 있는 쓰기 권한을 볼 수 있다.
-- 권한·쿼터·결제 테이블(users_profile, payment_orders, subscriptions,
-- usage_counters, credit_transactions)이 결과에 없어야 정상이다.
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and grantee in ('anon', 'authenticated')
--      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
--    order by table_name, grantee;
