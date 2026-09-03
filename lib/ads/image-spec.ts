/**
 * 광고 이미지 규격 검사 — 서버가 **바이트를 보고** 판정한다(브라우저 MIME·확장자는 OS 마다 다르다).
 * 외부 의존성 없이 JPEG SOFn / PNG IHDR 에서 폭·높이를 읽는다(수십 줄). 근거 docs/ADS_STAGE2_SPEC.md §4.2.
 *
 * 규격(Ads Guide + 제품 결정): JPG/PNG · 서버 하드캡 4MB(클라이언트가 먼저 ≤2.5MB 로 줄인다) ·
 * 짧은 변 ≥ 600px · 비율 4:5(0.8) ~ 1.91:1 (허용오차 1%).
 */

export const AD_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const AD_IMAGE_MIN_SHORT_SIDE = 600;
export const AD_IMAGE_MIN_RATIO = 0.8;
export const AD_IMAGE_MAX_RATIO = 1.91;
const RATIO_TOLERANCE = 0.01;

export type AdImageMime = "image/jpeg" | "image/png";

export type AdImageCheck =
  | { ok: true; mime: AdImageMime; width: number; height: number; ext: "jpg" | "png" }
  | { ok: false; reason: "too_large" | "not_image" | "unreadable" | "too_small" | "bad_ratio"; detail?: string };

function sniffMime(b: Uint8Array): AdImageMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  /* 시그니처 8 + IHDR 청크: 길이(4) + 'IHDR'(4) + 폭(4) + 높이(4) */
  if (b.length < 24) return null;
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  /* 마커를 따라가며 SOF0~SOF15(C4·C8·CC 제외)에서 높이·폭을 읽는다 */
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    /* 독립 마커(길이 없음) */
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS 전에 SOF 가 없다
    const len = dv.getUint16(i + 2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      const height = dv.getUint16(i + 5);
      const width = dv.getUint16(i + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

export function checkAdImage(bytes: Uint8Array): AdImageCheck {
  if (bytes.byteLength === 0 || bytes.byteLength > AD_IMAGE_MAX_BYTES) {
    return { ok: false, reason: "too_large", detail: `${bytes.byteLength} bytes` };
  }
  const mime = sniffMime(bytes);
  if (!mime) return { ok: false, reason: "not_image" };
  const size = mime === "image/png" ? pngSize(bytes) : jpegSize(bytes);
  if (!size) return { ok: false, reason: "unreadable" };
  const short = Math.min(size.width, size.height);
  if (short < AD_IMAGE_MIN_SHORT_SIDE) {
    return { ok: false, reason: "too_small", detail: `${size.width}x${size.height}` };
  }
  const ratio = size.width / size.height;
  if (ratio < AD_IMAGE_MIN_RATIO * (1 - RATIO_TOLERANCE) || ratio > AD_IMAGE_MAX_RATIO * (1 + RATIO_TOLERANCE)) {
    return { ok: false, reason: "bad_ratio", detail: ratio.toFixed(3) };
  }
  return { ok: true, mime, width: size.width, height: size.height, ext: mime === "image/png" ? "png" : "jpg" };
}
