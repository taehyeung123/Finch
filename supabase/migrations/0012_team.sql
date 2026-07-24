-- 핀치(Finch) 팀 워크스페이스 — 멤버 초대·역할·연동 계정 공유 열람.
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
--
-- 모델: 워크스페이스 소유자(owner_user_id)가 이메일로 멤버를 초대한다. 초대 토큰(invite_token)은
-- 서버(admin client)로만 조회한다 — RLS로는 "미로그인/미연결 상태에서 토큰만으로 조회"를 표현할
-- 방법이 없으므로(그 시점엔 auth.uid()가 초대 대상과 무관), 클라이언트가 임의 토큰으로 다른 사람의
-- 초대를 열람하지 못하도록 아예 RLS 정책에서 invite_token 경로를 열지 않는다(app/team/accept 참고).
-- v1 단순화: 한 유저는 최대 하나의 팀에만 소속된다고 가정(lib/team.ts).

create table public.team_members (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  member_user_id  uuid references auth.users(id) on delete cascade,
  email           text not null,
  role            text not null default 'viewer' check (role in ('editor','viewer')),
  status          text not null default 'invited' check (status in ('invited','active','revoked')),
  invite_token    text unique,
  invited_at      timestamptz not null default now(),
  joined_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (owner_user_id, email)
);
alter table public.team_members enable row level security;

-- 소유자는 자기 워크스페이스의 멤버 행을 전부 관리(초대·역할변경·제거)한다.
create policy "owner manage members" on public.team_members
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- 멤버는 자기 자신의 멤버십 행만 조회할 수 있다(다른 팀원 명단은 노출하지 않는다 — v1 단순화).
create policy "member reads own membership" on public.team_members
  for select using (auth.uid() = member_user_id);

create index team_members_owner_idx on public.team_members (owner_user_id);
create index team_members_member_idx on public.team_members (member_user_id) where status = 'active';

-- ── connected_accounts: 활성 팀 멤버에게 소유자의 연동 계정 열람 허용 ──────────
-- 기존 "own accounts" 정책(0001_core.sql)은 그대로 두고 select 전용 정책을 추가만 한다 —
-- insert/update/delete는 여전히 "own accounts"(auth.uid() = user_id)만 허용하므로 멤버는
-- 소유자의 연동을 해제하거나 토큰을 바꿀 수 없다.
create policy "team members read" on public.connected_accounts
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.owner_user_id = connected_accounts.user_id
        and tm.member_user_id = auth.uid()
        and tm.status = 'active'
    )
  );
