-- 핀치(Finch) 카드뉴스 예약 발행 — 인스타그램 캐러셀 자동 게시
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.

-- 알림 유형에 studio 추가 (예약 발행 성공/실패 알림) — 0009에서 billing만 추가했던 것 보강
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('competitor_ad','trend','account_spike','account_drop','token_expiry','budget','billing','studio'));

-- ── scheduled_posts ── 예약 발행 대기열 ────────────────────────────
create table public.scheduled_posts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  caption        text not null,
  image_urls     text[] not null check (array_length(image_urls, 1) between 1 and 10),
  scheduled_at   timestamptz not null,
  status         text not null default 'scheduled'
                   check (status in ('scheduled','publishing','published','failed','canceled')),
  ig_media_id    text,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.scheduled_posts enable row level security;
create policy "own scheduled posts" on public.scheduled_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index scheduled_posts_due_idx on public.scheduled_posts (status, scheduled_at);
create trigger trg_scheduled_posts_updated before update on public.scheduled_posts
  for each row execute function public.set_updated_at();

-- ── Storage: cardnews 버킷 (공개 읽기 — Meta가 이미지를 URL로 직접 가져간다) ──
insert into storage.buckets (id, name, public)
values ('cardnews', 'cardnews', true)
on conflict (id) do nothing;

-- 업로드는 본인 폴더(user_id/...)에만, 삭제도 본인 것만. 읽기는 공개(버킷 자체가 public).
drop policy if exists "own cardnews upload" on storage.objects;
create policy "own cardnews upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cardnews' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own cardnews delete" on storage.objects;
create policy "own cardnews delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cardnews' and (storage.foldername(name))[1] = auth.uid()::text);
