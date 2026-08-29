-- 0072_page_reports_rate_index.sql — 신고 상한 조회용 인덱스 (2026-08-29 쏘넷 보안 점검)
--
-- 접수 상한을 인스턴스 메모리 카운터가 아니라 **DB 실측**으로 바꿨다
-- (JS 카운터는 인스턴스마다 따로 살아 요청을 흩뿌리면 상한이 사라진다).
-- 접수 한 건마다 아래 두 가지를 센다:
--   ① 최근 10분 전체 건수      → created_at 만 훑는다
--   ② 같은 slug 의 최근 24시간 → (slug, created_at) 복합
-- 지금은 행이 적어 순차 스캔으로도 즉시 끝나지만, 신고가 쌓인 뒤에도
-- 접수 경로가 느려지지 않도록 미리 깔아 둔다. (읽기 정책은 그대로 없다 —
-- 인덱스는 service_role 조회에만 쓰인다.)

create index if not exists page_reports_created_at_idx on public.page_reports (created_at desc);
create index if not exists page_reports_slug_created_at_idx on public.page_reports (slug, created_at desc);
