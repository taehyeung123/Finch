/**
 * 사진 굽기 — 채널·게시 면의 규칙(ImageLimits)에 맞춰 가운데 자르기·줄이기·JPEG 로 (2026-09-11, 컴포저에서 꺼냈다).
 *
 * 왜 브라우저에서 굽나:
 *  · 인스타·스레드 발행 API 는 JPEG 만 받는다 — 어차피 바꿀 것, 올리기 전에 한다(PNG·WEBP 도 여기서 JPEG 가 된다).
 *  · 인스타 피드는 비율 4:5~1.91:1 밖을 **거절한다**(앱은 잘라 주지만 API 는 안 잘라 준다). 폰 기본 세로 사진(3:4)·스크린샷(9:16)이
 *    정확히 밖이라, 안 자르면 «예약했어요» 뒤 발행 시각에 실패한다(2026-09-09 감사). 광고 소재(lib/ads/image-spec.ts)와 같은 값.
 *  · 긴 변 1440px 은 인스타 권장 최대 해상도라 화질 손해가 아니다.
 *
 * 규칙이 바뀌면(채널·면을 바꾸면) **원본 파일에서 다시** 굽는다 — 구운 JPEG 를 또 구우면 q0.85 로 두 번 깎인다(옛 keepIfFit 대체).
 * 브라우저 전용(document·canvas).
 */
import type { ImageLimits } from "../publish-rules";

export type BakeError = "decode" | "encode" | "canvas";

/** 구운 JPEG 가 이보다 크면 한 단계 낮춰 다시 굽는다(버킷 상한 8MB 아래로) */
const RETRY_ABOVE_BYTES = 7.5 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode" satisfies BakeError));
    el.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * 원본(파일) → JPEG. cropped = 비율 때문에 실제로 잘랐는지(안내 문구의 장수).
 * 실패하면 Error(message = "decode" | "encode" | "canvas") 를 던진다 — 폴백 없음(안 맞춘 사진을 조용히 남기면 발행 시각에 거절당한다).
 */
export async function bakeJpeg(src: Blob, limits: ImageLimits): Promise<{ blob: Blob; width: number; height: number; cropped: boolean }> {
  const url = URL.createObjectURL(src);
  try {
    const img = await loadImage(url);
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (!sw || !sh) throw new Error("decode" satisfies BakeError);
    let cropped = false;
    const ratio = sw / sh;
    if (ratio < limits.minRatio) {
      /* 너무 세로 — 위아래를 잘라 하한 비율로 */
      sh = Math.round(sw / limits.minRatio);
      sy = Math.round((img.naturalHeight - sh) / 2);
      cropped = true;
    } else if (ratio > limits.maxRatio) {
      /* 너무 가로 — 좌우를 잘라 상한 비율로 */
      sw = Math.round(sh * limits.maxRatio);
      sx = Math.round((img.naturalWidth - sw) / 2);
      cropped = true;
    }
    const scale = Math.min(1, limits.maxLongSidePx / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas" satisfies BakeError);
    /* JPEG 엔 알파가 없다 — PNG 투명 영역이 검게 구워지지 않게 흰 바탕을 먼저 깐다(캔버스 fillStyle 은 CSS 토큰을 못 읽는다) */
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    let blob = await toBlob(canvas, 0.85);
    if (blob && blob.size > RETRY_ABOVE_BYTES) blob = await toBlob(canvas, 0.72);
    /* 캔버스 한도를 넘으면(iOS) 예외 없이 null·빈 Blob 이 온다 — 빈 사진을 올리느니 실패로 닫는다 */
    if (!blob || blob.size === 0 || blob.type !== "image/jpeg" || blob.size > limits.maxBytes) throw new Error("encode" satisfies BakeError);
    return { blob, width: canvas.width, height: canvas.height, cropped };
  } finally {
    URL.revokeObjectURL(url);
  }
}
