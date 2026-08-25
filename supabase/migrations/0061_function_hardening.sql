-- 0061: 함수 경화 — search_path 고정 + 트리거 함수의 불필요한 EXECUTE 회수
--
-- 배경(2026-08-24 Supabase 보안 린트):
--  · link_pages_publish_stamp / set_updated_at / normalize_thumb_state / merge_creative_tags 는
--    search_path 가 고정돼 있지 않다. 트리거는 테이블 소유자 권한으로 도는데, 호출자 search_path 를
--    따라가면 같은 이름의 함수·연산자를 앞선 스키마에 심어 가로챌 여지가 생긴다(0011 린트).
--  · handle_new_user / enforce_dm_content_limit / set_updated_at / link_pages_publish_stamp 는
--    anon·authenticated 가 /rest/v1/rpc/ 로 호출할 수 있게 열려 있다. 트리거 함수는 RPC 로 부를
--    이유가 전혀 없고(트리거는 EXECUTE 권한과 무관하게 소유자 권한으로 실행된다),
--    handle_new_user 는 SECURITY DEFINER 라 노출 자체를 남겨둘 이유가 없다(0028·0029 린트).
--
-- 안전성: 트리거 실행에는 EXECUTE 권한이 필요 없다 — 회수해도 기존 트리거는 그대로 돈다.
--         0060 에서 만든 link_pages_guard_count·0059 의 guard_slug_hold 는 이미 이 형태다.

-- ① search_path 고정
alter function public.link_pages_publish_stamp() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.normalize_thumb_state() set search_path = public;
alter function public.merge_creative_tags() set search_path = public;
-- 벡터 검색 RPC — hnsw.ef_search 설정은 유지되고 경로만 더해진다(vector 확장이 public 에 있다)
alter function public.match_creatives(vector, integer, text, text, text) set search_path = public, extensions;

-- ② 트리거 함수의 EXECUTE 회수 — RPC 로 부를 일이 없다
revoke execute on function public.link_pages_publish_stamp() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.normalize_thumb_state() from public, anon, authenticated;
revoke execute on function public.merge_creative_tags() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_dm_content_limit() from public, anon, authenticated;
