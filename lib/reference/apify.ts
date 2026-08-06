import "server-only";

import type { CollectedPost } from "@/lib/reference/scrapecreators";
import { CollectError } from "@/lib/reference/scrapecreators";

/*
  Apify 어댑터 — 인스타그램 키워드 수집 전용.

  실측 결론(2026-08): ScrapeCreators IG 릴스 검색은 후보 풀 상한이 낮아(페이지당 10,
  최고 조회수 ~30만) 대형 바이럴 콘텐츠가 아예 안 잡힌다. 레퍼런스 수집 도구들이
  실제로 쓰는 경로는 Apify instagram-scraper(해시태그 top 게시물, 키워드당 수십~수백
  후보)다. APIFY_TOKEN이 설정되면 IG 키워드 수집이 이 경로를 타고, 없으면 기존
  ScrapeCreators로 폴백한다.

  비용: 결과당 과금(Free 월 $5 크레딧 ≈ 1,800건). 60건 수집 ≈ $0.16.
*/

const ACTOR = "apify~instagram-scraper";
/** run-sync 대기 상한 — Apify 런은 콜드스타트 포함 보통 30~120초 */
const TIMEOUT_MS = 240_000;

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function metric(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
}

function normalizeApifyPost(raw: Json): CollectedPost | null {
  const id = str(raw.id) || str(raw.shortCode) || str(raw.shortcode);
  if (!id) return null;
  const type = str(raw.type); // "Image" | "Video" | "Sidecar"
  return {
    channel: "instagram",
    externalId: id,
    caption: str(raw.caption),
    creatorHandle: raw.ownerUsername ? `@${str(raw.ownerUsername)}` : "",
    url: str(raw.url) || null,
    thumbnailUrl: str(raw.displayUrl) || null,
    mediaFormat: type === "Video" ? "video" : type === "Sidecar" ? "carousel" : "photo",
    views: metric(raw.videoPlayCount) || metric(raw.videoViewCount),
    likes: metric(raw.likesCount),
    comments: metric(raw.commentsCount),
    followerCount: 0, // 게시물 응답엔 작성자 팔로워 수 없음 — 지어내지 않음
    postedAt: str(raw.timestamp) || null,
    region: null,
  };
}

/**
 * IG 키워드 수집 (Apify) — 키워드와 가장 일치하는 해시태그의 top 게시물을 받아온다.
 * onlyPostsNewerThan으로 기간 필터를 공급사 서버에서 적용(정확).
 */
export async function collectIgKeywordViaApify(
  keyword: string,
  periodDays: number | null,
  limit: number,
): Promise<CollectedPost[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new CollectError("no_key", "APIFY_TOKEN 미설정");

  const input: Json = {
    search: keyword.replace(/\s+/g, ""), // 해시태그 검색이므로 공백 제거
    searchType: "hashtag",
    searchLimit: 1,
    resultsType: "posts",
    resultsLimit: Math.max(limit, 60),
  };
  if (periodDays !== null) {
    input.onlyPostsNewerThan = new Date(Date.now() - periodDays * 86_400_000).toISOString().slice(0, 10);
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=200`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch (e) {
    throw new CollectError("provider_error", `Apify 호출 실패: ${e instanceof Error ? e.message : "network"}`);
  }

  if (res.status === 402 || res.status === 403) {
    throw new CollectError("out_of_credits", "Apify 크레딧 소진 또는 권한 없음");
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new CollectError("provider_error", `Apify 응답 파싱 실패 (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? str((data.error as Json)?.message) || `HTTP ${res.status}`
        : `HTTP ${res.status}`;
    if (/limit|credit|payment|quota/i.test(msg)) throw new CollectError("out_of_credits", `Apify: ${msg}`);
    throw new CollectError("provider_error", `Apify 오류: ${msg}`);
  }
  if (!Array.isArray(data)) throw new CollectError("provider_error", "Apify 응답 형식 불일치(배열 아님)");

  return (data as Json[])
    .map(normalizeApifyPost)
    .filter((p): p is CollectedPost => p !== null)
    .slice(0, Math.max(limit, 60));
}
