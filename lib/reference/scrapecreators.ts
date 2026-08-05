import "server-only";

import type { Channel, ReferenceSource } from "@/lib/types";

/*
  ScrapeCreators 어댑터 — 레퍼런스 수집 엔진의 공급사 계층.
  (2026-08 실측 검증: 엔드포인트·응답 필드는 라이브 호출과 docs.scrapecreators.com/*.md 기준)

  설계 원칙:
  - 이 파일만이 공급사 API 형태를 안다. 밖으로는 CollectedPost 정규형만 내보낸다
    → 공급사 교체(Apify 등) 시 이 파일만 갈아끼운다 (법률 검토 결론: 최대 리스크는
    소송이 아니라 공급 중단이므로 어댑터 분리가 필수).
  - 비로그인 공개 데이터만 수집한다. 로그인 월 뒤 데이터(스토리 등)는 요청하지 않는다.
  - 요청당 1크레딧 과금이므로 호출 수는 항상 호출부에서 상한을 건다.
*/

export interface CollectedPost {
  channel: Channel;
  /** 플랫폼 게시물 고유 ID — 중복 수집 방지 키 */
  externalId: string;
  caption: string;
  creatorHandle: string;
  /** 원본 게시물 링크 — 저작권 안전장치(요약+출처 링크 구조)의 핵심 */
  url: string | null;
  /** 공급사 CDN 썸네일 URL — 서명 만료가 있어 수집 시점에 Storage로 캐시해서 쓴다 */
  thumbnailUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  followerCount: number;
  postedAt: string | null;
  region: string | null;
}

export type CollectFailReason = "no_key" | "out_of_credits" | "provider_error";

export class CollectError extends Error {
  constructor(
    public reason: CollectFailReason,
    message: string,
  ) {
    super(message);
    this.name = "CollectError";
  }
}

const BASE = "https://api.scrapecreators.com";
const TIMEOUT_MS = 45_000;

export function isCollectionConfigured(): boolean {
  return Boolean(process.env.SCRAPECREATORS_API_KEY);
}

async function callApi(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) throw new CollectError("no_key", "SCRAPECREATORS_API_KEY 미설정");

  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new CollectError("provider_error", `공급사 호출 실패: ${e instanceof Error ? e.message : "network"}`);
  }
  if (res.status === 402) {
    throw new CollectError("out_of_credits", "공급사 크레딧 소진");
  }
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new CollectError("provider_error", `응답 파싱 실패 (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    throw new CollectError("provider_error", `공급사 오류: ${msg}`);
  }
  return data;
}

/* ---------- 채널별 정규화 ---------- */

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type Json = Record<string, unknown>;

/** TikTok: search_item_list[].aweme_info 또는 aweme_list[] */
function normalizeTiktok(raw: Json): CollectedPost | null {
  const id = str(raw.aweme_id);
  if (!id) return null;
  const author = (raw.author ?? {}) as Json;
  const stats = (raw.statistics ?? {}) as Json;
  const video = (raw.video ?? {}) as Json;
  const cover = (video.cover ?? {}) as Json;
  const coverUrls = Array.isArray(cover.url_list) ? (cover.url_list as unknown[]) : [];
  const createTime = num(raw.create_time);
  return {
    channel: "tiktok",
    externalId: id,
    caption: str(raw.desc),
    creatorHandle: author.unique_id ? `@${str(author.unique_id)}` : "",
    url: str(raw.share_url) || str(raw.url) || null,
    thumbnailUrl: str(coverUrls[0]) || null,
    views: num(stats.play_count),
    likes: num(stats.digg_count),
    comments: num(stats.comment_count),
    followerCount: num(author.follower_count),
    postedAt: createTime ? new Date(createTime * 1000).toISOString() : null,
    region: str(raw.region) || null,
  };
}

/** Instagram 해시태그 검색: posts[] (caption은 문자열) */
function normalizeIgHashtagPost(raw: Json): CollectedPost | null {
  const id = str(raw.id) || str(raw.shortcode);
  if (!id) return null;
  const owner = (raw.owner ?? {}) as Json;
  return {
    channel: "instagram",
    externalId: id,
    caption: typeof raw.caption === "string" ? raw.caption : str((raw.caption as Json | undefined)?.text),
    creatorHandle: owner.username ? `@${str(owner.username)}` : "",
    url: str(raw.url) || (raw.shortcode ? `https://www.instagram.com/p/${str(raw.shortcode)}/` : null),
    thumbnailUrl: str(raw.thumbnail_src) || str(raw.display_url) || null,
    // play_count가 사용자가 아는 "조회수"에 가깝다 (실측: view 245 vs play 956 — view는 3초 이상 시청)
    views: num(raw.video_play_count) || num(raw.video_view_count),
    likes: num(raw.like_count),
    comments: num(raw.comment_count),
    followerCount: num(owner.follower_count),
    postedAt: str(raw.taken_at) || null,
    region: null,
  };
}

/** Instagram 계정 게시물: items[] (caption은 {text}) */
function normalizeIgUserPost(raw: Json, handle: string): CollectedPost | null {
  const id = str(raw.id) || str(raw.code);
  if (!id) return null;
  const user = (raw.user ?? raw.owner ?? {}) as Json;
  const caption = raw.caption as Json | string | undefined;
  const takenAt = num(raw.taken_at);
  return {
    channel: "instagram",
    externalId: id,
    caption: typeof caption === "string" ? caption : str(caption?.text),
    creatorHandle: user.username ? `@${str(user.username)}` : `@${handle}`,
    url: str(raw.url) || (raw.code ? `https://www.instagram.com/p/${str(raw.code)}/` : null),
    thumbnailUrl: str(raw.display_uri) || str(raw.thumbnail_src) || str(raw.display_url) || null,
    views: num(raw.play_count) || num(raw.ig_play_count),
    likes: num(raw.like_count),
    comments: num(raw.comment_count),
    followerCount: num(user.follower_count),
    postedAt: takenAt ? new Date(takenAt * 1000).toISOString() : str(raw.taken_at) || null,
    region: null,
  };
}

