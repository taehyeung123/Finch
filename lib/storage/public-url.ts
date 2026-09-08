import "server-only";

/*
  Storage 공개 URL → 객체 경로.

  왜 필요한가 (2026-09-08 보안 감사): 우리는 업로드한 파일의 **절대 URL** 을 DB 에 굳혀 둔다
  (scheduled_posts.image_urls, link_blocks.data.imagePath …). 그래서 «이 행을 지울 때 같이 지울 객체»를
  찾으려면 URL 에서 경로를 되짚어야 한다.

  ⚠️ 되짚기에 실패하면 **«참조가 없다»가 아니라 «모른다»** 로 다뤄야 한다.
  커스텀 도메인·프록시가 붙거나 Supabase 가 URL 모양을 바꾸면 이 파싱이 어긋나는데,
  그때 «참조 없음»으로 단정하면 살아 있는 고객 파일을 지우게 된다. Storage 삭제는 되돌릴 수 없고
  백업도 없다. 그래서 이 함수는 확신할 때만 경로를 돌려주고, 아니면 null 이다.

  소유 확인도 여기서 한다 — 경로가 `${userId}/` 로 시작하지 않으면 남의 파일이므로 손대지 않는다.
*/

/** 공개 URL 안에서 버킷 뒤 경로가 시작되는 지점 */
const PUBLIC_MARKER = "/storage/v1/object/public/";

/**
 * 공개 URL 하나 → 그 버킷 안의 객체 경로. 확신할 수 없으면 null.
 *
 * @param url     DB 에 저장된 절대 URL
 * @param bucket  기대하는 버킷 이름(다른 버킷이면 null)
 * @param userId  이 사용자 폴더 아래여야 한다(아니면 null)
 */
export function storagePathFromPublicUrl(
  url: unknown,
  bucket: string,
  userId: string,
): string | null {
  if (typeof url !== "string" || !url) return null;
  const marker = `${PUBLIC_MARKER}${bucket}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  let path = url.slice(at + marker.length);
  /* 쿼리·프래그먼트는 경로가 아니다(?t= 캐시 버스터가 붙는 경우가 있다) */
  path = path.split("?")[0].split("#")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null; // 깨진 인코딩 — 모르는 것으로 둔다
  }
  if (!path || path.includes("..")) return null;
  if (!path.startsWith(`${userId}/`)) return null;
  return path;
}

/**
 * URL 목록 → 지워도 되는 경로 목록.
 * 되짚지 못한 항목은 **조용히 빠진다** — 지우지 않는 쪽이 안전한 실패다.
 */
export function storagePathsFromPublicUrls(
  urls: unknown,
  bucket: string,
  userId: string,
): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  for (const u of urls) {
    const p = storagePathFromPublicUrl(u, bucket, userId);
    if (p) out.push(p);
  }
  return out;
}
