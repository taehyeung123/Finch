-- 0094_publish_post_account.sql — 발행 글에 «어느 계정의 글인지» 적기 + 계정을 바꾸면 옛 계정 예약을 새 계정으로 내보내지 않기 (2026-09-12)
--
-- 왜(사장님 2026-09-12): 연결된 인스타 계정을 다른 계정으로 바꾸면(재연결은 connected_accounts 의 같은 행 — user_id+channel —
--   을 제자리에서 고친다) 발행 목록에 옛 계정의 글이 그대로 섞여 보이고, 어느 글이 어느 계정 것인지 알 길이 없었다.
--   더 나쁘게는 A 계정이 연결돼 있을 때 예약한 글이 B 로 바꾼 뒤 **B 계정으로 올라갔다** — 엔진은 발행할 때마다
--   «지금 연결된 계정»의 토큰을 쓰는데, 글에는 대상 계정이 적혀 있지 않았다.
-- 이 파일이 여는 것:
--   ① scheduled_posts.account_platform_id / account_handle — 글의 **대상 계정**(예약·지금 발행을 누른 순간 연결돼 있던 계정의
--      platform_user_id 와 «@아이디»). 발행된 뒤엔 실제로 올린 계정이다. '__previous__' = «지금 계정이 아닌 이전 계정»
--      (옛 발행 글을 지금 토큰으로 읽지 못해 누구 것인지 끝내 못 밝힌 표식 — lib/publish/account-core.ts).
--      발행 엔진은 대상 계정과 지금 연결된 계정이 다르면 **올리지 않고** 실패로 멈춘다(lib/publish/run.ts).
--   ② account_check_after — 옛 발행 글 백필(매분 크론 publish-processing 이 남는 시간에 10건씩)의 다음 확인 시각.
--      null = 아직 안 봄. 일시 오류·연결 없음이면 미뤄 둔다(같은 글이 줄 맨 앞을 계속 차지하지 않게).
--   ③ 이미 준비물을 만든 글은 만든 계정을 안다(container_owner_id, 0093) — 대상 계정으로 옮겨 적는다.
--
-- 권한: 세 칸 모두 **서버 전용**이다. 0093 이 로그인 사용자의 insert·update 를 **칸 단위로** 좁혀 두어서(표 단위 권한을 뺐다)
--   새 칸은 따로 주지 않는 한 쓸 수 없다 — 여기서도 주지 않는다(아래 «적용 확인» ②③). 사용자가 이 칸을 쓸 수 있으면
--   «바꾼 계정으로는 옛 예약을 올리지 않기»를 PostgREST 한 번으로 지울 수 있다.
--   읽기(select)는 표 단위 권한이라 새 칸도 읽힌다 — 발행 목록이 세션(RLS, 본인 행)으로 읽는다. 자기 계정 이름이라 숨길 것이 없다.
-- 가드 트리거(scheduled_posts_guard, 0093): **고치지 않는다.** 로그인 사용자는 이 칸을 쓸 권한 자체가 없고(권한 검사가 트리거보다 먼저 막는다),
--   서버(service_role)·SQL 편집기(postgres)·정의자 함수(create_publish_post)는 트리거가 처음부터 통과시킨다.
--   로그인 사용자의 insert(스튜디오 카드뉴스 — user_id·caption·image_urls·scheduled_at·status)와 update(예약 전환·취소 —
--   scheduled_at·status·error)는 이 세 칸을 건드리지 않으므로 그대로 된다. 새 칸은 null 로 들어가고 서버가 뒤따라 적는다.
--
-- ⚠️ 적용 순서: 0093 다음, **코드보다 먼저.** 새 코드는 목록·엔진 조회에 이 칸을 넣는다 — 적용 전에 코드가 나가면
--    /publish 가 «불러오지 못했어요»를 띄우고 발행 선점이 전부 실패한다(예약 글이 안 나간다).
--    적용 뒤 옛 코드가 잠깐 돌아도 깨지지 않는다 — 옛 코드는 새 칸을 모르고, 그 사이 나간 글은 백필이 채운다.
-- ⚠️ 되돌릴 때(이전 배포로 Instant Rollback): 칸은 지우지 않는다. 옛 코드는 새 칸을 안 읽고, 다시 올리면 그대로 이어 쓴다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(if not exists · 비어 있는 칸만 채우는 update).

