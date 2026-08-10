-- 0031_migrate_keywords.sql — 기존 사용자 검색어를 공용 풀 크롤 목록으로 승격
--
-- 왜 필요한가
-- ------------------------------------------------------------------
-- 0030 의 시드 253개는 우리가 정한 말이다. 그런데 이미 쓰고 있던 사용자들이
-- 직접 등록해 둔 키워드가 있고, 그건 **실제 수요가 증명된 검색어**다.
-- 새 풀이 그걸 모르는 채로 출발하면, 기존 사용자는 로그인하자마자
-- "내가 보던 게 다 없어졌다"를 겪는다. 그게 이 파일이 있는 이유다.
--
-- 옮기는 것: 검색어(문자열)뿐이다. 수집물 자체는 옮기지 않는다 —
-- reference_items 는 사용자별 복제본이라 공용 풀에 넣으면 같은 게시물이
-- 사용자 수만큼 중복으로 들어간다(바로 그 구조를 버리려고 풀을 만들었다).
-- 기존 수집물은 개인 수집함에 그대로 남아 계속 보인다.
--
-- 업종은 여기서 정하지 않는다. industry_id 를 'etc' 로 두고, 크롤 후
-- 브랜드 단위 분류가 실제 업종을 채운다. 억지로 지금 배정하면 오분류가 굳는다.

-- 1) 메타광고 검색어 (ad_sources, 0026)
insert into public.industry_keywords (industry_id, platform, keyword, origin, weight)
select 'etc', 'meta_ads', trim(s.value), 'migrated', 150
  from public.ad_sources s
 where char_length(trim(s.value)) between 1 and 60
 group by trim(s.value)
on conflict (industry_id, platform, keyword) do nothing;

-- 2) 오가닉 키워드·해시태그 (reference_sources, 0018)
--    계정(kind='account')은 제외한다 — 계정 수집은 키워드 크롤과 경로가 달라
--    brand_profile job 으로 따로 다룬다.
insert into public.industry_keywords (industry_id, platform, keyword, origin, weight)
select 'etc',
       s.channel,                                   -- 등록한 채널 그대로. 전부 인스타로 몰면
       trim(both '#' from trim(s.value)),           -- 틱톡·스레드에서 찾던 사람이 결과를 못 받는다.
       'migrated',
       150
  from public.reference_sources s
 where s.kind in ('keyword', 'hashtag')
   and char_length(trim(both '#' from trim(s.value))) between 1 and 60
 group by s.channel, trim(both '#' from trim(s.value))
on conflict (industry_id, platform, keyword) do nothing;

-- 3) 사용자가 등록한 계정을 브랜드로 등록해 둔다.
--    팔로우 목록(saved_brands)의 씨앗이 되고, 플래너의 최우선 순위(10)를 탄다.
insert into public.brands (platform, external_id, handle, name, industry_source)
select distinct
       s.channel,
       ltrim(trim(s.value), '@'),
       '@' || ltrim(trim(s.value), '@'),
       ltrim(trim(s.value), '@'),
       'seed'
  from public.reference_sources s
 where s.kind = 'account'
   and char_length(ltrim(trim(s.value), '@')) between 1 and 60
on conflict (platform, external_id) do nothing;

insert into public.saved_brands (user_id, brand_id, alert)
select distinct s.user_id, b.id, false
  from public.reference_sources s
  join public.brands b
    on b.platform = s.channel
   and b.external_id = ltrim(trim(s.value), '@')
 where s.kind = 'account'
on conflict (user_id, brand_id) do nothing;
