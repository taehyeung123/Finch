// 업종 시드 마이그레이션 생성기.
//
// lib/industry/taxonomy.ts · seeds.ts 가 단일 출처다. 이 스크립트가 그걸 읽어
// supabase/migrations/0030_industry_seed.sql 을 다시 만든다.
// 업종을 추가하려면 TS 를 고치고 이걸 돌린 뒤, 생성된 SQL 을 적용한다.
//
//   node scripts/gen-industry-seed.mjs

import { readFileSync, writeFileSync } from "node:fs";

const TAX = readFileSync("lib/industry/taxonomy.ts", "utf8");
const SEEDS = readFileSync("lib/industry/seeds.ts", "utf8");

const industries = [
  ...TAX.matchAll(/\{ id: "([^"]+)", nameKo: "([^"]+)", group: "([^"]+)", sort: (\d+) \}/g),
].map((m) => ({ id: m[1], ko: m[2], group: m[3], sort: Number(m[4]) }));

if (industries.length === 0) throw new Error("taxonomy.ts 에서 업종을 못 읽었습니다");

const tableSrc = SEEDS.match(/const TABLE[^=]*=\s*(\[[\s\S]*?\n\];)/);
if (!tableSrc) throw new Error("seeds.ts 에서 TABLE 을 못 읽었습니다");
const table = eval(tableSrc[1].replace(/;$/, ""));

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const keywordRows = [];
for (const [industryId, ads, organic] of table) {
  if (!industries.some((i) => i.id === industryId)) {
    throw new Error(`seeds.ts 의 '${industryId}' 가 taxonomy.ts 에 없습니다`);
  }
  ads.forEach((k, i) =>
    keywordRows.push(`  (${q(industryId)}, 'meta_ads', ${q(k)}, 'seed', ${200 - i * 5})`),
  );
  organic.forEach((k, i) =>
    keywordRows.push(`  (${q(industryId)}, 'instagram', ${q(k)}, 'seed', ${140 - i * 5})`),
  );
}

const sql = `-- 0030_industry_seed.sql — 업종 ${industries.length}개 + 시드 검색어 ${keywordRows.length}개
--
-- ⚠ 자동 생성 파일. 손으로 고치지 말 것.
--   원본: lib/industry/taxonomy.ts · lib/industry/seeds.ts
--   재생성: node scripts/gen-industry-seed.mjs
-- 화면 라벨(TS)과 크롤 대상(DB)이 갈라지면 "메뉴에는 있는데 수집은 안 도는" 업종이 생긴다.
--
-- 한 바퀴 원가: 검색어 ${keywordRows.length}개 × 커서 2페이지 = 공급사 호출 ${keywordRows.length * 2}회.
-- crawl_budget.calls_limit(기본 420)에 걸려 약 1.2일에 한 바퀴가 돈다.

insert into public.industries (id, name_ko, group_key, sort_order) values
${industries.map((i) => `  (${q(i.id)}, ${q(i.ko)}, ${q(i.group)}, ${i.sort})`).join(",\n")}
on conflict (id) do update
  set name_ko = excluded.name_ko,
      group_key = excluded.group_key,
      sort_order = excluded.sort_order;

insert into public.industry_keywords (industry_id, platform, keyword, origin, weight) values
${keywordRows.join(",\n")}
on conflict (industry_id, platform, keyword) do nothing;

-- ────────────────────────────────────────────────────────────────
-- 노출 자격 롤업
--
-- is_visible 을 사람이 켜지 않는다. 브랜드 4곳 & 소재 40건을 동시에 넘긴 업종만
-- 자동으로 켜진다. 한쪽 조건만 보면 "브랜드 1곳이 소재 200건"인 업종이 통과해
-- 화면이 같은 브랜드로 도배된다.
--
-- industries 의 RLS SELECT 정책이 using (is_visible) 이므로, 자격 미달 업종은
-- 앱이 실수로 질의해도 애초에 행이 안 나온다 — 화면 코드의 실수와 무관하게 막힌다.
-- ────────────────────────────────────────────────────────────────
create or replace function public.rollup_industry_stats()
returns void as $$
begin
  with agg as (
    select i.id,
           count(distinct c.brand_id) filter (where c.brand_id is not null) as brands,
           count(c.id) as creatives
      from public.industries i
      left join public.creatives c
        on c.industry_ids @> array[i.id]
       and c.takedown_at is null
     group by i.id
  )
  update public.industries ind
     set brand_count    = agg.brands,
         creative_count = agg.creatives,
         is_visible     = (agg.brands >= 4 and agg.creatives >= 40),
         stats_at       = now()
    from agg
   where ind.id = agg.id;
end;
$$ language plpgsql security definer set search_path = public;

-- 허브 오픈 여부 판정용 — 앱이 자격 통과 업종 수를 세는 유일한 경로
create or replace function public.visible_industry_count()
returns int as $$
  select count(*)::int from public.industries where is_visible;
$$ language sql stable security definer set search_path = public;
`;

writeFileSync("supabase/migrations/0030_industry_seed.sql", sql);
console.log(
  `업종 ${industries.length}개 · 검색어 ${keywordRows.length}개 · 한 바퀴 호출 ${keywordRows.length * 2}회`,
);
