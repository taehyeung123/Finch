// 브랜드 에셋 래스터라이즈 — 마스터 SVG를 심사/스토어용 PNG로 변환한다.
// 실행: node scripts/build-brand-assets.mjs
// 산출물은 public/brand/ 아래 PNG. 심사 요구 규격:
//   - Meta 앱: 1024x1024  - Google OAuth 동의화면: 120x120  - Kakao: 108/512
//   - 파비콘/스토어 공용: 512, 256, 192, 180(apple-touch)
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "brand");

/** [소스 SVG, 출력 접두사, 크기 배열] */
const JOBS = [
  ["finch-app-icon.svg", "finch-app-icon", [1024, 512, 256, 192, 180, 120, 108]],
  ["finch-app-icon-dark.svg", "finch-app-icon-dark", [1024, 512, 256]],
  ["finch-mark-coral.svg", "finch-mark-coral", [512, 256]],
  ["finch-mark-dark.svg", "finch-mark-dark", [512, 256]],
  ["finch-wordmark.svg", "finch-wordmark", [880]], // 폭 기준 2x
  ["finch-og.svg", "finch-og", [1200]], // 폭 기준 (1200x630)
];

let count = 0;
for (const [src, prefix, sizes] of JOBS) {
  const input = join(dir, src);
  for (const size of sizes) {
    const out = join(dir, `${prefix}-${size}.png`);
    // 정사각 아이콘은 size x size, 워드마크/OG는 폭만 지정하고 비율 유지
    const isWide = prefix === "finch-wordmark" || prefix === "finch-og";
    const pipeline = sharp(input, { density: 400 });
    await (isWide ? pipeline.resize({ width: size }) : pipeline.resize(size, size)).png().toFile(out);
    count++;
    console.log(`  ✓ ${prefix}-${size}.png`);
  }
}
console.log(`\n브랜드 PNG ${count}개 생성 완료 → public/brand/`);
