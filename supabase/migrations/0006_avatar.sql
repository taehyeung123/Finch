-- 핀치(Finch) 연동 계정 프로필 사진 — Instagram profile_picture_url 저장
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
-- 미적용이어도 대시보드는 라이브 조회값으로 표시된다(코드가 컬럼 결측을 흡수).

alter table public.connected_accounts add column if not exists avatar_url text;
