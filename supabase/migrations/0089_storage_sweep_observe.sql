-- 0089_storage_sweep_observe.sql — 고아 파일 «관찰» 표 (아직 아무것도 지우지 않는다)
--
-- 무엇을 위한 것인가 (2026-09-08 보안 감사, Medium)
-- ------------------------------------------------------------------
-- 올린 파일을 지우는 코드가 저장소에 사실상 없다. 「제거」·「삭제」·「되돌릴 수 없어요」를 눌러도
-- Storage 객체는 남고, 이미 퍼진 공개 주소로는 그대로 받아진다.
-- 개인정보처리방침은 「복구 불가능한 방법으로 삭제」·「지체 없이 파기」라고 확언한다.
--
-- 지워도 안전한 세 곳(초안 삭제·업로드 롤백 2곳)은 코드로 이미 고쳤다.
-- 남은 것은 **프로필 링크 쪽**인데, 여기는 즉시 삭제를 붙이면 안 된다:
--   · 블록 복제(duplicateBlock)가 data 를 얕게 복사해 **같은 이미지 주소를 공유**한다
--   · 옛 주소가 published_snapshot 에도 굳어 있어 되돌리기가 그것을 되살린다
-- 즉 한 블록을 지우면서 객체를 지우면 **남은 블록의 이미지가 깨진다.**
--
-- ────────────────────────────────────────────────────────────────
-- 그래서 이 마이그레이션은 «지우기»가 아니라 «관찰»이다.
-- ────────────────────────────────────────────────────────────────
-- Storage 삭제는 **되돌릴 수 없고 백업도 없다.** 참조 판정이 한 군데라도 틀리면
-- 고객이 지금 쓰고 있는 사진이 사라진다. 그래서 순서를 이렇게 잡았다:
--
--   1단계(지금)  크론이 후보만 기록한다. **삭제 코드가 아예 없다.**
--   2단계(2주 뒤) 이 표를 눈으로 본다 — 살아 있는 파일이 후보에 올라오지 않는지.
--   3단계        확인이 끝나면 그때 삭제를 켠다(환경변수 STORAGE_SWEEP_DELETE).
--
-- 3회 연속(=3일) 참조가 없어야 후보로 굳는다. 한 번이라도 참조가 보이면 행을 지운다 —
-- 저장 도중에 잠깐 참조가 안 보이는 순간(업로드 후 저장 전)에 후보가 되지 않게 하는 장치다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- ── 어디까지 훑었나 (사용자 단위 커서) ────────────────────────────────
create table if not exists public.storage_sweep_state (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  last_swept_at timestamptz not null default '-infinity',
  -- 마지막 실행에서 본 객체 수 / 후보 수 — 숫자가 갑자기 튀면 판정이 틀어진 신호다
  last_objects  integer not null default 0,
  last_orphans  integer not null default 0
);
create index if not exists storage_sweep_state_due_idx
  on public.storage_sweep_state (last_swept_at);

-- ── 고아 후보 ────────────────────────────────────────────────────────
create table if not exists public.storage_orphan_candidates (
  bucket            text not null,
  path              text not null,
  user_id           uuid references auth.users(id) on delete cascade,
  size_bytes        bigint,
  object_created_at timestamptz,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  -- 연속으로 «참조 없음»이 확인된 횟수. 3 이상이어야 지울 자격이 생긴다(3단계에서).
  strikes           integer not null default 1,
  primary key (bucket, path)
);
create index if not exists storage_orphan_candidates_user_idx
  on public.storage_orphan_candidates (user_id, strikes desc);

comment on table public.storage_orphan_candidates is
  '참조가 없어 보이는 Storage 객체 후보. **이 표에 있다고 지워진 것이 아니다** — 관찰용이다(0089). 삭제는 STORAGE_SWEEP_DELETE 를 켠 뒤에만 일어난다.';

-- 이 두 표는 크론(service_role)만 쓴다. 사용자에게는 아무 권한도 주지 않는다.
alter table public.storage_sweep_state       enable row level security;
alter table public.storage_orphan_candidates enable row level security;
revoke all on public.storage_sweep_state       from anon, authenticated;
revoke all on public.storage_orphan_candidates from anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- 적용 확인 — 표 2개가 생겼고 사용자 권한이 0행이어야 한다
-- ────────────────────────────────────────────────────────────────
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('storage_sweep_state', 'storage_orphan_candidates')
order by table_name;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('storage_sweep_state', 'storage_orphan_candidates')
  and grantee in ('anon', 'authenticated');
