-- ============================================================================
-- 0021_collect_settings.sql — 레퍼런스 수집 필터 설정 (기간·KR·형식·제외 키워드)
-- ----------------------------------------------------------------------------
-- 사용자별 수집 필터. 수집 실행(runCollection)이 이 설정을 읽어
-- 공급사 서버 파라미터(가능한 채널) + 후처리 필터(나머지)로 적용한다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

create table if not exists public.reference_collect_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  period           text not null default 'all' check (period in ('all', '1d', '7d', '30d')),
  kr_only          boolean not null default false,
  media_format     text not null default 'all' check (media_format in ('all', 'video', 'photo', 'carousel')),
  exclude_keywords jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now()
);

alter table public.reference_collect_settings enable row level security;

drop policy if exists "own collect settings" on public.reference_collect_settings;
create policy "own collect settings" on public.reference_collect_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_collect_settings_updated on public.reference_collect_settings;
create trigger trg_collect_settings_updated before update on public.reference_collect_settings
  for each row execute function public.set_updated_at();
