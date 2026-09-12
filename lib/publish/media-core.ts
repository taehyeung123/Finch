/**
 * 발행 미디어 모델의 순수 부분 — 저장 모양·경로 검증·옛 행 읽기 (2026-09-11 영상 발행).
 *
 * 저장 모양(scheduled_posts.media jsonb, 0093):
 *   [{ kind: 'image'|'video', path: '<uid>/<uuid>.jpg|mp4|mov', cover_path: '<uid>/<uuid>.jpg'|null,
 *      thumb_offset_ms, duration_ms, width, height, bytes }]
 *   path·cover_path 는 publish-media 버킷(비공개) 객체 경로다. URL 은 저장하지 않는다 — 발행 때 짧은 서명 URL 을 만든다.
 * 옛 행(0093 이전·스튜디오 카드뉴스)은 media 가 null 이고 image_urls 에 cardnews 공개 URL 이 있다.
 *
 * DB 체크(publish_media_shape_ok)와 **같은 규칙**을 코드도 스스로 본다 — DB 를 거치지 않은 값(목데이터·
 * 옛 행)도 이 함수를 지나야 메타에 나간다.
 * 이 파일은 런타임 import 가 없다 — Node 검사가 그대로 읽는다(server-only 부분은 media.ts).
 */
import type { MediaKind, PublishUploadKind } from "../publish-rules";

export const PUBLISH_MEDIA_BUCKET = "publish-media";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const USER_ID_RE = new RegExp(`^${UUID}$`);

/** 업로드 종류별 확장자 — 서버가 경로를 정할 때와 검증할 때 같은 표를 쓴다 */
export const EXT_BY_KIND: Record<PublishUploadKind, readonly string[]> = {
  image: ["jpg"],
  cover: ["jpg"],
  video: ["mp4", "mov"],
};

/**
 * publish-media 경로가 **이 사용자 것이고 모양이 맞는가** — `startsWith` 가 아니라 전체 모양으로 본다.
 * 경로는 서버가 `${uid}/${uuid}.${ext}` 로만 만든다(한 단계 — 계정 삭제·고아 점검이 한 단계만 훑는다).
 */
export function isOwnMediaPath(path: unknown, userId: string, kind?: PublishUploadKind): path is string {
  if (typeof path !== "string" || !USER_ID_RE.test(userId)) return false;
  const exts = kind ? EXT_BY_KIND[kind] : ["jpg", "mp4", "mov"];
  return new RegExp(`^${userId}/${UUID}\\.(${exts.join("|")})$`).test(path);
}

export interface StoredMediaItem {
  kind: MediaKind;
  path: string;
  cover_path: string | null;
  thumb_offset_ms: number | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

function numOrNull(v: unknown, max: number): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) return NaN;
  return Math.round(v);
}

/**
 * media jsonb → 항목 목록. 하나라도 모양이 틀리면 null(«모른다» — 일부만 골라 발행하지 않는다).
 * 빈 배열도 null 이다(미디어 없는 글은 media 가 null 이어야 한다, 0093 체크).
 */
export function parseStoredMedia(raw: unknown, userId: string): StoredMediaItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null;
  const out: StoredMediaItem[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (!e || typeof e !== "object") return null;
    const o = e as Record<string, unknown>;
    const kind = o.kind;
    if (kind !== "image" && kind !== "video") return null;
    if (!isOwnMediaPath(o.path, userId, kind)) return null;
    if (seen.has(o.path)) return null;
    seen.add(o.path);
    let cover: string | null = null;
    if (o.cover_path !== null && o.cover_path !== undefined) {
      if (kind !== "video" || !isOwnMediaPath(o.cover_path, userId, "cover")) return null;
      cover = o.cover_path;
    }
    const thumb = numOrNull(o.thumb_offset_ms, 15 * 60_000);
    const duration = numOrNull(o.duration_ms, 24 * 3600_000);
    const width = numOrNull(o.width, 100_000);
    const height = numOrNull(o.height, 100_000);
    const bytes = numOrNull(o.bytes, 5 * 1024 * 1024 * 1024);
    if ([thumb, duration, width, height, bytes].some((n) => Number.isNaN(n))) return null;
    if (kind === "image" && thumb !== null) return null;
    out.push({ kind, path: o.path, cover_path: cover, thumb_offset_ms: thumb, duration_ms: duration, width, height, bytes });
  }
  return out;
}

/** 옛 cardnews 공개 URL 의 경로 머리 */
const CARDNEWS_PREFIX = "/storage/v1/object/public/cardnews/";

