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
  pageName: string;
  pageProfileUrl: string | null;
  body: string;
  ctaText: string | null;
  thumbnailUrl: string | null;
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
  return {
    adArchiveId: id,
    pageName: str(raw.page_name) || str(snapshot.page_name) || "알 수 없는 광고주",
    pageProfileUrl: str(snapshot.page_profile_uri) || null,
    body: str(body.text),
    ctaText: str(snapshot.cta_text) || null,
    thumbnailUrl: thumbnail || null,
    isActive: raw.is_active !== false,
    startDate: startSec ? new Date(startSec * 1000).toISOString() : null,
    endDate: endSec ? new Date(endSec * 1000).toISOString() : null,
    platforms: Array.isArray(raw.publisher_platform) ? (raw.publisher_platform as unknown[]).map(String) : [],
    url: str(raw.url) || null,
  };
}

/**
 * 키워드로 KR 상업광고 검색 — 페이지당 1크레딧.
 * trim=true로 응답 축약(불필요 필드 절약), 실패해도 예외를 던져 호출부가
 * out_of_credits 등 이유별로 분기하게 한다(수집 엔진과 동일 원칙).
 */
export async function searchAds(query: string, page = 1): Promise<CollectedAd[]> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) throw new CollectError("no_key", "SCRAPECREATORS_API_KEY 미설정");

  const url = `${BASE}/v1/facebook/adLibrary/search/ads?${new URLSearchParams({
    query,
    country: "KR",
    trim: "true",
    page: String(page),
  }).toString()}`;

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
  return results.map(normalizeAd).filter((a): a is CollectedAd => a !== null);
}
