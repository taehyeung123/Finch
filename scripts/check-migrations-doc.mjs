#!/usr/bin/env node
/*
  마이그레이션 번호와 문서가 어긋나면 빌드를 멈춘다.

  왜 필요한가 (2026-09-08): 이 저장소의 마이그레이션은 Supabase 대시보드 SQL Editor 로 직접 적용된다.
  대시보드 목록에는 기록이 남지 않으므로, **«어디까지 넣었는지» 를 아는 유일한 근거가 저장소의 문서 한 줄**이다.
  그 줄이 뒤처지면 다음 사람이 이미 넣은 것을 다시 넣거나(create or replace 가 뒤 마이그레이션을 되돌린다),
  안 넣은 것을 넣었다고 믿는다. 실제로 두 문서가 각각 0074·0078 에 멈춰 있었고 파일은 0087 이었다.

  사람의 주의력 대신 빌드가 지키게 한다 — 이 저장소가 server-only 경계에 쓴 것과 같은 수법이다.

  검사:
   ① supabase/migrations 의 파일 번호가 0001 부터 빈틈없이 이어지는가(중복·구멍 없음)
   ② supabase/README.md 의 «0001~NNNN 이 적용돼 있다» 가 최신 번호와 같은가
   ③ docs/API_ROADMAP.md 의 «마이그레이션은 N개다(0001~NNNN)» 가 최신 번호와 같은가

  ②③ 은 문서가 그 문장을 갖고 있을 때만 검사한다 — 문장이 통째로 사라지면 그것도 알려 준다.
*/
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const files = readdirSync(join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
const nums = files
  .map((f) => /^(\d{4})_/.exec(f))
  .filter(Boolean)
  .map((m) => Number(m[1]))
  .sort((a, b) => a - b);

if (nums.length === 0) {
  console.error("마이그레이션 파일을 하나도 못 찾았습니다 — 경로가 바뀌었나요?");
  process.exit(1);
}

// ① 빈틈·중복
const seen = new Set();
for (const n of nums) {
  if (seen.has(n)) errors.push(`마이그레이션 번호 ${String(n).padStart(4, "0")} 이 둘 이상입니다.`);
  seen.add(n);
}
for (let i = 1; i <= nums[nums.length - 1]; i++) {
  if (!seen.has(i)) errors.push(`마이그레이션 번호 ${String(i).padStart(4, "0")} 이 비어 있습니다.`);
}

const latest = String(nums[nums.length - 1]).padStart(4, "0");

/**
 * 문서의 «적용 범위» 문장을 최신 번호와 대조한다.
 * ⚠️ 정규식은 문서마다 다르게 준다 — 두 문서 모두 «옛 문서가 0001~0003 이면 된다고 적어 두었는데» 같은
 * **다른 맥락의 범위 표기**를 함께 갖고 있어서, 느슨하게 찾으면 엉뚱한 문장을 검사한다(처음에 그랬다).
 */
function checkDoc(relPath, label, re, hint) {
  let text;
  try {
    text = readFileSync(join(root, relPath), "utf8");
  } catch {
    errors.push(`${relPath} 를 읽지 못했습니다.`);
    return;
  }
  const m = re.exec(text);
  if (!m) {
    errors.push(`${relPath} 에서 적용 범위 문장을 못 찾았습니다(${label}). 기대하는 형태: ${hint}`);
    return;
  }
  if (m.groups.last !== latest) {
    errors.push(`${relPath} 는 «0001~${m.groups.last}» 이라고 적혀 있는데 실제 최신은 ${latest} 입니다(${label}).`);
  }
  if (m.groups.count !== undefined && Number(m.groups.count) !== nums.length) {
    errors.push(`${relPath} 는 «${m.groups.count}개» 라고 적혀 있는데 실제는 ${nums.length}개입니다(${label}).`);
  }
}

checkDoc(
  "supabase/README.md",
  "적용 현황",
  /마이그레이션은\s*0001\s*~\s*(?<last>\d{4})\s*이 적용돼 있다/,
  "«마이그레이션은 0001~NNNN 이 적용돼 있다»",
);
checkDoc(
  "docs/API_ROADMAP.md",
  "로드맵",
  /마이그레이션은\s*(?<count>\d+)개다\*\*\(`0001`\s*~\s*`(?<last>\d{4})`/,
  "«**⚠️ 마이그레이션은 N개다**(`0001`~`NNNN`, …)»",
);

if (errors.length > 0) {
  console.error("마이그레이션 문서 검사 실패:");
  for (const e of errors) console.error("  ✗ " + e);
  console.error("");
  console.error(`  최신 마이그레이션은 ${latest} 입니다. 위 문서의 범위 문장을 함께 고쳐 주세요.`);
  process.exit(1);
}

console.log(`마이그레이션 문서 정상 — 0001~${latest} (${nums.length}개), 문서 2곳과 일치.`);
