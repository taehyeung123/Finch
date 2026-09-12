-- 0093_publish_media.sql — 발행: 사진·영상 섞은 게시물 + 직접 업로드 + «처리 중» 상태 + 두 번 올리지 않기 (2026-09-11)
--
-- 왜: 영상은 메타가 막은 게 아니라 핀치가 사진 전용으로 만들어져서 안 됐다(docs/PUBLISH_VIDEO_PLAN.md).
--   · 표에 image_urls text[] 뿐이라 항목 종류·커버·메타 준비물(container) id 를 적을 칸이 없었고
--   · 상태에 «처리 중»이 없어 영상(메타가 몇 분씩 처리)을 요청 하나 안에서 기다리다 실패했으며
--   · 사진은 서버 액션 본문(base64)으로 실려 Vercel 4.5MB 에 묶였다(합계 3MB).
-- 이 파일이 여는 것:
--   ① scheduled_posts: status 'processing' + 미디어·게시 면·엔진 칸(서버 전용) + 모양·개수 체크
--   ② 로그인 사용자 권한을 칸 단위로 좁히고(0085 수법), 상태 전이 가드 트리거를 INSERT·UPDATE·DELETE 에 건다
--   ③ publish_uploads(업로드 원장, 서버 전용) + 업로드 발급·게시물 생성·전송 예산·예약 집기 함수(service_role 전용)
--   ④ publish-media 버킷(비공개, 300MB, MP4·MOV·JPEG) + 공개 버킷 세 개에 크기·형식 상한
--
-- ⚠️ 적용 순서: **이 마이그레이션을 먼저 적용하고 코드를 배포한다.** 반대로 하면 /publish 가 «불러오지 못했어요»를 띄우고
--    새 저장이 전부 실패한다(코드가 새 칸·함수를 전제로 한다). 적용 뒤 옛 코드가 잠깐 돌아도 깨지지 않는다 —
--    옛 컴포저·스튜디오의 insert(image_urls·draft/scheduled)와 옛 발행 경로는 새 체크·가드를 그대로 통과한다
--    (단, 옛 코드의 «연결 해제 시 예약 글 실패 처리»는 세션 쓰기라 가드에 막힌다 — 해제 자체는 된다).
-- ⚠️ 적용 뒤 대시보드 Storage → Settings 의 **전역 파일 크기 상한(Global file size limit)을 300MB 이상**으로 올린다.
--    버킷 상한은 전역 상한을 넘지 못한다(낮은 쪽이 이긴다). ④의 공개 버킷 상한을 **먼저** 건 뒤에 올린다 —
--    순서가 바뀌면 그 사이 로그인 사용자 누구나 cardnews·brand-logos 에 300MB 파일을 공개로 올릴 수 있다.
-- ⚠️ 롤백(Instant Rollback)은 크론을 되돌리지 않는다 — 이전 배포로 되돌리면 /api/cron/publish-processing 이 404 가 되고
--    processing 행이 굳는다. 되돌릴 땐 맨 아래 «롤백 때» SQL 을 함께 실행한다.
-- ⚠️ publish_media_shape_ok·publish_media_count_ok 를 나중에 **제자리에서 조이지 말 것.** CHECK 는 행을 고칠 때마다 다시 돈다 —
--    규칙을 조이면 옛 행의 발행 기록(published)·파일 정리(media_purged_at) 쓰기가 체크에 걸려 행이 publishing 으로 굳는다.
--    바꿀 땐 새 이름의 함수 + 옛 행 정리(backfill) 후 제약을 갈아 끼운다.
-- ⚠️ scheduled_posts_guard 는 **security invoker** 여야 한다. definer 로 바꾸면 current_user 가 소유자가 되어 가드가 조용히 꺼진다.
-- ⚠️ 체크 함수 두 개는 authenticated 에게 EXECUTE 가 있어야 한다 — CHECK 는 넣는 역할의 권한으로 돈다(스튜디오 insert 가 authenticated).
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(if not exists / drop if exists / create or replace — 새 이름만).

-- ────────────────────────────────────────────────────────────────
-- ① scheduled_posts — 상태·칸
-- ────────────────────────────────────────────────────────────────
alter table public.scheduled_posts drop constraint if exists scheduled_posts_status_check;
alter table public.scheduled_posts add constraint scheduled_posts_status_check
  check (status in ('draft', 'scheduled', 'publishing', 'processing', 'published', 'failed', 'canceled'));