-- ────────────────────────────────────────────────────────────────
-- ① 칸
-- ────────────────────────────────────────────────────────────────
alter table public.scheduled_posts
  add column if not exists account_platform_id text,
  add column if not exists account_handle      text,
  add column if not exists account_check_after timestamptz;

comment on column public.scheduled_posts.account_platform_id is
  '글의 대상 계정(0094) — 예약·지금 발행을 누른 순간 그 채널에 연결돼 있던 connected_accounts.platform_user_id. 발행된 뒤엔 실제로 올린 계정. ''__previous__'' = 누구 것인지 못 밝힌 이전 계정. null = 옛 글·초안(발행 때 지금 계정으로 정해진다). 엔진은 이 값과 지금 연결된 계정이 다르면 올리지 않는다. 서버만 쓴다.';
comment on column public.scheduled_posts.account_handle is
  '대상 계정의 «@아이디»(0094) — 목록 표시용. 적을 때의 이름이라 그 뒤 바꾼 이름과 다를 수 있다(같은 계정이면 화면은 지금 이름을 쓴다). 서버만 쓴다.';
comment on column public.scheduled_posts.account_check_after is
  '옛 발행 글 계정 백필의 다음 확인 시각(0094, app/api/cron/publish-processing). null = 아직 안 봄. 서버만 쓴다.';

-- 백필 줄 — 매분 크론이 «아직 계정을 모르는 발행 글»을 확인 시각 순으로 10건씩 집는다
create index if not exists scheduled_posts_account_backfill_idx
  on public.scheduled_posts (account_check_after nulls first)
  where status = 'published' and account_platform_id is null and ig_media_id is not null;

-- ────────────────────────────────────────────────────────────────
-- ② 이미 아는 것 옮겨 적기 — 준비물을 만든 계정(container_owner_id, 0093)이 곧 그 글의 계정이다.
--    이름은 그 계정이 지금도 연결돼 있을 때만 붙인다(아니면 null — 화면은 «이전 계정»으로 보인다).
--    비어 있는 칸만 채운다(재실행 안전). 이 update 는 postgres 로 돌아 가드 트리거를 통과하고, 바꾸는 칸이 새 칸뿐이라
--    기존 CHECK(모양·개수·처리 중)는 그대로 통과한다.
-- ────────────────────────────────────────────────────────────────
update public.scheduled_posts p
   set account_platform_id = p.container_owner_id,
       account_handle = (
         select c.handle
           from public.connected_accounts c
          where c.user_id = p.user_id
            and c.channel = p.channel
            and c.platform_user_id = p.container_owner_id
          limit 1
       )
 where p.account_platform_id is null
   and p.container_owner_id is not null;

-- ────────────────────────────────────────────────────────────────
-- 적용 확인
--   ① 새 칸 세 개(account_check_after · account_handle · account_platform_id)가 보여야 한다
--   ② authenticated 의 scheduled_posts 쓰기 칸 — 0093 과 **같아야** 한다:
--      INSERT 6개(channel, caption, image_urls, scheduled_at, status, user_id) · UPDATE 5개(caption, error, image_urls, scheduled_at, status).
--      account_ 로 시작하는 칸이 보이면 안 된다.
--   ③ 0행이어야 한다 — 로그인 사용자·익명이 새 칸을 쓸 수 있는가
--   ④ 참고 — 대상 계정이 적힌 글 수 · 백필을 기다리는 옛 발행 글 수(백필은 배포 뒤 매분 10건씩 줄어든다)
-- ────────────────────────────────────────────────────────────────
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'scheduled_posts'
   and column_name in ('account_platform_id', 'account_handle', 'account_check_after')
 order by column_name;

select privilege_type, string_agg(column_name, ', ' order by column_name) as columns
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'scheduled_posts' and grantee = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE')
 group by privilege_type;

select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'scheduled_posts'
   and column_name in ('account_platform_id', 'account_handle', 'account_check_after')
   and grantee in ('anon', 'authenticated')
   and privilege_type in ('INSERT', 'UPDATE');

select count(*) filter (where account_platform_id is not null) as stamped,
       count(*) filter (where status = 'published' and account_platform_id is null and ig_media_id is not null) as backfill_waiting
  from public.scheduled_posts;
