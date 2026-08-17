-- 0044_preserve_payment_records.sql — 회원탈퇴 시 결제기록 보존
--
-- 문제: payment_orders.user_id 가 `references auth.users(id) on delete cascade` 라
-- 회원이 탈퇴하면 **결제 기록이 함께 사라진다.** 탈퇴 화면은 "결제 내역은 법령에 따라
-- 별도 보관됩니다"라고 안내하는데, 실제로는 승인 원본(raw)까지 통째로 지워졌다 —
-- 화면이 거짓말을 하고 있었고, 전자상거래법상 대금결제 기록 보존(5년)과도 충돌한다.
--
-- 해결: 결제 표만 `on delete set null` 로 바꾼다. 탈퇴하면 user_id 가 null 이 되어
--  · 개인 식별 연결은 끊기고(개인정보 최소화)
--  · 거래 사실(주문번호·금액·승인시각·결제수단)은 남는다
-- RLS 는 그대로 auth.uid() = user_id 라, user_id 가 null 인 행은 **누구에게도 안 보인다**
-- (service_role 로 조회하는 정산·감사 경로만 접근한다). 정확히 의도한 동작이다.
--
-- subscriptions 는 바꾸지 않는다 — 구독은 "지금 유효한 상태"를 담는 표이지 거래
-- 기록이 아니고, 주인이 사라진 구독 행은 크론이 갱신을 시도할 대상이 되면 곤란하다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

alter table public.payment_orders
  alter column user_id drop not null;

alter table public.payment_orders
  drop constraint if exists payment_orders_user_id_fkey;

alter table public.payment_orders
  add constraint payment_orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
