-- 핀치(Finch) TikTok 연동 — refresh_token 별도 저장 컬럼.
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
-- 미적용이어도 연동 자체는 access_token만으로 동작한다(코드가 컬럼 결측을 흡수) —
-- 다만 그 경우 TikTok의 24시간짜리 액세스 토큰을 자동 갱신할 수 없어 매일 재연동이 필요해진다.
--
-- 배경: 인스타그램/Threads는 "장기토큰이 자기 자신을 갱신"하는 모델이라 access_token_cipher
-- 하나로 충분했지만, TikTok은 access_token(24시간)과 refresh_token(365일)이 분리된 표준
-- OAuth2 모델이라 별도 컬럼이 필요하다 (lib/tiktok/oauth.ts, docs/REAL_API_SPEC.md 6절).

alter table public.connected_accounts add column if not exists refresh_token_cipher text;