alter table public.scheduled_posts
  add column if not exists media                  jsonb,
  add column if not exists ig_surface             text,
  add column if not exists share_to_feed          boolean not null default true,
  add column if not exists permalink              text,
  add column if not exists published_at           timestamptz,
  add column if not exists error_code             text,
  add column if not exists container_id           text,
  add column if not exists child_container_ids    text[],
  add column if not exists container_created_at   timestamptz,
  add column if not exists container_owner_id     text,
  add column if not exists processing_deadline    timestamptz,
  add column if not exists next_check_at          timestamptz,
  add column if not exists publish_after          timestamptz,
  add column if not exists publish_attempted_at   timestamptz,
  add column if not exists publish_calls          smallint not null default 0,
  add column if not exists claimed_at             timestamptz,
  add column if not exists prepare_attempted_at   timestamptz,
  add column if not exists container_window_at    timestamptz,
  add column if not exists container_window_count smallint not null default 0,
  add column if not exists media_purged_at        timestamptz;

alter table public.scheduled_posts drop constraint if exists scheduled_posts_ig_surface_check;
alter table public.scheduled_posts add constraint scheduled_posts_ig_surface_check
  check (ig_surface is null or ig_surface in ('feed', 'reels', 'story'));
alter table public.scheduled_posts drop constraint if exists scheduled_posts_publish_calls_check;
alter table public.scheduled_posts add constraint scheduled_posts_publish_calls_check
  check (publish_calls between 0 and 5 and container_window_count between 0 and 20);

comment on column public.scheduled_posts.media is
  '사진·영상 항목(0093) — [{kind:image|video, path:<uid>/<uuid>.jpg|mp4|mov, cover_path, thumb_offset_ms, duration_ms, width, height, bytes}]. publish-media 버킷(비공개) 경로. null 이면 옛 image_urls(cardnews 공개 URL) 또는 글 전용. 서버(create_publish_post)만 쓴다.';
comment on column public.scheduled_posts.ig_surface is '인스타 게시 면(feed·reels·story). 스레드·옛 행은 null. 서버만 쓴다.';
comment on column public.scheduled_posts.published_at is '실제로 올라간 시각. 「지금 발행」은 scheduled_at 을 덮어쓰지 않는다(목록은 이 값을 쓴다).';
comment on column public.scheduled_posts.publish_attempted_at is
  '발행 호출 직전에 적는다 — 이 값이 있는 행은 다시 부르기 전에 «이미 올라갔나»부터 본다(두 번 올리지 않기, lib/publish/engine-core.ts).';
comment on column public.scheduled_posts.publish_after is '이 시각 전엔 발행하지 않는다 — 예약은 예약 시각, 「지금 발행」은 누른 시각. 서버만 쓴다.';
comment on column public.scheduled_posts.next_check_at is 'processing 행을 매분 크론이 다시 볼 시각. 서버만 쓴다(사용자가 쓰면 줄 맨 앞을 차지할 수 있다).';
comment on column public.scheduled_posts.media_purged_at is '보관 기간이 지나 영상 원본을 지운 시각(publish-media-sweep). 이후 다시 예약·발행 불가.';

-- 옛 발행분의 실제 발행 시각 — 예전 「지금 발행」은 성공 시각을 scheduled_at 에 적었다(그대로 옮긴다)
update public.scheduled_posts set published_at = scheduled_at where status = 'published' and published_at is null;

