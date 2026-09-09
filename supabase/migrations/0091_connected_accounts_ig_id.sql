-- 0091: connected_accounts.ig_id — 인스타그램 «프로페셔널 계정 ID»를 따로 저장한다 (2026-09-09 전수 감사)
--
-- 왜: 인스타 로그인 API 의 /me 는 두 ID 를 준다.
--   · id      — 앱 범위(app-scoped) ID. 콜백이 지금까지 platform_user_id 에 저장하던 값이고,
--               deauthorize/data-deletion 콜백의 signed_request.user_id 와 대조하는 값이다.
--   · user_id — 인스타그램 프로페셔널 계정 ID(IG_ID). 메타 문서: «This ID is the value of the id field
--               received in webhook notifications for this account.»
-- 댓글 웹훅은 entry.id(=IG_ID)로 계정을 찾는데 platform_user_id 에는 앱 범위 ID 가 들어 있어
-- 매핑이 **영영 0행**이었다 — 자동 DM 이 한 통도 나갈 수 없는 구조였고, 실 웹훅을 아직 못 받아 드러나지 않았다.
-- platform_user_id 의 의미(앱 범위)는 그대로 두고(해제 콜백이 쓴다), 웹훅용 ID 를 이 컬럼에 둔다.
--
-- 채우는 곳: 인스타 OAuth 콜백(신규·재연동), refresh-tokens 크론의 일일 스냅샷(기존 계정 백필).
-- 읽는 곳: 웹훅 계정 매핑(ig_id → 없으면 platform_user_id 로 한 번 더), flush-dms 발송 경로 노드.
--
-- ⚠️ 0085 가 authenticated 에 열 단위 GRANT 를 걸어 두었다 — 이 컬럼은 **일부러 열지 않는다**(서버만 읽는다).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 코드 쪽은 컬럼이 없어도 폴백으로 돈다(순서 무관).

alter table public.connected_accounts
  add column if not exists ig_id text;

comment on column public.connected_accounts.ig_id is
  '인스타그램 프로페셔널 계정 ID(/me 의 user_id) — 댓글 웹훅 entry.id 와 같은 값. platform_user_id(앱 범위 id)와 다르다(0091).';

-- 웹훅 매핑 조회 경로: channel='instagram' and ig_id = entry.id
create index if not exists connected_accounts_ig_id_idx
  on public.connected_accounts (channel, ig_id)
  where ig_id is not null;
