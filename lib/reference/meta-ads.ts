import "server-only";

import { CollectError } from "@/lib/reference/scrapecreators";

/*
  메타광고 레퍼런스 어댑터 — ScrapeCreators Facebook Ad Library 엔드포인트.
  (2026-08-08 실측 확인: country=KR + 한글 키워드로 국내 상업광고 정상 반환 —
  공식 Meta Ad Library API(graph.facebook.com/ads_archive)는 2023 DSA 이후
  ad_type=ALL 비정치 광고를 EU·영국 대상만 반환해 한국은 이 경로로 조회 불가.
  docs/REAL_API_SPEC.md 3절 참고.)

  reference/scrapecreators.ts와 같은 설계 원칙: 이 파일만 공급사 응답 형태를 안다.
  밖으로는 CollectedAd 정규형만 내보낸다.
*/

export interface CollectedAd {
  /** Meta 광고 라이브러리 고유 ID — 중복 수집 방지 키 */
  adArchiveId: string;
  /**
   * 페이지 ID — **브랜드 동일성의 유일한 근거.**
   * 광고주 이름은 '㈜아모레퍼시픽'·'아모레퍼시픽'·'AMOREPACIFIC'이 뒤섞여 들어와
   * 이름으로 묶으면 같은 브랜드가 3개로 쪼개진다. 공용 풀의 brands.external_id 가 이 값이다.
   */
  pageId: string | null;
  pageName: string;
  pageProfileUrl: string | null;
  body: string;
  ctaText: string | null;
  thumbnailUrl: string | null;
  /** 영상 광고 여부 — 풀에서 형식 필터(릴스만 보기)를 걸려면 수집 시점에 알아야 한다 */
  mediaFormat: "video" | "photo" | "carousel";
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  /** FACEBOOK/INSTAGRAM/AUDIENCE_NETWORK/MESSENGER 등 게재 플랫폼 */
  platforms: string[];
  /** Meta 광고 라이브러리 원본 링크 */
  url: string | null;
}

const BASE = "https://api.scrapecreators.com";
const TIMEOUT_MS = 45_000;

export function isAdCollectionConfigured(): boolean {
  return Boolean(process.env.SCRAPECREATORS_API_KEY);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type Json = Record<string, unknown>;

function normalizeAd(raw: Json): CollectedAd | null {
  const id = str(raw.ad_archive_id);
  if (!id) return null;
  const snapshot = (raw.snapshot ?? {}) as Json;
  const body = (snapshot.body ?? {}) as Json;
  const images = Array.isArray(snapshot.images) ? (snapshot.images as Json[]) : [];
  const videos = Array.isArray(snapshot.videos) ? (snapshot.videos as Json[]) : [];
  const thumbnail =
    str(videos[0]?.video_preview_image_url) || str(images[0]?.resized_image_url) || str(images[0]?.original_image_url) || null;
  const startSec = num(raw.start_date);
  const endSec = num(raw.end_date);
  // page_id 는 숫자로 올 때가 있어 문자열로 통일한다 (brands.external_id 가 text).
  const rawPageId = raw.page_id ?? snapshot.page_id;
  const pageId =
    typeof rawPageId === "string" || typeof rawPageId === "number" ? String(rawPageId) : "";
  const cards = Array.isArray(snapshot.cards) ? (snapshot.cards as Json[]) : [];
  return {
    adArchiveId: id,
    pageId: pageId || null,
    pageName: str(raw.page_name) || str(snapshot.page_name) || "알 수 없는 광고주",
    pageProfileUrl: str(snapshot.page_profile_uri) || null,
    body: str(body.text),
    ctaText: str(snapshot.cta_text) || null,
    thumbnailUrl: thumbnail || null,
    mediaFormat: videos.length > 0 ? "video" : cards.length > 1 || images.length > 1 ? "carousel" : "photo",
    isActive: raw.is_active !== false,
    startDate: startSec ? new Date(startSec * 1000).toISOString() : null,
    endDate: endSec ? new Date(endSec * 1000).toISOString() : null,
    platforms: Array.isArray(raw.publisher_platform) ? (raw.publisher_platform as unknown[]).map(String) : [],
    url: str(raw.url) || null,
  };
}

export interface AdSearchPage {
  ads: CollectedAd[];
  /** 다음 페이지 커서 — null이면 더 없음 */
  cursor: string | null;
  /** 공급사가 보고한 총 검색 결과 수(추정치라 콜마다 흔들린다) */
  totalCount: number;
}

/**
 * 키워드로 KR 상업광고 검색 — 콜당 1크레딧.
 *
 * **페이지네이션은 반드시 cursor로 한다.** 이 엔드포인트에는 `page` 파라미터가
 * 먹지 않는다 — 2026-08-09 실측: page=1과 page=2가 첫 ID·끝 ID까지 완전히 동일한
 * 30건을 반환했다(중복률 100%). 과거 page 기반 병렬 호출은 크레딧의 절반을
 * 같은 데이터에 태우면서 실제 수집량은 30건에서 늘지 않았다.
 * cursor는 정상 동작한다(1페이지 30건, 이후 10건씩, 중복 0).
 *
 * trim=true로 응답 축약. 실패는 예외로 던져 호출부가 out_of_credits 등 이유별로
 * 분기하게 한다(수집 엔진과 동일 원칙).
 */
export async function searchAds(query: string, cursor?: string | null): Promise<AdSearchPage> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) throw new CollectError("no_key", "SCRAPECREATORS_API_KEY 미설정");

  const params = new URLSearchParams({ query, country: "KR", trim: "true" });
  if (cursor) params.set("cursor", cursor);
  const url = `${BASE}/v1/facebook/adLibrary/search/ads?${params.toString()}`;

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
  let data: Json;
  try {
    data = (await res.json()) as Json;
  } catch {
    throw new CollectError("provider_error", `응답 파싱 실패 (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    throw new CollectError("provider_error", `공급사 오류: ${msg}`);
  }
  const results = Array.isArray(data.searchResults) ? (data.searchResults as Json[]) : [];
  return {
    ads: results.map(normalizeAd).filter((a): a is CollectedAd => a !== null),
    cursor: typeof data.cursor === "string" && data.cursor ? data.cursor : null,
    totalCount: typeof data.searchResultsCount === "number" ? data.searchResultsCount : results.length,
  };
}
