-- 핀치(Finch) 알림 수신 설정 — 유형×경로(인앱/이메일) 토글 저장
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.

create table if not exists public.notification_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- { "competitor_ad": { "inapp": true, "email": true }, ... } 형태의 유형별 토글
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy "own notification settings" on public.notification_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_notification_settings_updated before update on public.notification_settings
  for each row execute function public.set_updated_at();
