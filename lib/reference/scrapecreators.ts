import "server-only";

import type { Channel, CollectSettings, ReferenceSource } from "@/lib/types";
import { PERIOD_DAYS } from "@/lib/types";

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
  /** 콘텐츠 형식 — video(영상·릴스)/photo(사진)/carousel(카드뉴스)/text(글). 형식 필터에 사용 */
  mediaFormat: "video" | "photo" | "carousel" | "text";
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
/** 반응 지표용 — 인스타는 좋아요 숨김 게시물을 -1로 내려보낸다(실측). 음수는 0으로 */
function metric(v: unknown): number {
  return Math.max(0, num(v));
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
    mediaFormat: "video", // 틱톡은 전부 영상
    views: metric(stats.play_count),
    likes: metric(stats.digg_count),
    comments: metric(stats.comment_count),
    followerCount: metric(author.follower_count),
    postedAt: createTime ? new Date(createTime * 1000).toISOString() : null,
    region: str(raw.region) || null,
  };
}

/** IG 형식 판별 — 실측 필드(is_video·product_type·__typename) 기준 */
function igFormat(raw: Json): CollectedPost["mediaFormat"] {
  if (raw.is_video === true || str(raw.product_type) === "clips" || num(raw.media_type) === 2) return "video";
  if (str(raw.__typename).includes("Sidecar") || num(raw.media_type) === 8 || Array.isArray(raw.carousel_media))
    return "carousel";
  return "photo";
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
    mediaFormat: igFormat(raw),
    // play_count가 사용자가 아는 "조회수"에 가깝다 (실측: view 245 vs play 956 — view는 3초 이상 시청)
    views: metric(raw.video_play_count) || metric(raw.video_view_count),
    likes: metric(raw.like_count),
    comments: metric(raw.comment_count),
    followerCount: metric(owner.follower_count),
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
    mediaFormat: igFormat(raw),
    views: metric(raw.play_count) || metric(raw.ig_play_count),
    likes: metric(raw.like_count),
    comments: metric(raw.comment_count),
    /* 0 = 모름 (레포 규약, 216행·apify.ts:53과 동일). 이 엔드포인트의 user 객체에는
       follower_count가 아예 없다 — 2026-08-09 실측 키: pk·id·full_name·is_private·
       is_verified·profile_pic_url·username 등뿐. 따라서 이 경로로 들어온 게시물은
       "팔로워 대비 조회수"를 계산할 수 없고, 표시부가 followerCount > 0으로 가드해
       지표 자체를 숨긴다(0을 분모로 쓰지 않는다).
       실제 팔로워 수가 필요하면 /v1/instagram/profile을 계정당 1콜 따로 태워야 한다
       (실측 확인: medicube_korea → 213,790). 브랜드 아카이브 단계에서 도입 예정. */
    followerCount: 0,
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
    mediaFormat: Array.isArray(raw.video_versions) && (raw.video_versions as unknown[]).length > 0
      ? "video"
      : imageCandidates.length > 0
        ? "photo"
        : "text",
    views: 0, // Threads는 조회수를 공개하지 않는다 — 0이면 UI에서 숨긴다 (지어내지 않음)
    likes: metric(raw.like_count),
    comments: metric(tpInfo.direct_reply_count) || metric(raw.direct_reply_count),
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

/* IG 서버 필터는 주/월/년 단위만 지원 — 3·6개월은 최근 1년으로 넓게 받고 후처리로 정확히 거른다 */
const IG_DATE_POSTED: Record<Exclude<CollectSettings["period"], "all">, string> = {
  "7d": "last-week",
  "1m": "last-month",
  "3m": "last-year",
  "6m": "last-year",
  "1y": "last-year",
};

/**
 * 수집 기준 1개당 API 1회 호출 → 정규화된 게시물 목록.
 * TikTok은 한국(KR) 리전 결과를 앞으로 정렬한다(검색 결과에 해외 콘텐츠가 섞이는 실측 특성 보정).
 * 기간·형식 필터는 공급사가 지원하는 채널(IG 기간·릴스, Threads 기간)만 서버 파라미터로 밀고,
 * 나머지는 호출부(runCollection)가 후처리로 거른다.
 */
export async function collectFromSource(
  source: Pick<ReferenceSource, "channel" | "kind" | "value">,
  limit: number,
  filters?: Pick<CollectSettings, "period" | "mediaFormat"> & {
    /** AI 확장 검색어 — IG 키워드 수집에서 원 키워드와 병렬 검색해 후보 풀을 키운다 */
    queryVariants?: string[];
  },
): Promise<CollectedPost[]> {
  const period = filters?.period ?? "all";
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
      // keyword·hashtag 모두 키워드 검색으로 — 해시태그는 # 제거한 검색어가 실측상 더 잘 잡힌다.
      // 후보를 넓히기 위해 커서로 2페이지(약 60개) 수집
      const query = source.kind === "hashtag" ? bareTag : value;
      const first = await callApi("/v1/tiktok/search/keyword", { query });
      let items = itemsOf(first, "search_item_list");
      const cursor = str(first.cursor);
      if (first.has_more && cursor) {
        const second = await callApi("/v1/tiktok/search/keyword", { query, cursor }).catch(() => null);
        if (second) items = items.concat(itemsOf(second, "search_item_list"));
      }
      posts = items
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
    } else if (source.kind === "keyword" && filters?.mediaFormat !== "photo" && filters?.mediaFormat !== "carousel") {
      // 키워드는 IG 자체 검색 랭킹을 타는 릴스 검색이 해시태그 피드보다 관련도가 훨씬 높다
      // (실측: 해시태그 피드는 태그 도배 홍보물 위주). 원 키워드 4페이지 + AI 확장 검색어
      // 각 2페이지를 병렬 수집 — 실측('웨딩'): 확장 없이는 최고 ~30만 뷰가 한계, 확장 검색어
      // ('결혼식' 등)를 섞어야 100만+ 바이럴이 후보에 들어온다.
      const datePosted = period !== "all" ? IG_DATE_POSTED[period] : null;
      const variants = (filters?.queryVariants ?? []).slice(0, 3);
      const requests: { query: string; page: string }[] = [
        ...["1", "2", "3", "4"].map((page) => ({ query: value, page })),
        ...variants.flatMap((v) => ["1", "2"].map((page) => ({ query: v, page }))),
      ];
      const pages = await Promise.all(
        requests.map(({ query, page }) => {
          const params: Record<string, string> = { query, page };
          if (datePosted) params.date_posted = datePosted;
          return callApi("/v2/instagram/reels/search", params).catch(() => null);
        }),
      );
      posts = pages
        .filter((d): d is Json => d !== null)
        .flatMap((d) => itemsOf(d, "reels"))
        .map(normalizeIgHashtagPost) // 릴스 검색 응답은 해시태그 검색과 같은 필드 구조 (공식 문서 확인)
        .filter((p): p is CollectedPost => p !== null);
      if (posts.length === 0) throw new CollectError("provider_error", "IG 릴스 검색 결과 없음");
    } else {
      // 해시태그 소스(또는 사진·캐러셀 형식 필터)는 해시태그 피드 — 커서로 2페이지 수집
      const tag = source.kind === "hashtag" ? bareTag : value.replace(/\s+/g, "");
      const params: Record<string, string> = {
        hashtag: tag,
        // 릴스만 필터는 IG가 서버에서 지원 — 사진·캐러셀은 후처리로 거른다
        media_type: filters?.mediaFormat === "video" ? "reels" : "all",
      };
      if (period !== "all") params.date_posted = IG_DATE_POSTED[period];
      const first = await callApi("/v1/instagram/search/hashtag", params);
      let all = itemsOf(first, "posts");
      const cursor = str(first.cursor);
      if (cursor) {
        const second = await callApi("/v1/instagram/search/hashtag", { ...params, cursor }).catch(() => null);
        if (second) all = all.concat(itemsOf(second, "posts"));
      }
      posts = all.map(normalizeIgHashtagPost).filter((p): p is CollectedPost => p !== null);
    }
  } else {
    // threads
    if (source.kind === "account") {
      const data = await callApi("/v1/threads/user/posts", { handle: bareHandle });
      posts = itemsOf(data, "posts")
        .map((x) => normalizeThreadsPost(x, bareHandle))
        .filter((p): p is CollectedPost => p !== null);
    } else {
      const params: Record<string, string> = { query: source.kind === "hashtag" ? bareTag : value };
      const periodDays = PERIOD_DAYS[period];
      if (periodDays !== null) {
        params.start_date = new Date(Date.now() - periodDays * 86_400_000).toISOString().slice(0, 10);
      }
      const data = await callApi("/v1/threads/search", params);
      posts = itemsOf(data, "posts")
        .map((x) => normalizeThreadsPost(x, null))
        .filter((p): p is CollectedPost => p !== null);
    }
  }

  return posts.slice(0, limit);
}

/**
 * 릴스 대본 추출 (인스타그램 전용) — 음성 받아쓰기. 2분 미만 영상만, 10~30초 소요.
 * 공급사 캐시(7일)를 쓰므로 같은 게시물 재요청은 크레딧이 들지 않는다.
 */
export async function fetchIgTranscript(postUrl: string): Promise<string | null> {
  const data = await callApi("/v2/instagram/media/transcript", { url: postUrl, cache_max_age: "7d" });
  const arr = Array.isArray(data.transcripts) ? (data.transcripts as Json[]) : [];
  const texts = arr.map((t) => str(t.text)).filter((t) => t.length > 0);
  return texts.length > 0 ? texts.join("\n\n") : null;
}
