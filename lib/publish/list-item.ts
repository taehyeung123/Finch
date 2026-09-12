/**
 * 발행 목록 한 줄 만들기 — DB 행 → 화면 모양(PublishListItem). 발행 화면·데모 데이터가 같은 모양을 쓴다.
 * 이 파일은 런타임 import 가 없다(타입만) — Node 검사가 그대로 읽는다.
 */
import type { PostStatus, PublishListItem } from "../types";
import type { IgSurface } from "../publish-rules";

/** 목록 조회에 쓰는 컬럼 — page.tsx 두 쿼리가 같은 목록을 쓴다 */
export const LIST_POST_COLUMNS =
  "id, user_id, caption, channel, image_urls, media, ig_surface, scheduled_at, published_at, publish_after, publish_attempted_at, status, error, permalink, media_purged_at, " +
  "account_platform_id, account_handle, claimed_at";

export interface ListPostRow {
  id: string;
  user_id: string;
  caption: string | null;
  channel: string | null;
  image_urls: string[] | null;
  media: unknown;
  ig_surface: string | null;
  scheduled_at: string;
  published_at: string | null;
  publish_after: string | null;
  publish_attempted_at: string | null;
  status: string;
  error: string | null;
  permalink: string | null;
  media_purged_at: string | null;
  /** 대상 계정(0094) — 화면에 보일 계정은 page.tsx 가 account-core postAccountView 로 정해 넘긴다 */
  account_platform_id?: string | null;
  account_handle?: string | null;
  /** 이번 실행이 선점한 시각(0093) — 올리는 중인 글이 «멈췄나»를 목록이 판단한다(lib/publish/progress.ts) */
  claimed_at?: string | null;
}

/** 목록 한 줄의 계정(account-core PostAccountView 와 같은 모양 — 이 파일은 런타임 import 를 하지 않는다) */
export interface ListAccount {
  handle: string | null;
  previous: boolean;
}

const STATUSES: ReadonlySet<string> = new Set(["draft", "scheduled", "publishing", "processing", "published", "failed", "canceled"]);
const SURFACES: ReadonlySet<string> = new Set(["feed", "reels", "story"]);

/**
 * 게시물 링크는 **인스타·스레드 주소만** 믿는다 — 메타가 준 값이라도 기록·표시 두 번 거른다(2026-09-11 점검).
 * 목록은 이 주소를 새 탭으로 연다. 다른 호스트가 들어오면(데이터 손상·잘못된 응답) 링크를 숨긴다.
 */
export function safePermalink(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    const ok = ["instagram.com", "www.instagram.com", "threads.net", "www.threads.net", "threads.com", "www.threads.com"].includes(h);
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}

function mediaFacts(media: unknown): { count: number; hasVideo: boolean } | null {
  if (!Array.isArray(media)) return null;
  let hasVideo = false;
  for (const m of media) if (m && typeof m === "object" && (m as { kind?: unknown }).kind === "video") hasVideo = true;
  return { count: media.length, hasVideo };
}

/**
 * 행 → 목록 한 줄.
 * · display_status: 미리 준비 중인 예약 영상(processing + 발행 시각이 아직 미래)은 «예약됨»으로 보인다 — 사용자에게는 예약이다.
 * · display_at: 발행된 글은 실제 발행 시각(published_at), 나머지는 예약 시각. 「지금 발행」이 예약 시각을 덮어쓰지 않는다(2026-09-09).
 * · can_cancel: 예약·처리 중이고 **발행을 시도한 적이 없을 때만** — 시도한 뒤엔 이미 올라갔을 수 있다(DB 가드도 같은 규칙, 0093).
 * · account: 이 글의 계정(«@아이디»·이전 계정 여부) — 지금 연결된 계정과 대조해야 해서 page.tsx 가 정해 넘긴다(없으면 표시 안 함).
 * · progress_since: 올리는 중·처리 중일 때 «언제부터»(발행 시각 — 「지금 발행」은 누른 시각). run_started_at: 올리는 중일 때 이번 실행의 선점 시각.
 *   (2026-09-12 비동기 「지금 발행」 — 목록이 «방금 시작»·«3분째»·«생각보다 오래 걸려요»를 스스로 판단한다)
 */
export function toListItem(
  row: ListPostRow,
  thumbUrl: string | null,
  nowMs: number,
  account: ListAccount = { handle: null, previous: false },
): PublishListItem {
  const status = (STATUSES.has(row.status) ? row.status : "failed") as PostStatus;
  const publishAfterMs = row.publish_after ? Date.parse(row.publish_after) : NaN;
  const prepared = status === "processing" && Number.isFinite(publishAfterMs) && publishAfterMs > nowMs;
  const facts = mediaFacts(row.media);
  const legacyCount = Array.isArray(row.image_urls) ? row.image_urls.length : 0;
  const channel = row.channel === "threads" || row.channel === "tiktok" ? row.channel : "instagram";
  return {
    id: row.id,
    caption: row.caption ?? "",
    channel,
    status,
    display_status: prepared ? "scheduled" : status,
    scheduled_at: row.scheduled_at,
    published_at: row.published_at,
    display_at: status === "published" ? (row.published_at ?? row.scheduled_at) : row.scheduled_at,
    error: row.error,
    permalink: safePermalink(row.permalink),
    thumb_url: thumbUrl,
    media_count: facts ? facts.count : legacyCount,
    has_video: facts ? facts.hasVideo : false,
    ig_surface: row.ig_surface && SURFACES.has(row.ig_surface) ? (row.ig_surface as IgSurface) : null,
    media_purged: !!row.media_purged_at,
    can_cancel: status === "scheduled" || (status === "processing" && !row.publish_attempted_at),
    publish_attempted: !!row.publish_attempted_at,
    account_handle: account.handle,
    account_previous: account.previous,
    progress_since:
      !prepared && (status === "publishing" || status === "processing") ? (row.publish_after ?? row.scheduled_at) : null,
    run_started_at: status === "publishing" ? (row.claimed_at ?? null) : null,
  };
}
