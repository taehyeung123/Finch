-- 0087_retention_webhook_events_and_leads.sql — 방침이 약속한 파기를 실제로 가능하게 만든다
--
-- 종합 보안 감사(2026-09-07) Medium ×2. 둘 다 «코드에 없는 약속»이다 —
-- 개인정보처리방침이 확언한 파기·삭제 경로가 저장소에 한 줄도 없었다.
--
-- ────────────────────────────────────────────────────────────────
-- ① webhook_events — 탈퇴해도 한 행도 안 지워진다
-- ────────────────────────────────────────────────────────────────
-- 방침 5-③(lib/legal/documents.ts): «웹훅 이벤트 … 회원 탈퇴 시까지 보관하며, 탈퇴와 동시에 파기합니다.»
-- 그런데 0002 의 webhook_events 에는 **user_id 도 FK 도 없다.** 탈퇴 cascade 가 닿을 고리가 없어
-- 한 행도 안 지워진다 — 방침 위반이자 허위 고지다.
-- 남는 것: 탈퇴한 회원의 인스타 활동 이력(원문 media_id·comment_id)과 **제3자(댓글 작성자)** 의 식별 해시.
-- media_id 는 인스타에서 그대로 조회되는 원문 식별자라 «누구의 게시물인지»가 탈퇴 뒤에도 복원된다.
-- 게다가 이 표는 읽는 코드가 한 줄도 없다(insert 1곳뿐) — 무한히 쌓이기만 한다(0002:60 의 미이행 TODO).
--
-- ⚠️ 순서: user_id 를 넣고 → 되찾을 수 있는 주인을 backfill 하고 → 못 찾은 행은 파기한다.
--    주인을 모르면 탈퇴로도 못 지우므로 남겨 둘 이유가 없다.

alter table public.webhook_events
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 주인 되찾기 — 이 media_id 에 규칙을 걸어 둔 사용자가 그 게시물의 주인이다.
-- 같은 media_id 에 여러 사용자가 규칙을 걸 수는 없다(게시물은 한 계정에 속한다).
update public.webhook_events e
   set user_id = r.user_id
  from (
    select distinct on (post_id) post_id, user_id
      from public.auto_dm_rules
     where post_id is not null
     order by post_id, created_at asc
  ) r
 where e.user_id is null
   and e.media_id = r.post_id;

-- 주인을 못 찾은 행은 파기한다(탈퇴로도 못 지우는 데이터를 남기지 않는다)
delete from public.webhook_events where user_id is null;

create index if not exists webhook_events_user_time_idx
  on public.webhook_events (user_id, received_at desc);

-- 보존기간을 코드가 아니라 표에 적어 둔다 — 정리는 /api/cron/retention 이 매일 돈다.
comment on table public.webhook_events is
  '자동 DM 웹훅 수신 로그. user_id 로 탈퇴 cascade 가 닿는다(0087). 보존 90일 — 그 뒤 /api/cron/retention 이 파기한다.';

-- ────────────────────────────────────────────────────────────────
-- ② link_leads — 방문자 리드에 삭제 경로가 아예 없다
-- ────────────────────────────────────────────────────────────────
-- 0048 은 «own link leads read» SELECT 정책 **하나만** 만들었다. INSERT 를 안 준 것은 의도적이지만
-- (서버가 service_role 로 넣는다) DELETE 도 함께 빠졌다. 그래서 방문자(우리와 아무 계약이 없는 제3자)의
-- 이름·이메일·전화·문의 내용을 **주인도, 우리도, 본인도** 개별로 지울 수 없었다.
-- 방침 9 는 «열람·정정·삭제·처리정지를 요청할 수 있으며 … 지체 없이 조치합니다» 라고 약속한다.
-- 페이지당 시간당 30건까지 받으므로 오래 운영한 페이지에는 수만 건이 쌓이고 그 전체가 CSV 로 나간다.
drop policy if exists "own link leads delete" on public.link_leads;
create policy "own link leads delete" on public.link_leads for delete to authenticated
  using (
    exists (
      select 1 from public.link_pages p
      where p.id = link_leads.page_id
        and p.user_id = (select auth.uid())
    )
  );
grant delete on public.link_leads to authenticated;

comment on table public.link_leads is
  '프로필 링크 문의·구독 수집. 주인은 개별 삭제 가능(0087). 보존 24개월 — 그 뒤 /api/cron/retention 이 파기한다.';

-- ────────────────────────────────────────────────────────────────
-- 적용 확인
--   ① 0행이어야 한다 — 주인 없는 웹훅 로그
--   ② 정책 1행 — link_leads DELETE
-- ────────────────────────────────────────────────────────────────
select count(*) as "주인 없는 웹훅 로그(0 기대)" from public.webhook_events where user_id is null;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'link_leads'
order by policyname;
