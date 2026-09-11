/* service_role 로 비공개 버킷 서명 URL 을 만든다 — 서버 전용 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLISH_MEDIA_BUCKET, thumbSource } from "@/lib/publish/media-core";

/** 목록 썸네일 서명 수명 — 화면을 한 시간 켜 둬도 깨지지 않게 */
const THUMB_TTL_S = 3600;

let warnedNoAdmin = false;

/**
 * 목록 썸네일 — 글 id → 보여 줄 URL(없으면 null).
 * · 새 글: 첫 항목이 사진이면 그 사진, 영상이면 커버 JPEG(publish-media 는 비공개라 서명 URL — 한 번에 묶어 만든다)
 * · 옛 글: image_urls[0](cardnews 공개 URL) 그대로
 * 경로는 그 사용자 폴더 모양이어야 한다(media-core isOwnMediaPath). 믿는 순서: 세션 조회(RLS)가 이미 본인 행임을 증명했다.
 *
 * 서명이 실패하면 그 썸네일만 null(화면은 중립 아이콘) — 표시용이지 데이터가 아니다. 결과는 **경로로** 맞춘다(순서를 믿지 않는다).
 */
export async function signPostThumbs(
  admin: SupabaseClient | null,
  rows: Array<{ id: string; media: unknown; image_urls: string[] | null }>,
  userId: string,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const wantPath = new Map<string, string>();
  for (const r of rows) {
    const src = thumbSource({ user_id: userId, media: r.media, image_urls: r.image_urls });
    if (!src) out.set(r.id, null);
    else if ("url" in src) out.set(r.id, src.url);
    else wantPath.set(r.id, src.path);
  }
  if (wantPath.size === 0) return out;
  if (!admin) {
    if (!warnedNoAdmin) {
      warnedNoAdmin = true;
      console.error("[publish] 썸네일 서명 불가 — 서버 자격증명 미설정");
    }
    for (const id of wantPath.keys()) out.set(id, null);
    return out;
  }
  const unique = [...new Set(wantPath.values())];
  const { data, error } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).createSignedUrls(unique, THUMB_TTL_S);
  const byPath = new Map<string, string>();
  if (error || !data) {
    console.error("[publish] 썸네일 서명 실패:", error?.message ?? "no data");
  } else {
    for (const d of data) if (d.path && d.signedUrl && !d.error) byPath.set(d.path, d.signedUrl);
  }
  for (const [id, path] of wantPath) out.set(id, byPath.get(path) ?? null);
  return out;
}