/**
 * 옛 행의 cardnews 공개 URL → 객체 경로. **확신할 때만** 돌려준다(아니면 null).
 *
 * 2026-09-11 점검: 예전 검증은 표지 문자열을 URL **어디서든**(쿼리 포함) 찾았다 —
 *   https://<프로젝트>.supabase.co/<아무 경로>?x=/storage/v1/object/public/cardnews/<uid>/a.jpg
 * 가 통과해 메타가 우리 오리진의 **다른 경로**를 가져갔다. 이제 오리진·경로 전체를 맞추고, 쿼리·조각이 있으면 거절하며,
 * 메타에는 이 경로로 **다시 조립한** URL 만 보낸다(media.ts mintFetchUrls).
 */
export function legacyCardnewsPath(url: unknown, userId: string, supabaseOrigin: string): string | null {
  if (typeof url !== "string" || !supabaseOrigin || !USER_ID_RE.test(userId)) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== supabaseOrigin || u.search !== "" || u.hash !== "" || u.username || u.password) return null;
  if (!u.pathname.startsWith(CARDNEWS_PREFIX)) return null;
  let path: string;
  try {
    path = decodeURIComponent(u.pathname.slice(CARDNEWS_PREFIX.length));
  } catch {
    return null;
  }
  /* 스튜디오: <uid>/<batch uuid>/01.jpg · 옛 컴포저: <uid>/<uuid>.jpg — 둘 다 이 문자 집합 안이다 */
  if (!new RegExp(`^${userId}/[0-9a-f/-]+(\\.[a-z]{3,4})?(/[0-9]{2}\\.(jpg|png))?$`).test(path)) return null;
  if (path.includes("..") || path.includes("//")) return null;
  if (!/\.(jpg|jpeg|png|webp)$/.test(path)) return null;
  return path;
}

/** 엔진이 다루는 항목 — 발행 때 URL 을 만드는 재료 */
export type ResolvedItem =
  | {
      source: "publish-media";
      kind: MediaKind;
      path: string;
      thumbOffsetMs: number | null;
      durationMs: number | null;
      bytes: number | null;
    }
  | { source: "legacy"; kind: "image"; path: string };

/**
 * 게시물 행 → 발행할 항목들. media 가 있으면 그것만, 없으면 옛 image_urls(cardnews)를 읽는다.
 * 스레드 글 전용(둘 다 비어 있음)은 items=[] 로 통과한다.
 */
export function resolvePostItems(
  row: { user_id: string; media: unknown; image_urls: string[] | null },
  supabaseOrigin: string,
): { ok: true; items: ResolvedItem[] } | { ok: false; code: "MEDIA_INVALID" } {
  const legacy = Array.isArray(row.image_urls) ? row.image_urls : [];
  if (row.media !== null && row.media !== undefined) {
    if (legacy.length > 0) return { ok: false, code: "MEDIA_INVALID" };
    const parsed = parseStoredMedia(row.media, row.user_id);
    if (!parsed) return { ok: false, code: "MEDIA_INVALID" };
    return {
      ok: true,
      items: parsed.map((m) => ({
        source: "publish-media" as const,
        kind: m.kind,
        path: m.path,
        thumbOffsetMs: m.thumb_offset_ms,
        durationMs: m.duration_ms,
        bytes: m.bytes,
      })),
    };
  }
  const items: ResolvedItem[] = [];
  for (const u of legacy) {
    const path = legacyCardnewsPath(u, row.user_id, supabaseOrigin);
    if (!path) return { ok: false, code: "MEDIA_INVALID" };
    items.push({ source: "legacy", kind: "image", path });
  }
  return { ok: true, items };
}

/**
 * 목록 썸네일로 쓸 객체 — 첫 항목이 사진이면 그 경로, 영상이면 커버 경로(없으면 null → 화면이 필름 아이콘).
 * 옛 행은 image_urls[0] 공개 URL 을 그대로 쓴다(url).
 */
export function thumbSource(
  row: { user_id: string; media: unknown; image_urls: string[] | null },
): { path: string } | { url: string } | null {
  if (row.media !== null && row.media !== undefined) {
    const parsed = parseStoredMedia(row.media, row.user_id);
    const first = parsed?.[0];
    if (!first) return null;
    if (first.kind === "image") return { path: first.path };
    return first.cover_path ? { path: first.cover_path } : null;
  }
  const u = Array.isArray(row.image_urls) ? row.image_urls[0] : null;
  return typeof u === "string" && /^https:\/\//.test(u) ? { url: u } : null;
}
