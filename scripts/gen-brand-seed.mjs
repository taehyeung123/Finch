// 유명 브랜드 시드 마이그레이션 생성기.
//
// lib/industry/brand-seeds.ts 가 단일 출처다. 브랜드를 추가·삭제하려면 그 파일을 고치고
// 이걸 돌린 뒤, 생성된 SQL 을 적용한다.
//
//   node scripts/gen-brand-seed.mjs

import { readFileSync, writeFileSync } from "node:fs";

const SRC = readFileSync("lib/industry/brand-seeds.ts", "utf8");
const TAX = readFileSync("lib/industry/taxonomy.ts", "utf8");

const known = new Set([...TAX.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]));

const tableSrc = SRC.match(/const BRAND_TABLE[^=]*=\s*(\[[\s\S]*?\n\];)/);
if (!tableSrc) throw new Error("brand-seeds.ts 에서 BRAND_TABLE 을 못 읽었습니다");
const table = eval(tableSrc[1].replace(/;$/, ""));

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const rows = [];
for (const [industryId, brands] of table) {
  if (!known.has(industryId)) throw new Error(`'${industryId}' 가 taxonomy.ts 에 없습니다`);
  brands.forEach((keyword, i) =>
    rows.push(`  (${q(industryId)}, 'meta_ads', ${q(keyword)}, 'brand', ${340 - i * 5})`),
  );
}

const sql = `-- 0033_brand_seed.sql — 유명 브랜드 시드 ${rows.length}개
--
-- ⚠ 자동 생성 파일. 손으로 고치지 말 것.
--   원본: lib/industry/brand-seeds.ts
--   재생성: node scripts/gen-brand-seed.mjs
--
-- 왜 필요한가
-- ------------------------------------------------------------------
-- '기초화장품' 같은 일반 검색어로만 풀을 채우면 처음 보는 소규모 광고주가 잔뜩 뜬다.
-- 데이터는 맞지만 화면을 처음 연 사람에게는 "정체불명 광고 모음"으로 보인다.
-- 아는 이름이 깔려 있어야 "이 서비스가 진짜 데이터를 갖고 있구나"가 성립한다.
--
-- weight 300대라 일반 시드(200대)보다 항상 먼저 돈다. 플래너가 origin='brand' 를
-- 우선순위 20(팔로우 브랜드 바로 다음)으로 잡으므로 첫날 예산 대부분이 여기 쓰인다.
-- 브랜드 ${rows.length}개 × 커서 2페이지 = 첫 바퀴 ${rows.length * 2}요청.
--
-- 의료는 개별 의원 상호를 넣지 않고 플랫폼 사업자만 넣었다 — 개별 의원은 데이터가
-- 얇고 분쟁 소지가 있다.

insert into public.industry_keywords (industry_id, platform, keyword, origin, weight) values
${rows.join(",\n")}
on conflict (industry_id, platform, keyword) do update
  set origin    = 'brand',
      weight    = excluded.weight,
      is_active = true;
`;

writeFileSync("supabase/migrations/0033_brand_seed.sql", sql);
console.log(`브랜드 ${rows.length}개 · 첫 바퀴 ${rows.length * 2}요청`);
