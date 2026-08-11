// vercel.json 사전 검증 — 푸시 전에 배포 거부를 잡아낸다.
//
// 왜 필요한가 (2026-08-11)
// ------------------------------------------------------------------
// vercel.json 의 잘못은 **빌드 실패가 아니라 배포 거부**로 나타난다.
// 로컬 `npm run build` 는 vercel.json 을 아예 읽지 않으므로 100% 통과하고,
// GitHub 에는 푸시되고, 사이트만 조용히 예전 상태로 남는다.
// 실제로 이것 때문에 커밋 9개가 하루 종일 반영되지 않았고, 그동안
// 로컬 빌드는 계속 초록불이었다. 눈으로는 절대 구분이 안 된다.
//
// 잡아내는 것
//  1. Vercel 공식 스키마에 없는 최상위 키 (예: "$comment" — 이게 두 번째 배포 거부 원인)
//  2. Hobby 플랜 크론 규칙 위반: 하루 2회 이상 도는 식 (첫 번째 배포 거부 원인)
//  3. path·schedule 길이 상한
//
//   node scripts/check-vercel-json.mjs            (Hobby 기준 검사)
//   node scripts/check-vercel-json.mjs --pro      (Pro 로 올린 뒤)

import { readFileSync } from "node:fs";

const PRO = process.argv.includes("--pro");

/* vercel.json 이 허용하는 최상위 키.
   출처: https://vercel.com/docs/project-configuration/vercel-json (2026-08-11 확인)
   목록을 네트워크로 받아오지 않고 박아 둔다 — 이 검사는 푸시 직전에 도는 것이라
   오프라인에서도 되어야 하고, fetch 를 쓰면 윈도우 Node 가 종료 시 핸들 정리에서
   죽어 종료 코드가 127 로 나온다(실측). 잡으려는 건 스키마 변화가 아니라 오타다. */
const ALLOWED_TOP_LEVEL = new Set([
  "$schema",
  "buildCommand",
  "bunVersion",
  "cleanUrls",
  "crons",
  "devCommand",
  "fluid",
  "framework",
  "functions",
  "functionFailoverRegions",
  "headers",
  "ignoreCommand",
  "images",
  "installCommand",
  "outputDirectory",
  "public",
  "redirects",
  "bulkRedirectsPath",
  "regions",
  "rewrites",
  "routes",
  "trailingSlash",
]);

const raw = readFileSync("vercel.json", "utf8");
let cfg;
try {
  cfg = JSON.parse(raw);
} catch (e) {
  console.error(`
vercel.json 이 올바른 JSON 이 아닙니다: ${e.message}
`);
  process.exit(1);
}

const problems = [];

/* 1. 최상위 키 */
for (const key of Object.keys(cfg)) {
  if (!ALLOWED_TOP_LEVEL.has(key)) {
    problems.push(`최상위 키 "${key}" 는 vercel.json 이 모르는 키입니다 → 배포가 거부됩니다`);
  }
}

/* 2. 크론 */
const crons = Array.isArray(cfg.crons) ? cfg.crons : [];
for (const c of crons) {
  if (typeof c?.path !== "string" || !c.path.startsWith("/")) {
    problems.push(`크론 path 가 잘못됐습니다: ${JSON.stringify(c)}`);
    continue;
  }
  if (c.path.length > 512) problems.push(`크론 path 가 512자를 넘습니다: ${c.path.slice(0, 40)}…`);
  if (typeof c.schedule !== "string" || c.schedule.length > 256) {
    problems.push(`크론 schedule 이 잘못됐습니다: ${c.path}`);
    continue;
  }
  if (!PRO) {
    const why = runsMoreThanDaily(c.schedule);
    if (why) {
      problems.push(
        `Hobby 는 크론이 하루 1회만 됩니다 — "${c.path}" 의 "${c.schedule}" 는 ${why}. 배포가 거부됩니다.`,
      );
    }
  }
}

/**
 * 하루 2회 이상 도는 식인지 판정한다.
 * 분과 시가 **둘 다 고정 단일값**일 때만 하루 1회다.
 * 요일·일자에 뭐가 오든 "그 날에는 1회"이므로 하루 1회 규칙에는 걸리지 않는다.
 */
function runsMoreThanDaily(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "필드가 5개가 아닙니다";
  const [min, hour] = parts;
  if (!isSingleValue(min)) return "분 필드가 여러 값입니다";
  if (!isSingleValue(hour)) return "시 필드가 여러 값입니다";
  return null;
}

function isSingleValue(field) {
  return /^\d+$/.test(field);
}

if (problems.length > 0) {
  fail(problems.map((p) => `  ✗ ${p}`).join("\n"));
}

console.log(
  `vercel.json 정상 — 크론 ${crons.length}개 (${PRO ? "Pro" : "Hobby"} 기준). 배포 거부 사유 없음.`,
);

function fail(msg) {
  console.error(`\nvercel.json 검사 실패:\n${msg}\n`);
  process.exit(1);
}
