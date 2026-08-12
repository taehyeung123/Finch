-- 0035: 소재 태깅 확장 — 해시태그(수집 시 원문에서 추출)·AI 주제어·AI 코멘트
--
-- 배경 (2026-08-12 사장님 지시): 오가닉에 AI 분석 + 후킹기법·주제태그·해시태그를 남긴다.
-- ai_summary·ai_hooks 는 0027 에 이미 있으므로(당시 "배치 enrich 가 채움" 예정 컬럼)
-- 여기서는 나머지 세 자리만 추가한다.
--
-- hashtags 를 배치가 아니라 **수집 시점**에 뽑는 이유: creatives.body 는 줄바꿈을 접고
-- 600자에서 자른 정규화본이라, 캡션 끝에 몰린 해시태그는 이미 유실된 뒤다.
-- 원문 캡션이 살아있는 순간(upsert)에 뽑아야 전부 잡힌다.

alter table public.creatives
  add column if not exists hashtags jsonb not null default '[]'::jsonb;

-- AI 주제어 — 업종(industry_ids)보다 한 단계 구체적인 한 단어 (예: 선크림, 단백질간식)
alter table public.creatives
  add column if not exists ai_topic text not null default '';

-- AI 코멘트 — "왜 반응을 얻었나" 한 문장. 개인 수집분의 ai_comment 와 같은 역할.
alter table public.creatives
  add column if not exists ai_comment text not null default '';

-- 후킹 태그 포함 검색용 (ai_hooks @> '["호기심"]' 류). 지금은 클라이언트 필터지만
-- 서버 필터로 올릴 때 필요하고, GIN 유지비는 미미하다.
create index if not exists idx_creatives_ai_hooks
  on public.creatives using gin (ai_hooks jsonb_path_ops);

-- 분석 배치 대상 조회용 — "아직 요약 안 된 소재" 부분 인덱스
create index if not exists idx_creatives_enrich_todo
  on public.creatives (heat_score desc)
  where ai_summary = '' and takedown_at is null;

-- 파생물 읽기 정책 강화 — 0027 은 using(true) 로 열어 뒀는데, 원본 소재가
-- takedown 되어도 대본·분석이 계속 읽히는 구멍이다(이번 리뷰에서 확인).
-- 원본과 같은 조건(takedown_at is null)으로 좁힌다.
drop policy if exists "pool read transcripts" on public.creative_transcripts;
create policy "pool read transcripts" on public.creative_transcripts
  for select to authenticated
  using (exists (
    select 1 from public.creatives c
    where c.id = creative_id and c.takedown_at is null
  ));

drop policy if exists "pool read analyses" on public.creative_analyses;
create policy "pool read analyses" on public.creative_analyses
  for select to authenticated
  using (exists (
    select 1 from public.creatives c
    where c.id = creative_id and c.takedown_at is null
  ));

-- 확인
select
  count(*) filter (where ai_summary = '') as enrich_todo,
  count(*) as total
from public.creatives;