-- ────────────────────────────────────────────────────────────────
-- ② 모양·개수 체크 — lib/publish-rules.ts·lib/publish/media-core.ts 와 같은 규칙
-- ────────────────────────────────────────────────────────────────
-- ⚠️ SQL 의 AND 는 평가 순서를 보장하지 않는다 — 배열이 아닌 값에 jsonb_array_elements 가 돌면 «체크 위반»이 아니라
--    오류가 난다. 그래서 CASE 로 순서를 못박는다. regex·비교가 null 이면 체크가 통과로 읽으므로 coalesce(…, false) 로 닫는다.
create or replace function public.publish_media_shape_ok(p_user_id uuid, p_media jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_media is null then true
    when jsonb_typeof(p_media) <> 'array' then false
    when jsonb_array_length(p_media) not between 1 and 20 then false
    else
      not exists (
        select 1
          from jsonb_array_elements(p_media) as e(item)
         where not coalesce(
           case
             when jsonb_typeof(item) <> 'object' then false
             when coalesce(item ->> 'kind', '') not in ('image', 'video') then false
             when not coalesce(item ->> 'path', '') ~ (
               '^' || p_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'
               || case when item ->> 'kind' = 'video' then '(mp4|mov)' else 'jpg' end || '$'
             ) then false
             when coalesce(jsonb_typeof(item -> 'cover_path'), 'null') <> 'null'
                  and not (item ->> 'kind' = 'video'
                           and coalesce(item ->> 'cover_path', '') ~ (
                             '^' || p_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'))
               then false
             when coalesce(jsonb_typeof(item -> 'thumb_offset_ms'), 'null') <> 'null'
                  and not (item ->> 'kind' = 'video'
                           and case when jsonb_typeof(item -> 'thumb_offset_ms') = 'number'
                                    then (item ->> 'thumb_offset_ms')::numeric between 0 and 900000
                                    else false end)
               then false
             else true
           end, false)
      )
      and (select count(distinct item ->> 'path') from jsonb_array_elements(p_media) as e(item)) = jsonb_array_length(p_media)
  end;
$$;

create or replace function public.publish_media_count_ok(p_channel text, p_surface text, p_media jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case
    -- 미디어 없는 글(옛 행·스레드 글 전용)은 면이 없다
    when p_media is null then p_surface is null
    when jsonb_typeof(p_media) <> 'array' then false
    when p_channel = 'instagram' then
      case p_surface
        when 'story' then jsonb_array_length(p_media) = 1
        when 'reels' then jsonb_array_length(p_media) = 1 and p_media -> 0 ->> 'kind' = 'video'
        when 'feed'  then jsonb_array_length(p_media) between 2 and 10
                          or (jsonb_array_length(p_media) = 1 and p_media -> 0 ->> 'kind' = 'image')
        else false
      end
    when p_channel = 'threads' then p_surface is null and jsonb_array_length(p_media) between 1 and 20
    else false
  end, false);
$$;

revoke execute on function public.publish_media_shape_ok(uuid, jsonb) from public, anon;
revoke execute on function public.publish_media_count_ok(text, text, jsonb) from public, anon;
grant execute on function public.publish_media_shape_ok(uuid, jsonb) to authenticated, service_role;
grant execute on function public.publish_media_count_ok(text, text, jsonb) to authenticated, service_role;

-- 0074 의 image_urls 체크를 갈아 끼운다(이름으로만 지운다 — 0074 머리말의 «빗자루 금지»).
-- 새 미디어 글은 image_urls 가 비어 있어야 한다(두 목록이 섞이면 무엇을 올릴지 모호하다).
alter table public.scheduled_posts drop constraint if exists scheduled_posts_image_urls_check;
alter table public.scheduled_posts add constraint scheduled_posts_image_urls_check check (
  case
    when media is not null then coalesce(array_length(image_urls, 1), 0) = 0
    else case channel
      when 'instagram' then coalesce(array_length(image_urls, 1), 0) between 1 and 10
      when 'threads'   then coalesce(array_length(image_urls, 1), 0) between 0 and 20
      else true
    end
  end
);
alter table public.scheduled_posts drop constraint if exists scheduled_posts_media_shape_check;
alter table public.scheduled_posts add constraint scheduled_posts_media_shape_check
  check (public.publish_media_shape_ok(user_id, media));
alter table public.scheduled_posts drop constraint if exists scheduled_posts_media_count_check;
alter table public.scheduled_posts add constraint scheduled_posts_media_count_check
  check (public.publish_media_count_ok(channel, ig_surface, media));
-- processing 행은 반드시 다음 확인 시각과 마감이 있다 — 없으면 매분 크론이 영영 안 집는다
alter table public.scheduled_posts drop constraint if exists scheduled_posts_processing_check;
alter table public.scheduled_posts add constraint scheduled_posts_processing_check
  check (status <> 'processing' or (next_check_at is not null and processing_deadline is not null));

create index if not exists scheduled_posts_processing_idx
  on public.scheduled_posts (next_check_at) where status = 'processing';
-- 파일 정리 크론의 «이 경로를 아직 참조하는 글이 있나» 대조(@>)
create index if not exists scheduled_posts_media_gin
  on public.scheduled_posts using gin (media jsonb_path_ops) where media is not null;

-- ────────────────────────────────────────────────────────────────
-- ③ 로그인 사용자 권한 — 칸 단위로 좁힌다(0085 수법)
-- ────────────────────────────────────────────────────────────────
-- 0064 "own scheduled posts" 는 행 단위라 주인이 **모든 칸**을 PostgREST 로 바꿀 수 있었다. 엔진은 container_id·
-- publish_attempted_at·next_check_at·media 를 믿는다 — 사용자가 쓰면 ① 남의 URL 을 메타에 넘기고 ② 두 번 올리기 가드를 지우고
-- ③ next_check_at 을 1970 으로 적어 매분 크론 줄 맨 앞을 독차지할 수 있다. 쓰기 칸은 지금 화면이 실제로 쓰는 것만 남긴다:
--   insert — 옛 컴포저·스튜디오 카드뉴스(user_id, caption, image_urls, scheduled_at, status, channel)
--   update — 예약 전환·취소(scheduled_at, status, error). caption·image_urls 는 초안 수정(S5)용으로 남기되 가드가 얼린다.
-- 새 미디어 글은 create_publish_post(service_role)로만 만든다.
revoke insert, update on public.scheduled_posts from anon, authenticated;
revoke delete, truncate, references, trigger on public.scheduled_posts from anon;
revoke truncate, references, trigger on public.scheduled_posts from authenticated;
grant insert (user_id, caption, image_urls, scheduled_at, status, channel) on public.scheduled_posts to authenticated;
grant update (caption, image_urls, scheduled_at, status, error) on public.scheduled_posts to authenticated;

-- ── 상태 전이 가드 — INSERT·UPDATE·DELETE 셋 다(CLAUDE.md «INSERT 를 보는 가드는 UPDATE 도») ──
create or replace function public.scheduled_posts_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
  v_growing boolean := false;
begin
  -- 서버(service_role)·SQL 편집기(postgres)·정의자 함수(create_publish_post)는 통과. 로그인 사용자·익명만 본다.
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status not in ('draft', 'failed', 'canceled') then
      raise exception 'post_delete_denied' using errcode = 'check_violation',
        hint = '초안·실패·취소된 글만 지울 수 있어요.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'scheduled') then
      raise exception 'post_status_denied' using errcode = 'check_violation',
        hint = '새 글은 초안이나 예약으로만 만들 수 있어요.';
    end if;
    if new.status = 'scheduled' and new.scheduled_at < now() - interval '5 minutes' then
      raise exception 'schedule_in_past' using errcode = 'check_violation', hint = '지난 시각으로는 예약할 수 없어요.';
    end if;
    v_growing := true;
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'post_owner_frozen' using errcode = 'check_violation';
    end if;
    if new.status is distinct from old.status then
      if not (
           (old.status = 'draft'      and new.status = 'scheduled')
        or (old.status = 'failed'     and new.status = 'scheduled' and old.media_purged_at is null)
        or (old.status = 'scheduled'  and new.status = 'canceled')
        -- 처리 중 취소는 발행을 **시도하기 전**에만 — 시도한 뒤엔 이미 올라갔을 수 있다
        or (old.status = 'processing' and new.status = 'canceled' and old.publish_attempted_at is null)
      ) then
        raise exception 'post_status_denied' using errcode = 'check_violation',
          hint = format('%s → %s 는 서버만 바꿀 수 있어요.', old.status, new.status);
      end if;
      v_growing := old.status not in ('draft', 'scheduled', 'processing', 'publishing')
               and new.status in ('draft', 'scheduled', 'processing', 'publishing');
    end if;
    -- 메타에 넘어갔거나 넘어가는 중인 글의 내용은 얼린다 — 올라간 글과 저장된 글이 달라진다
    if (old.status in ('publishing', 'processing', 'published', 'canceled')
        or old.container_id is not null or old.child_container_ids is not null)
       and (new.caption is distinct from old.caption or new.image_urls is distinct from old.image_urls) then
      raise exception 'post_frozen' using errcode = 'check_violation', hint = '이미 발행 준비를 시작한 글은 고칠 수 없어요.';
    end if;
    if old.status in ('publishing', 'processing', 'published', 'canceled')
       and new.scheduled_at is distinct from old.scheduled_at then
      raise exception 'post_frozen' using errcode = 'check_violation', hint = '이미 발행 준비를 시작한 글은 고칠 수 없어요.';
    end if;
    if new.status = 'scheduled'
       and (old.status is distinct from 'scheduled' or new.scheduled_at is distinct from old.scheduled_at)
       and new.scheduled_at < now() - interval '5 minutes' then
      raise exception 'schedule_in_past' using errcode = 'check_violation', hint = '지난 시각으로는 예약할 수 없어요.';
    end if;
  end if;

  -- 미발행 보관 상한 60 — 늘어나는 전이에서만(새 글, 실패 → 예약). INSERT 에만 걸면 실패 글을 되살려 우회된다.
  if v_growing then
    perform pg_advisory_xact_lock(hashtextextended('scheduled_posts_cap:' || new.user_id::text, 0));
    select count(*) into v_count
      from public.scheduled_posts
     where user_id = new.user_id
       and status in ('draft', 'scheduled', 'processing', 'publishing')
       and id is distinct from new.id;
    if v_count >= 60 then
      raise exception 'too_many_unpublished' using errcode = 'check_violation',
        hint = '저장해 둔 초안과 예약이 너무 많아요(최대 60개).';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.scheduled_posts_guard() from public, anon, authenticated;

drop trigger if exists trg_scheduled_posts_guard on public.scheduled_posts;
create trigger trg_scheduled_posts_guard
  before insert or update or delete on public.scheduled_posts
  for each row execute function public.scheduled_posts_guard();

-- ────────────────────────────────────────────────────────────────
-- ④ 업로드 원장 — 서버 전용(정책 없음)
-- ────────────────────────────────────────────────────────────────
-- 브라우저가 서명 업로드 URL 로 Storage 에 직접 올린다. 경로는 서버가 정하고 여기 적는다 — 이 표에 없는 경로로는
-- 토큰이 발급되지 않는다. 게시물에 붙으면 post_id 가 채워지고, 게시물이 지워지면 null 로 돌아가 정리 크론이 치운다.
create table if not exists public.publish_uploads (
  path            text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('image', 'video', 'cover')),
  mime            text not null check (mime in ('image/jpeg', 'video/mp4', 'video/quicktime')),
  declared_bytes  bigint not null check (declared_bytes > 0 and declared_bytes <= 314572800),
  actual_bytes    bigint check (actual_bytes is null or actual_bytes > 0),
  finalized_at    timestamptz,
  post_id         uuid references public.scheduled_posts (id) on delete set null,
  purged_at       timestamptz,
  created_at      timestamptz not null default now(),
  constraint publish_uploads_path_shape check (
    path ~ ('^' || user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|mp4|mov)$')
  ),
  constraint publish_uploads_kind_ext check ((kind = 'video') = (path ~ '\.(mp4|mov)$'))
);
comment on table public.publish_uploads is
  '발행 업로드 원장(0093). 서명 업로드 URL 은 여기 적힌 경로로만 발급한다. purged_at = 객체를 지웠다(지운 뒤에도 토큰 수명 2시간 동안 행을 남겨 두고 정리 크론이 한 번 더 지운다). service_role 만 접근.';
alter table public.publish_uploads enable row level security;
revoke all on table public.publish_uploads from anon, authenticated;
create index if not exists publish_uploads_user_created_idx on public.publish_uploads (user_id, created_at desc);
create index if not exists publish_uploads_unattached_idx on public.publish_uploads (created_at) where post_id is null;
create index if not exists publish_uploads_post_idx on public.publish_uploads (post_id) where post_id is not null;

-- 하루 전송 예산(메타가 준비물을 만들 때마다 파일을 받아 간다 — Supabase 전송량 과금)
create table if not exists public.publish_fetch_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  bytes   bigint not null default 0 check (bytes >= 0),
  primary key (user_id, day)
);
comment on table public.publish_fetch_usage is '발행 파일 전송량(KST 하루) — publish_consume_fetch_bytes 만 쓴다. service_role 만 접근(0093).';
alter table public.publish_fetch_usage enable row level security;
revoke all on table public.publish_fetch_usage from anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- ⑤ 함수 — 전부 service_role 전용, search_path 비움
-- ────────────────────────────────────────────────────────────────
-- 상한 숫자(사장님이 정할 사업 숫자 — 여기에만 있다): 사용자당 보관 5GiB · 서비스 전체 50GiB · 확인 전 업로드 동시 30 ·
-- 24시간 발급 60 · 미발행 글 60(가드와 같은 값) · 하루 전송 4GiB.

-- 업로드 자리 발급 — 상한을 보고 원장에 적는다(토큰은 이 행이 생긴 뒤에만 서버가 만든다)
create or replace function public.claim_publish_uploads(p_user_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_pending   constant int    := 30;
  c_max_daily     constant int    := 60;
  c_user_cap      constant bigint := 5368709120;   -- 5 GiB
  c_service_cap   constant bigint := 53687091200;  -- 50 GiB
  c_video_reserve constant bigint := 314572800;    -- 확인 전 영상은 버킷 상한만큼 잡는다(토큰은 크기를 묶지 않는다)
  c_image_reserve constant bigint := 16777216;
  v_n        int;
  v_pending  int;
  v_recent   int;
  v_stored   bigint;
  v_tracked  bigint;
  v_reserved bigint;
  v_new      bigint;
  v_service  bigint;
begin
  if p_user_id is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'bad_items' using errcode = 'check_violation';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n = 0 or v_n > 40 then
    raise exception 'bad_items' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('publish_uploads:' || p_user_id::text, 0));

  select count(*) filter (where finalized_at is null and purged_at is null and created_at > now() - interval '2 hours'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into v_pending, v_recent
    from public.publish_uploads
   where user_id = p_user_id;
  if v_pending + v_n > c_max_pending then
    raise exception 'too_many_pending' using errcode = 'check_violation';
  end if;
  if v_recent + v_n > c_max_daily then
    raise exception 'too_many_daily' using errcode = 'check_violation';
  end if;

  -- 실제 크기(Storage 객체)와 원장 기록 중 큰 쪽 + 확인 전 자리 예약분
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into v_stored
    from storage.objects o
   where o.bucket_id = 'publish-media' and o.name like p_user_id::text || '/%';
  select coalesce(sum(coalesce(actual_bytes, declared_bytes)) filter (where finalized_at is not null and purged_at is null), 0),
         coalesce(sum(case when kind = 'video' then c_video_reserve else c_image_reserve end)
                    filter (where finalized_at is null and purged_at is null and created_at > now() - interval '2 hours'), 0)
    into v_tracked, v_reserved
    from public.publish_uploads
   where user_id = p_user_id;
  select coalesce(sum(case when x ->> 'kind' = 'video' then c_video_reserve else c_image_reserve end), 0) into v_new
    from jsonb_array_elements(p_items) as x;
  if greatest(v_stored, v_tracked) + v_reserved + v_new > c_user_cap then
    raise exception 'storage_full' using errcode = 'check_violation';
  end if;

  select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into v_service
    from storage.objects o
   where o.bucket_id = 'publish-media';
  if v_service + v_new > c_service_cap then
    raise exception 'service_full' using errcode = 'check_violation';
  end if;

  insert into public.publish_uploads (path, user_id, kind, mime, declared_bytes)
  select x ->> 'path', p_user_id, x ->> 'kind', x ->> 'mime', (x ->> 'bytes')::bigint
    from jsonb_array_elements(p_items) as x;
end;
$$;

-- 새 미디어 글 만들기 — 업로드를 잠그고(for update) 확인된 것만 붙인다. 가드 트리거는 정의자 권한이라 건너뛰므로
-- 같은 규칙(상태·예약 시각·상한 60)을 여기서 직접 본다. 모양·개수는 표 체크가 본다.
create or replace function public.create_publish_post(
  p_user_id       uuid,
  p_channel       text,
  p_caption       text,
  p_ig_surface    text,
  p_share_to_feed boolean,
  p_media         jsonb,
  p_status        text,
  p_scheduled_at  timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_count    int;
  v_paths    text[];
  v_expected int;
  v_ok       int;
begin
  if p_user_id is null or p_status not in ('draft', 'scheduled') or p_channel not in ('instagram', 'threads') then
    raise exception 'bad_request' using errcode = 'check_violation';
  end if;
  if p_status = 'scheduled' and p_scheduled_at < now() - interval '5 minutes' then
    raise exception 'schedule_in_past' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('scheduled_posts_cap:' || p_user_id::text, 0));
  select count(*) into v_count
    from public.scheduled_posts
   where user_id = p_user_id and status in ('draft', 'scheduled', 'processing', 'publishing');
  if v_count >= 60 then
    raise exception 'too_many_unpublished' using errcode = 'check_violation';
  end if;

  if p_media is not null then
    if jsonb_typeof(p_media) <> 'array' then
      raise exception 'bad_request' using errcode = 'check_violation';
    end if;
    select array_agg(w.path), count(*)
      into v_paths, v_expected
      from (
        select e ->> 'path' as path from jsonb_array_elements(p_media) as e
        union all
        select e ->> 'cover_path' from jsonb_array_elements(p_media) as e where jsonb_typeof(e -> 'cover_path') = 'string'
      ) as w;
    -- 정리 크론·버리기와 경쟁하지 않게 먼저 잠근다(그쪽은 purged_at 을 적는 update 라 이 잠금을 기다린다)
    perform 1 from public.publish_uploads u where u.path = any (v_paths) for update;
    select count(*) into v_ok
      from public.publish_uploads u
      join (
        select e ->> 'path' as path, e ->> 'kind' as kind from jsonb_array_elements(p_media) as e
        union all
        select e ->> 'cover_path', 'cover' from jsonb_array_elements(p_media) as e where jsonb_typeof(e -> 'cover_path') = 'string'
      ) as w on w.path = u.path and w.kind = u.kind
     where u.user_id = p_user_id
       and u.finalized_at is not null
       and u.purged_at is null
       and u.post_id is null;
    if v_ok is distinct from v_expected then
      raise exception 'upload_not_ready' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.scheduled_posts (user_id, channel, caption, image_urls, media, ig_surface, share_to_feed, status, scheduled_at)
  values (p_user_id, p_channel, coalesce(p_caption, ''), '{}', p_media, p_ig_surface, coalesce(p_share_to_feed, true), p_status, p_scheduled_at)
  returning id into v_id;

  if v_paths is not null then
    update public.publish_uploads set post_id = v_id where path = any (v_paths) and user_id = p_user_id;
  end if;
  return v_id;
end;
$$;

-- 하루 전송 예산 소비 — 넘으면 false(아무것도 적지 않는다). 날짜는 KST.
create or replace function public.publish_consume_fetch_bytes(p_user_id uuid, p_bytes bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_cap constant bigint := 4294967296;  -- 4 GiB / 일
  v_day   date := (now() at time zone 'Asia/Seoul')::date;
  v_after bigint;
begin
  if p_bytes is null or p_bytes <= 0 then
    return true;
  end if;
  insert into public.publish_fetch_usage (user_id, day, bytes) values (p_user_id, v_day, 0)
  on conflict (user_id, day) do nothing;
  update public.publish_fetch_usage
     set bytes = bytes + p_bytes
   where user_id = p_user_id and day = v_day and bytes + p_bytes <= c_cap
  returning bytes into v_after;
  return v_after is not null;
end;
$$;

-- 예약 시각이 지난 글 — 사용자당 p_per_user 개까지(한 계정이 줄을 독차지하지 못하게)
create or replace function public.pick_due_posts(p_limit int, p_per_user int)
returns table (id uuid, user_id uuid, scheduled_at timestamptz, items int)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.user_id, t.scheduled_at, t.items
    from (
      select p.id, p.user_id, p.scheduled_at,
             coalesce(jsonb_array_length(p.media), cardinality(p.image_urls), 0)::int as items,
             row_number() over (partition by p.user_id order by p.scheduled_at) as rn
        from public.scheduled_posts p
       where p.status = 'scheduled' and p.scheduled_at <= now()
    ) as t
   where t.rn <= greatest(1, p_per_user)
   order by t.scheduled_at
   limit greatest(1, least(p_limit, 200));
$$;

-- 이 경로들 중 아직 어떤 글이 참조하는 것 — 정리 크론이 지우기 전 한 번 더 본다(되돌릴 수 없는 삭제)
create or replace function public.publish_paths_referenced(p_paths text[])
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select x.path
    from unnest(p_paths) as x(path)
   where exists (select 1 from public.scheduled_posts s where s.media @> jsonb_build_array(jsonb_build_object('path', x.path)))
      or exists (select 1 from public.scheduled_posts s where s.media @> jsonb_build_array(jsonb_build_object('cover_path', x.path)));
$$;

revoke all on function public.claim_publish_uploads(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_publish_post(uuid, text, text, text, boolean, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.publish_consume_fetch_bytes(uuid, bigint) from public, anon, authenticated;
revoke all on function public.pick_due_posts(int, int) from public, anon, authenticated;
revoke all on function public.publish_paths_referenced(text[]) from public, anon, authenticated;
grant execute on function public.claim_publish_uploads(uuid, jsonb) to service_role;
grant execute on function public.create_publish_post(uuid, text, text, text, boolean, jsonb, text, timestamptz) to service_role;
grant execute on function public.publish_consume_fetch_bytes(uuid, bigint) to service_role;
grant execute on function public.pick_due_posts(int, int) to service_role;
grant execute on function public.publish_paths_referenced(text[]) to service_role;

-- ────────────────────────────────────────────────────────────────
-- ⑥ Storage — publish-media(비공개) + 공개 버킷 상한
-- ────────────────────────────────────────────────────────────────
-- 사용자 insert·select 정책을 **두지 않는다** — 올리기는 서버가 발급한 서명 업로드 토큰으로만, 읽기는 서버의 서명 URL 로만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publish-media', 'publish-media', false, 314572800, array['video/mp4', 'video/quicktime', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 공개 버킷 세 개에 상한이 없었다 — 전역 상한을 300MB 로 올리는 순간 로그인 사용자 누구나 우리 도메인에 300MB 파일을
-- 공개로 올릴 수 있게 된다(전송비는 우리가 낸다). 지금 코드가 실제로 올리는 크기·형식만 연다.
--   cardnews     — 옛 발행 컴포저(PNG·JPEG·WEBP, 8MB)·스튜디오 카드뉴스(JPEG·PNG, 5MB)
--   brand-logos  — 브랜드 킷 로고(2MB, PNG·JPEG·WEBP·SVG·GIF — studio/brand-kit-actions.ts)
--   reference-thumbs — 수집 썸네일(서버만 올린다, 1.5MB, lib/media/safe-image.ts 의 네 형식)
update storage.buckets
   set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'cardnews';
update storage.buckets
   set file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
 where id = 'brand-logos';
update storage.buckets
   set file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'reference-thumbs';

-- ────────────────────────────────────────────────────────────────
-- 적용 확인
--   ① 0행이어야 한다 — 상한 없는 버킷(전역 상한을 올리기 전에 0이어야 한다)
--   ② 0행이어야 한다 — bucket_id 조건 없는 storage.objects 정책(대시보드에서 만든 것 포함)
--   ③ authenticated 의 scheduled_posts 쓰기 칸 — insert 6개·update 5개만 보여야 한다
--   ④ 새 함수 실행 권한 — create_publish_post 등은 service_role 만(authenticated·anon 이 보이면 안 된다)
-- ────────────────────────────────────────────────────────────────
select id, public, file_size_limit, allowed_mime_types from storage.buckets where file_size_limit is null;

select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and coalesce(qual, '') not ilike '%bucket_id%' and coalesce(with_check, '') not ilike '%bucket_id%';

select privilege_type, string_agg(column_name, ', ' order by column_name) as columns
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'scheduled_posts' and grantee = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE')
 group by privilege_type;

select routine_name, grantee, privilege_type
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('claim_publish_uploads', 'create_publish_post', 'publish_consume_fetch_bytes',
                        'pick_due_posts', 'publish_paths_referenced', 'scheduled_posts_guard',
                        'publish_media_shape_ok', 'publish_media_count_ok')
 order by routine_name, grantee;

-- ────────────────────────────────────────────────────────────────
-- 롤백 때(이 기능 이전 배포로 되돌릴 경우) — 옛 화면·옛 크론은 processing 을 모른다. 실행하면 처리 중인 글이 실패로 내려앉는다.
--   update public.scheduled_posts
--      set status = 'failed', next_check_at = null, error_code = 'INTERRUPTED',
--          error = '발행이 도중에 끊겼어요 — 실제로 올라갔는지 확인한 뒤 다시 시도해 주세요'
--    where status in ('processing', 'publishing');
-- ────────────────────────────────────────────────────────────────
