-- 0065_quota_seed_and_settings_guard.sql — 죽어 있던 콘텐츠 분석 되살리기 + 설정 패치 가드
--
-- 2026-08-25 5라운드 감사에서 나온 두 건.
--
-- ─────────────────────────────────────────────────────────────────────
-- ① content_analysis 계량기가 free_plan_limits 에 없다 → 기능이 **전 플랜에서 죽어 있었다**
-- ─────────────────────────────────────────────────────────────────────
-- 0047 이 「한도는 DB 가 갖는다」로 바꾸면서 **모르는 계량기는 false** 로 막았다(그게 맞다).
-- 그런데 시드 목록에 content_analysis 만 빠졌다. 0047 헤더가 호출부로
-- app/(app)/insights/link/actions.ts 를 직접 적어 두고도 행을 안 넣은 것이다.
-- 결과: use_quota('content_analysis') 가 언제나 false → 화면은 "이번 달 한도를 모두 사용했어요".
-- 한 번도 안 썼는데도, 유료 플랜이어도 그렇다.
--
-- 값 10 은 새로 정한 값이 아니라 코드가 이미 선언한 무료 한도다
-- (insights/link/actions.ts 의 ANALYSIS_LIMITS.free = 10, 주석 "free 월 10회").
-- ⚠️ 유료 플랜의 계량은 아직 정해지지 않았다 — CREDIT_COSTS 에 이 기능 단가가 없다.
--    지금은 앱이 유료 플랜에서 이 계량기를 아예 타지 않는다(무료만 횟수 제한).
--    단가가 정해지면 chargeGeneration 경로로 옮길 것.
insert into public.free_plan_limits (metric, limit_value) values
  ('content_analysis', 10)
on conflict (metric) do update set limit_value = excluded.limit_value, updated_at = now();

-- ─────────────────────────────────────────────────────────────────────
-- ② link_pages_patch_settings 가 **임의 jsonb 를 그대로 병합**한다
-- ─────────────────────────────────────────────────────────────────────
-- authenticated 가 직접 부를 수 있는 RPC 다. 자기 페이지만 건드릴 수 있어 남의 데이터는 안전하지만,
-- 서버 액션(updateLinkSettings)의 검증을 통째로 건너뛴다. 특히 `locked` 는
-- **setLinkPassword 만** 바꿔야 하는 키다(해시는 link_page_secrets 에 따로 있다) —
-- locked:false 로 덮으면 비밀번호 해시는 남은 채 잠금만 풀려 페이지가 그대로 공개된다.
--
-- 그래서 이 함수에서 locked 를 **떼고** 병합한다. 나머지 키는 sanitizeLinkSettings 가
-- 읽는 쪽에서 한 번 더 거르므로(모르는 값은 기본값으로) 여기서 화이트리스트까지 두지는 않는다.
create or replace function public.link_pages_patch_settings(p_page uuid, p_patch jsonb)
returns jsonb
language sql
security invoker
volatile
set search_path = public
as $$
  update public.link_pages
     set settings = coalesce(settings, '{}'::jsonb) || (coalesce(p_patch, '{}'::jsonb) - 'locked')
   where id = p_page and user_id = (select auth.uid())
  returning settings;
$$;
revoke execute on function public.link_pages_patch_settings(uuid, jsonb) from public, anon;
grant execute on function public.link_pages_patch_settings(uuid, jsonb) to authenticated;
