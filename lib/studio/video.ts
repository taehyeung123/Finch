"use client";

/**
 * 모션 카드뉴스 영상 — 화면에 보이는 카드 이미지들을 슬라이드쇼 영상(webm)으로 만든다.
 *
 * 완전히 브라우저 안에서 처리한다(서버·API 비용 0). MediaRecorder + canvas.captureStream으로
 * 실시간 녹화하므로 영상 길이만큼(≈장수×2.4초) 시간이 걸린다.
 *
 * 규격 주의: MediaRecorder는 webm(VP9/VP8)만 안정적으로 뽑는다. webm은 다운로드·타 채널엔
 * 쓸 수 있지만 인스타그램 릴스 자동 발행(mp4/h264 필요)엔 못 올린다 — 그건 서버 변환이 필요해
 * 후속 과제다(docs 참고). 지금은 "영상으로 저장(다운로드)"까지 제공한다.
 */

const SIZE = 1080;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function pickMime(): string {
  const cands = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const m of cands) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

export function isVideoSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

/** 정사각 이미지를 캔버스에 켄번즈(느린 줌 1.0→1.05)로 그린다. progress 0~1. */
function drawKenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, progress: number, alpha = 1) {
  const scale = 1 + 0.05 * Math.max(0, Math.min(1, progress));
  const s = SIZE * scale;
  const off = -(s - SIZE) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, off, off, s, s);
  ctx.restore();
}

/**
 * 이미지 배열(data URL 또는 URL)을 슬라이드쇼 영상 Blob(webm)으로 만든다.
 * perSlideMs: 장당 지속 시간, fadeMs: 다음 장으로 넘어가는 크로스페이드 길이.
 */
export async function renderImagesToVideo(
  urls: string[],
  opts?: { perSlideMs?: number; fadeMs?: number },
): Promise<Blob> {
  if (!isVideoSupported()) throw new Error("video_unsupported");
  const imgs = await Promise.all(urls.filter(Boolean).map(loadImage));
  if (imgs.length === 0) throw new Error("no_images");

  const perSlide = opts?.perSlideMs ?? 2400;
  const fade = opts?.fadeMs ?? 450;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");
  // 첫 프레임을 미리 그려 스트림 시작 시 검은 화면을 피한다
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);
  drawKenBurns(ctx, imgs[0], 0);

  const stream = canvas.captureStream(30);
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  rec.start();
  const start = performance.now();
  const total = perSlide * imgs.length;

  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const t = now - start;
      if (t >= total) {
        resolve();
        return;
      }
      const i = Math.min(imgs.length - 1, Math.floor(t / perSlide));
      const localT = t - i * perSlide;
      ctx!.fillStyle = "#000";
      ctx!.fillRect(0, 0, SIZE, SIZE);
      drawKenBurns(ctx!, imgs[i], localT / perSlide);
      // 마지막 fade 구간에 다음 장을 겹쳐 크로스페이드
      if (i < imgs.length - 1 && localT > perSlide - fade) {
        const a = (localT - (perSlide - fade)) / fade;
        drawKenBurns(ctx!, imgs[i + 1], 0, a);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  rec.stop();
  return stopped;
}

/** 영상 Blob을 파일로 다운로드 */
export function downloadVideo(blob: Blob, filename = "finch-cardnews.webm") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
