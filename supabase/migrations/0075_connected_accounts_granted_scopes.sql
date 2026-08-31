-- 0075_connected_accounts_granted_scopes.sql — 토큰이 실제로 받은 권한을 기록한다
--
-- 왜: OAuth 스코프는 **동의 시점에 고정**된다. 나중에 코드의 스코프 배열을 늘려도
--     이미 발급된 토큰은 바뀌지 않는다. 그런데 지금은 «이 토큰이 무슨 권한을 갖고 있는지»를
--     알 방법이 저장소 어디에도 없다 — 토큰 교환 응답의 permissions 를 파싱해 놓고 버렸다.
--
--     실제로 사고가 났다(2026-08-31 확인): 인스타 토큰은 2026-07-18 발급인데
--     예약 발행 권한(instagram_business_content_publish)은 2026-08-30 에야 스코프 배열에 들어갔다.
--     그 토큰으로는 발행이 **반드시 실패**하는데, 화면 어디에도 신호가 없고
--     예약 발행 크론이 도는 **새벽 6시에야** 권한 오류로 알게 된다.
--
--     이 컬럼이 있으면 예약을 거는 순간 «재연동이 필요해요» 라고 말해 줄 수 있다.
--
-- 값이 없을 때(null)의 의미: «모른다» 이지 «권한이 없다» 가 아니다.
--   이 마이그레이션 이전에 연동한 토큰은 전부 null 이다. 코드는 null 을 «확인 불가» 로 다루고
--   기능을 막지 않는다 — 모른다고 멀쩡한 연동을 끊으면 그게 더 나쁘다.
--   재연동하면 그때부터 채워진다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

alter table public.connected_accounts
  add column if not exists granted_scopes text[];

comment on column public.connected_accounts.granted_scopes is
  '동의 시점에 실제로 부여된 스코프. null = 확인 불가(0075 이전 연동) — «권한 없음»과 다르다. 코드의 스코프 배열과 대조해 재연동 필요 여부를 판단한다.';
