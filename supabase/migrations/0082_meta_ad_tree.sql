-- 0082_meta_ad_tree.sql — 광고 세트·소재·광고 단계 준비 (2026-09-03, docs/ADS_STAGE2_SPEC.md §6·§13)
--
-- 하는 일 셋:
--  ① meta_ad_write_log.action 확장 — 0081 은 캠페인 4동작(create/status/budget/name)만 받는다.
--     광고 세트→소재→광고 체인(create_ad)·하위 상태(status_adset/status_ad)·게재 시작 체인(activate_tree)·
--     이미지 업로드(upload_image)를 기록할 자리. 0082 전에 이 action 으로 insert 하면 check 위반(23514)이고,
--     코드는 그것을 «준비 중»(not_ready)으로 사용자에게 말한다 — 광고 세트·광고는 «게재될 것»이라 로그 없이 만들지 않는다.
--  ② 잠금 해제 권한을 **워크스페이스 소유자**에게도 — 0081 은 «본인이 만든 pending 만» 지우고 확정할 수 있어,
--     editor 팀원의 체인이 죽어 pending 이 남으면 소유자가 자기 캠페인을 핀치에서 못 끄는 길이 있었다(설계 검토 blocker).
--     (코드 쪽도 함께 고쳤다: 일시중지는 예약을 아예 거치지 않는다 — lib/ads/write-gates.ts recordWrite.)
--  ③ meta_ad_accounts 에 광고 게시 주체(페이지·IG 계정)와 최소 예산 캐시 컬럼. 토큰은 절대 넣지 않는다(페이지 토큰 포함).
--
-- ⚠️ ① 의 제약 이름: 0081 이 이름 없이 `check (action in …)` 로 만들었으므로 Postgres 자동 이름
--    (meta_ad_write_log_action_check)이다. 적용 전 대시보드에서 실제 이름을 한 번 확인한다 —
--    다르면 아래 drop 이 아무것도 안 지우고 add 가 «이미 있음»으로 실패한다(0077:132-136 과 같은 패턴).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- ── ① action 확장 + 하위 객체 id 컬럼 ────────────────────────────────
alter table public.meta_ad_write_log drop constraint if exists meta_ad_write_log_action_check;
alter table public.meta_ad_write_log add constraint meta_ad_write_log_action_check
  check (action in (
    'create', 'status', 'budget', 'name',
    'create_ad',      -- 광고 세트→소재→광고 체인(한 행, request.steps 에 진행 상황)
    'status_adset',   -- 광고 세트 ACTIVE/PAUSED
    'status_ad',      -- 광고 ACTIVE/PAUSED
    'activate_tree',  -- 게재 시작: 핀치가 만든 하위 켜기 + 캠페인 ACTIVE(한 행)
    'upload_image'    -- 이미지 업로드(예약 없음 — 5분 8회 창 계산용)
  ));

alter table public.meta_ad_write_log
  add column if not exists adset_id text,
  add column if not exists ad_id    text;

-- result 에 'unverified' — «전송 실패 + 재확인 실패». Meta 가 적용했을 수도 있는 쓰기를 failed 로 확정하면
-- 감사 로그가 거짓이 된다(슬라이스 0 소넷 점검). pending 부분 유니크(잠금)와는 무관한 값이다.
-- ⚠️ 제약 이름도 0081 자동 명명(meta_ad_write_log_result_check) — 위 action 과 같이 대시보드에서 확인.
alter table public.meta_ad_write_log drop constraint if exists meta_ad_write_log_result_check;
alter table public.meta_ad_write_log add constraint meta_ad_write_log_result_check
  check (result in ('pending', 'ok', 'failed', 'unverified'));

-- ── ② 소유자도 고아 잠금을 풀고 확정할 수 있게 ────────────────────────
-- update = 본인이 만든 pending 행 **또는** 소유자(user_id)의 워크스페이스 pending 행.
drop policy if exists "ad write log settle" on public.meta_ad_write_log;
create policy "ad write log settle" on public.meta_ad_write_log for update to public
  using (
    result = 'pending'
    and ((select auth.uid()) = actor_user_id or (select auth.uid()) = user_id)
  )
  with check ((select auth.uid()) = actor_user_id or (select auth.uid()) = user_id);

-- delete = 60초 지난 pending 을 본인 **또는** 소유자가 지운다. 확정 기록(ok/failed)은 여전히 못 지운다.
drop policy if exists "ad write log unlock" on public.meta_ad_write_log;
create policy "ad write log unlock" on public.meta_ad_write_log for delete to public
  using (
    result = 'pending'
    and created_at < now() - interval '60 seconds'
    and ((select auth.uid()) = actor_user_id or (select auth.uid()) = user_id)
  );

-- ── ③ 광고 계정별 게시 주체 + 최소 예산 캐시 ───────────────────────────
-- 쓰기는 0077 RLS 그대로 소유자만(editor 는 못 바꾼다 — 코드가 page_owner_only 로 안내), 읽기는 팀 전원.
alter table public.meta_ad_accounts
  add column if not exists ad_page_id      text,   -- 소재 object_story_spec.page_id
  add column if not exists ad_page_name    text,
  add column if not exists ad_ig_user_id   text,   -- 소재 object_story_spec.instagram_user_id (instagram_actor_id 는 폐기)
  add column if not exists ad_ig_username  text,
  add column if not exists min_daily_budget_imp         integer,  -- /act_{id}/minimum_budgets (최소 단위, 단위는 첫 호출로 확인 — 스펙 §11-26)
  add column if not exists min_daily_budget_high_freq   integer,
  add column if not exists min_daily_budget_video_views integer,
  add column if not exists min_daily_budget_low_freq    integer,
  add column if not exists min_budget_fetched_at        timestamptz;

comment on column public.meta_ad_write_log.adset_id is '2단계 — 이 쓰기가 만들거나 바꾼 광고 세트 id(create_ad·status_adset·activate_tree)';
comment on column public.meta_ad_write_log.ad_id    is '2단계 — 이 쓰기가 만들거나 바꾼 광고 id(create_ad·status_ad·activate_tree)';
comment on column public.meta_ad_accounts.ad_page_id is '광고 게시 주체 Facebook 페이지. 페이지 토큰은 절대 저장하지 않는다.';
