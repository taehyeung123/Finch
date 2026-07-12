/**
 * applyRegionPick 로직 검증 — 상호배타·상한 가드 증명용.
 * 실행: node scripts/test-region-pick.ts  (Node 24 타입 스트리핑)
 */
import {
  KR_PROVINCES,
  NATIONWIDE,
  applyRegionPick,
  type RegionPick,
} from "../lib/geo/kr-regions.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${name}`);
    return;
  }
  console.log(`  ✓ ${name}`);
}

/* 1. 전국 상호배타 */
let v: RegionPick[] = [{ province: "서울", district: "강남구" }];
v = applyRegionPick(v, NATIONWIDE);
check("전국 선택 시 개별 선택 해제", v.length === 1 && v[0].province === "전국");
v = applyRegionPick(v, { province: "서울", district: "강남구" });
check("개별 선택 시 전국 해제", v.length === 1 && v[0].district === "강남구");

/* 2. 시·도 전체 <-> 하위 시·군·구 상호 대체 */
v = applyRegionPick(v, { province: "서울" });
check("'서울 전체' 선택 시 강남구 제거", v.length === 1 && !v[0].district);
v = applyRegionPick(v, { province: "서울", district: "마포구" });
check("마포구 선택 시 '서울 전체' 해제", v.length === 1 && v[0].district === "마포구");

/* 3. 상한 가드 — max=5로 6번째 거부 */
v = [];
for (let i = 1; i <= 5; i++) v = applyRegionPick(v, { province: "경기", district: `시${i}` }, 5);
check("상한 내 5곳 수용", v.length === 5);
const rejected = applyRegionPick(v, { province: "경기", district: "시6" }, 5);
check("6번째 추가 거부 (기존 배열 유지)", rejected === v && rejected.length === 5);

/* 4. 상한 상태에서 선택을 줄이는 '전체' 교체는 허용 */
const replaced = applyRegionPick(v, { province: "경기" }, 5);
check("상한 상태에서 '경기 전체' 축소 교체 허용", replaced.length === 1 && !replaced[0].district);

/* 5. 실데이터 전수 — 전국 모든 시·군·구 선택 시 총 몇 곳인가 */
v = [];
for (const p of KR_PROVINCES) {
  for (const d of p.districts) v = applyRegionPick(v, { province: p.name, district: d });
  if (p.districts.length === 0) v = applyRegionPick(v, { province: p.name }); // 세종
}
console.log(`\n  한국 전체를 시·군·구 단위로 다 선택하면: ${v.length}곳 (Meta 상한 250곳 미만)`);
check("전수 선택이 상한(250) 이내라 전부 수용", v.length <= 250);
check("전수 선택 = 시·군·구 228 + 세종 1 = 229곳", v.length === 229);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
