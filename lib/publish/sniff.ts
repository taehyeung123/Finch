/**
 * 파일 첫 바이트로 형식을 가른다 — 확장자·브라우저 MIME 은 거짓말을 할 수 있다.
 * 서버(finalizePublishUploads — 올린 뒤 첫 64바이트만 범위 요청으로 읽는다)와 브라우저(mp4-inspect-core 가 다시 내보낸다)가 같은 함수를 쓴다.
 * 이 파일은 import 가 없다 — Node 검사가 그대로 읽는다.
 */

/**
 * jpeg = FF D8 FF / iso-bmff = MP4·MOV(QuickTime) / null = 모름.
 * ⚠️ 옛 QuickTime 파일은 첫 상자가 ftyp 가 아니라 wide·free·mdat·moov·skip·pnot 일 수 있다 — 그것도 iso-bmff 로 본다.
 */
export function sniffContainer(head: Uint8Array): "jpeg" | "iso-bmff" | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.length >= 8) {
    const type = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (type === "ftyp" || type === "wide" || type === "free" || type === "mdat" || type === "moov" || type === "skip" || type === "pnot") {
      return "iso-bmff";
    }
  }
  return null;
}
