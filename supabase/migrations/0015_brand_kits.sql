-- 핀치(Finch) 나만의 디자인(브랜드 킷) — 사용자 커스텀 색 팔레트 + 로고
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
--
-- 브랜드 킷은 카드뉴스 콘텐츠(=생성 이미지)에 적용하는 사용자 정의 팔레트/로고다.
-- 앱 UI 색(코랄+잉크)과 무관한 콘텐츠 자산 설정이며, 킷 자체는 수 KB JSON 수준이라 부담이 없다.
-- 로고 이미지만 Storage(brand-logos, 공개 읽기 — 캔버스 렌더가 URL로 로드)에 둔다.

create table if not exists public.brand_kits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null default '내 브랜드',
  ink            text not null default '#0C0C11',
  paper          text not null default '#FAF8F4',
  accent         text not null default '#FF6B4A',
  on_accent      text not null default '#FAF8F4',
  logo_path      text,
  logo_placement text not null default 'closing' check (logo_placement in ('cover','closing','all','none')),
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.brand_kits enable row level security;
create policy "own brand kits" on public.brand_kits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- 사용자당 기본 킷 1개만
create unique index if not exists one_default_kit_per_user on public.brand_kits (user_id) where is_default;
create trigger trg_brand_kits_updated before update on public.brand_kits
  for each row execute function public.set_updated_at();

-- ── Storage: brand-logos 버킷 (공개 읽기 — 캔버스가 URL로 로고를 로드) ──
insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', true)
on conflict (id) do nothing;

drop policy if exists "own brand logo upload" on storage.objects;
create policy "own brand logo upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own brand logo delete" on storage.objects;
create policy "own brand logo delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'brand-logos' and (storage.foldername(name))[1] = auth.uid()::text);
