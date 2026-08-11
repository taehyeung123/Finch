-- 0034_heat_base.sql — 저장수 부스트를 복리로 쌓지 않기 위한 원본 점수 보관
--
-- pool-finalize 는 매일 돈다. 예전에는 heat_score 에 저장수 배수를 곱해 덮어썼는데,
-- 다음 날에는 이미 부스트된 값에 또 곱한다. 며칠이면 복리로 100 상한에 붙어버려서
-- 집행 기간·조회 배수 같은 원래 신호가 저장 수 하나로 뭉개진다.
--
-- 원본을 여기 남기고, 매 회차 heat_score = heat_base * saveBoost(save_count) 로
-- **다시 계산**한다. null 이면 아직 부스트를 안 받은 소재다.
alter table public.creatives add column if not exists heat_base real;

comment on column public.creatives.heat_base is
  '저장수 부스트 적용 전 원본 히트 스코어. pool-finalize 가 매번 이 값에서 다시 계산한다.';
