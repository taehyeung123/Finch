-- 핀치(Finch) 브랜드 톤 학습 — 사용자별 톤 프로필 + 예시 캡션
-- 적용: Supabase SQL 편집기에 붙여넣거나 `supabase db push`.
--
-- "학습"의 실체는 모델 파인튜닝이 아니라, 사용자의 톤을 요약한 프로필(JSON)과 잘 된 예시
-- 캡션을 저장해 두고, 카드뉴스 생성 시 시스템 프롬프트에 컨텍스트로 주입하는 것이다.
-- profile은 사용자가 직접 편집·확정할 수 있어야 드리프트를 막는다(lib/actions 참고).

create table if not exists public.brand_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  profile    jsonb not null default '{}'::jsonb,   -- { tone, phrases[], banned[], target, industry }
  samples    jsonb not null default '[]'::jsonb,   -- 잘 된 예시 캡션(최대 5)
  updated_at timestamptz not null default now()
);
alter table public.brand_profiles enable row level security;
create policy "own brand profile" on public.brand_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_brand_profiles_updated before update on public.brand_profiles
  for each row execute function public.set_updated_at();
