-- 0046_lock_billing_columns.sql — 🚨 결제 우회 구멍 두 개 차단 (긴급)
--
-- 2026-08-17 프로덕션 검증 중 발견. **둘 다 실제로 재현했다**(롤백 보장 블록에서 실행,
-- 데이터 변경 없음). 신규 마이그레이션(0043~0045)이 만든 게 아니라 0001·0016 부터
-- 있던 구멍이다.
--
-- ─────────────────────────────────────────────────────────────────────
-- ① 로그인한 사용자가 자기 plan·credits 를 **직접 UPDATE** 할 수 있었다
-- ─────────────────────────────────────────────────────────────────────
-- users_profile 의 "own profile" 정책이 `for all using (auth.uid() = id)` 이고
-- authenticated 에게 표 전체 UPDATE 권한이 있었다. RLS 는 "내 행인가"만 보지
-- "어느 컬럼인가"는 안 본다. 그래서 아무나 이걸 보내면 끝이었다:
--
--     PATCH /rest/v1/users_profile?id=eq.<자기 id>
--     {"plan":"enterprise","credits":9999999}
--
-- anon 키는 NEXT_PUBLIC_ 으로 브라우저 번들에 들어 있고 access_token 은 devtools 에서
-- 그냥 보인다. 즉 **결제 없이 최상위 플랜과 무한 크레딧**을 가질 수 있었다.
-- 실측: plan=free credits=0 → plan=enterprise credits=9999999 (성공)
--
-- 앱 코드는 이 권한이 필요 없다. 사용자 세션으로 users_profile 을 쓰는 곳은
-- app/(app)/settings/profile/actions.ts 의 display_name 하나뿐이고, plan 변경은
-- 전부 service_role(결제 성공·웹훅·크론)이 한다.
--
-- ─────────────────────────────────────────────────────────────────────
-- ② deduct_my_credits 에 음수를 넣으면 크레딧이 **발행**됐다
-- ─────────────────────────────────────────────────────────────────────
-- add_credits 에는 `if p_amount <= 0 then raise exception` 가드가 있는데
-- deduct_credits 에만 빠져 있었다. 음수를 넣으면:
--   · 잔액 검사 `current_balance < p_amount` 가 `0 < -50000` = false 라 통과
--   · `credits = credits - (-50000)` → 5만 증가
-- deduct_my_credits 는 authenticated 가 RPC 로 직접 부를 수 있다.
-- 실측: deduct_my_credits(-50000) → credits 0 → 50000 (성공)
--
-- 적용: Supabase 대시보드 → SQL Editor. **가능한 한 빨리.**

-- ════════════════════════════════════════════════════════════════════
-- ① users_profile — 컬럼 단위로 권한을 좁힌다
-- ════════════════════════════════════════════════════════════════════

-- 표 전체 권한을 먼저 회수한다. GRANT 는 누적되므로 "빼고 주기"가 아니라
-- "전부 회수하고 필요한 것만 주기"여야 한다.
revoke insert, update, delete on public.users_profile from anon, authenticated;

-- 사용자가 실제로 바꾸는 건 이름 하나다.
-- (updated_at 은 trg_users_profile_updated 트리거가 채운다 — 권한 불필요)
grant update (display_name) on public.users_profile to authenticated;

-- RLS 도 함께 좁힌다. FOR ALL 이면 DELETE 로 자기 프로필을 지운 뒤
-- plan='enterprise' 로 다시 INSERT 하는 경로가 열린다(GRANT 를 회수했어도
-- 나중에 누가 GRANT 를 되살리면 그 순간 다시 뚫린다 — 두 겹으로 막는다).
drop policy if exists "own profile" on public.users_profile;

create policy "own profile select" on public.users_profile
  for select to authenticated using (auth.uid() = id);

create policy "own profile update" on public.users_profile
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- INSERT·DELETE 정책은 **일부러 만들지 않는다.**
--  · 생성: handle_new_user() 트리거가 SECURITY DEFINER 로 넣는다(RLS 우회)
--  · 삭제: auth.users 삭제 시 on delete cascade 로 사라진다(회원탈퇴 경로)
-- 둘 다 사용자가 직접 할 이유가 없다.

-- ════════════════════════════════════════════════════════════════════
-- ② deduct_credits — 양수 가드 (add_credits 와 동일 형식)
-- ════════════════════════════════════════════════════════════════════
-- 래퍼(deduct_my_credits)가 아니라 **여기**에 넣는다 — 다른 호출 경로도 함께 막힌다.
create or replace function public.deduct_credits(p_user_id uuid, p_amount int, p_reason text)
returns boolean as $$
declare
  current_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'deduct_credits: 양수만 허용 (받은 값: %)', p_amount;
  end if;

  select credits into current_balance from public.users_profile where id = p_user_id for update;
  if current_balance is null or current_balance < p_amount then
    return false;
  end if;
  update public.users_profile set credits = credits - p_amount where id = p_user_id;
  insert into public.credit_transactions (user_id, amount, reason)
  values (p_user_id, -p_amount, p_reason);
  return true;
end;
$$ language plpgsql security definer set search_path = public;

-- ════════════════════════════════════════════════════════════════════
-- ③ payment_orders — 사용자가 가짜 '결제 완료' 기록을 만들 수 없게
-- ════════════════════════════════════════════════════════════════════
-- "own orders insert" 정책이 status 를 제한하지 않아, 사용자가 직접
-- {"status":"paid","amount":1} 인 행을 넣을 수 있었다. 0044 가 법정 보존 대상으로
-- 지정한 바로 그 표다 — 위조 기록이 섞이면 보존의 의미가 없다.
--
-- 정책을 없애는 대신 **status='ready' 만 허용**한다. createCheckout 이 사용자
-- 세션으로 넣고 있어서(app/(app)/settings/billing/actions.ts:44) 정책을 통째로
-- 걷으면 결제 시작이 막힌다. 승인 이후 상태 변경은 원래부터 service_role 전용이다
-- (UPDATE 정책이 없다).
drop policy if exists "own orders insert" on public.payment_orders;
create policy "own orders insert" on public.payment_orders
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'ready' and payment_key is null and approved_at is null);

-- ════════════════════════════════════════════════════════════════════
-- ④ 프로필 링크 예약어 — 앱에만 있던 사칭 방지를 DB 로 내린다
-- ════════════════════════════════════════════════════════════════════
-- lib/links.ts 의 RESERVED 는 서버 액션 경로에서만 돈다. authenticated 는
-- link_pages 에 INSERT/UPDATE GRANT 가 있고 RLS 는 auth.uid()=user_id 만 보므로,
-- PostgREST 를 직접 호출하면 /p/official · /p/support · /p/finch 를 선점할 수 있었다.
-- 사칭 방지는 앱이 아니라 DB 가 지켜야 한다.
alter table public.link_pages drop constraint if exists link_pages_slug_reserved_check;
alter table public.link_pages add constraint link_pages_slug_reserved_check
  check (slug not in (
    'admin','api','app','auth','login','logout','signup','signin',
    'settings','support','help','billing','pricing','terms','privacy',
    'finch','official','team','about','contact','root','system',
    'static','assets','public','new','edit','delete','null','undefined'
  ));

-- ════════════════════════════════════════════════════════════════════
-- ⑤ credit_transactions 인덱스 — 크레딧 화면이 매번 풀스캔하고 있었다
-- ════════════════════════════════════════════════════════════════════
create index if not exists credit_transactions_user_time_idx
  on public.credit_transactions (user_id, created_at desc);