/** Threads: posts[] (caption.text, 답글 수는 text_post_app_info 안 — 실측 검증) */
function normalizeThreadsPost(raw: Json, fallbackHandle: string | null): CollectedPost | null {
  const id = str(raw.pk) || str(raw.id);
  if (!id) return null;
  const user = (raw.user ?? {}) as Json;
  const tpInfo = (raw.text_post_app_info ?? {}) as Json;
  const caption = raw.caption as Json | undefined;
  const username = str(user.username) || (fallbackHandle ?? "");
  const code = str(raw.code);
  const takenAt = num(raw.taken_at);
  const imageCandidates = ((raw.image_versions2 as Json | undefined)?.candidates ?? []) as Json[];
  return {
    channel: "threads",
    externalId: id,
    caption: str(caption?.text),
    creatorHandle: username ? `@${username.replace(/^@/, "")}` : "",
    url: username && code ? `https://www.threads.net/@${username.replace(/^@/, "")}/post/${code}` : null,
    thumbnailUrl: str(imageCandidates[0]?.url) || null, // 텍스트 글이면 null — 카드에서 글리프 표시
    views: 0, // Threads는 조회수를 공개하지 않는다 — 0이면 UI에서 숨긴다 (지어내지 않음)
    likes: num(raw.like_count),
    comments: num(tpInfo.direct_reply_count) || num(raw.direct_reply_count),
    followerCount: 0, // 검색 응답의 user 객체에 팔로워 수 없음 (실측) — 지어내지 않음
    postedAt: takenAt ? new Date(takenAt * 1000).toISOString() : null,
    region: null,
  };
}

/* ---------- 소스별 수집 (요청 1회 = 1크레딧) ---------- */

function itemsOf(data: Json, field: string): Json[] {
  const arr = data[field];
  return Array.isArray(arr) ? (arr as Json[]) : [];
}

/**
 * 수집 기준 1개당 API 1회 호출 → 정규화된 게시물 목록.
 * TikTok은 한국(KR) 리전 결과를 앞으로 정렬한다(검색 결과에 해외 콘텐츠가 섞이는 실측 특성 보정).
 */
export async function collectFromSource(
  source: Pick<ReferenceSource, "channel" | "kind" | "value">,
  limit: number,
): Promise<CollectedPost[]> {
  const value = source.value.trim();
  const bareHandle = value.replace(/^@/, "");
  const bareTag = value.replace(/^#/, "");
  let posts: CollectedPost[] = [];

  if (source.channel === "tiktok") {
    if (source.kind === "account") {
      const data = await callApi("/v3/tiktok/profile/videos", {
        handle: bareHandle,
        sort_by: "popular",
        region: "KR",
      });
      posts = itemsOf(data, "aweme_list").map(normalizeTiktok).filter((p): p is CollectedPost => p !== null);
    } else {
      // keyword·hashtag 모두 키워드 검색으로 — 해시태그는 # 제거한 검색어가 실측상 더 잘 잡힌다
      const data = await callApi("/v1/tiktok/search/keyword", { query: source.kind === "hashtag" ? bareTag : value });
      posts = itemsOf(data, "search_item_list")
        .map((x) => normalizeTiktok((x.aweme_info ?? {}) as Json))
        .filter((p): p is CollectedPost => p !== null);
      // KR 리전 우선 정렬(안정 정렬 — 리전 내 원래 순위 유지)
      posts = [...posts.filter((p) => p.region === "KR"), ...posts.filter((p) => p.region !== "KR")];
    }
  } else if (source.channel === "instagram") {
    if (source.kind === "account") {
      const data = await callApi("/v2/instagram/user/posts", { handle: bareHandle });
      posts = itemsOf(data, "items")
        .map((x) => normalizeIgUserPost(x, bareHandle))
        .filter((p): p is CollectedPost => p !== null);
    } else {
      // keyword는 공백 제거해 해시태그 검색으로 수집 (IG는 순수 키워드 게시물 검색이 없다)
      const tag = source.kind === "hashtag" ? bareTag : value.replace(/\s+/g, "");
      const data = await callApi("/v1/instagram/search/hashtag", {
        hashtag: tag,
        media_type: "all",
        date_posted: "last-month",
      });
      posts = itemsOf(data, "posts").map(normalizeIgHashtagPost).filter((p): p is CollectedPost => p !== null);
    }
  } else {
    // threads
    if (source.kind === "account") {
      const data = await callApi("/v1/threads/user/posts", { handle: bareHandle });
      posts = itemsOf(data, "posts")
        .map((x) => normalizeThreadsPost(x, bareHandle))
        .filter((p): p is CollectedPost => p !== null);
    } else {
      const data = await callApi("/v1/threads/search", { query: source.kind === "hashtag" ? bareTag : value });
      posts = itemsOf(data, "posts")
        .map((x) => normalizeThreadsPost(x, null))
        .filter((p): p is CollectedPost => p !== null);
    }
  }

  return posts.slice(0, limit);
}
