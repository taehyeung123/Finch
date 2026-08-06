-- ============================================================================
-- 0024_reference_collect_lock.sql — 레퍼런스 수집 동시 실행 방지 락
-- ----------------------------------------------------------------------------
-- runCollection()이 진행 중일 때 같은 사용자가 다시 트리거(새로고침·다른 탭·
-- 다른 기기)하면 이중 크레딧 차감·중복 공급사 호출이 발생할 수 있다.
-- user_id를 PK로 둬서 insert 시도만으로 원자적으로 락을 획득/충돌 감지한다
-- (check-then-insert보다 레이스에 안전).
--
-- started_at이 10분(서버리스 maxDuration 300초의 2배 여유)보다 오래됐으면
-- 죽은 락(함수가 크래시해서 finally를 못 탄 경우)으로 보고 애플리케이션
-- 레벨에서 강제 해제한다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행. 재실행 안전(idempotent).
-- ============================================================================

create table if not exists public.reference_collect_locks (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.reference_collect_locks enable row level security;

drop policy if exists "own reference collect lock" on public.reference_collect_locks;
create policy "own reference collect lock" on public.reference_collect_locks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
