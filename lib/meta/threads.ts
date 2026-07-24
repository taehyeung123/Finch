/**
 * Threads 읽기 어댑터 — 대시보드/분석용 인사이트·게시물 조회 (graph.threads.net).
 * 근거·필드: docs/REAL_API_SPEC.md 5절. lib/meta/instagram.ts와 동일 구조로 복제.
 *
 * 불확실성 고지(TODO): Threads Insights의 정확한 응답 포맷(총계 total_value vs 시계열
 * time_series 구분)은 공개 문서에서 IG Graph Insights와 동일 컨벤션을 따른다고 추정했을 뿐,
 * 실제 테스터 계정으로 검증되지 않았다. graphGet 파서가 두 형태를 모두 방어적으로 처리하므로
 * 어느 쪽이든 크래시 없이 0/빈값으로 흡수되지만, 실 계정 연동 후 로그를 보고 필드명을 재검증할 것.
 *
 * 서버 전용: 액세스 토큰을 클라이언트로 노출하지 않는다.
 */

import { GRAPH_THREADS_BASE } from "./graph";

async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_THREADS_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`, {
    // 인사이트는 자주 안 바뀌므로 짧게 캐시(중복 호출·레이트리밋 완화) — IG 어댑터와 동일 정책
    next: { revalidate: 300 },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    throw new Error(`graph_get_failed ${path}: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return json;
}

interface InsightRow {
  name: string;
  total_value?: { value?: number };
  values?: { value?: number; end_time?: string }[];
}

/** total_value든 time_series든 방어적으로 단일 합계값을 뽑아낸다 (형태 불확실 — 상단 TODO 참고) */
function extractTotal(row: InsightRow | undefined): number {
  if (!row) return 0;
  if (typeof row.total_value?.value === "number") return row.total_value.value;
  if (row.values && row.values.length > 0) {
    return row.values.reduce((sum, v) => sum + (v.value ?? 0), 0);
  }
  return 0;
}

/* ── 계정 인사이트 ─────────────────────────────────────────── */

export interface ThreadsAccountTotals {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  clicks: number;
}

const EMPTY_TOTALS: ThreadsAccountTotals = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, clicks: 0 };

/**
 * 기간 합산 계정 인사이트 — since/until은 unix 초. 2024-04-13 이전 날짜는 since/until 미지원(스펙 8절).
 * until을 시간 단위로 라운딩해 호출하면 URL이 안정되어 fetch 캐시(300초)가 공유된다(호출측 책임).
 */
export async function fetchThreadsAccountInsightsRange(
  threadsUserId: string,
  accessToken: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<ThreadsAccountTotals> {
  const metrics = ["views", "likes", "replies", "reposts", "quotes", "clicks"];
  try {
    const res = await graphGet<{ data?: InsightRow[] }>(
      `/${threadsUserId}/threads_insights?metric=${metrics.join(",")}&since=${sinceUnix}&until=${untilUnix}`,
      accessToken,
    );
    const map = new Map((res.data ?? []).map((r) => [r.name, r]));
    return {
      views: extractTotal(map.get("views")),
      likes: extractTotal(map.get("likes")),
      replies: extractTotal(map.get("replies")),
      reposts: extractTotal(map.get("reposts")),
      quotes: extractTotal(map.get("quotes")),
      clicks: extractTotal(map.get("clicks")),
    };
  } catch (e) {
    console.error("[threads-insights] 기간 합산 조회 실패:", e instanceof Error ? e.message : String(e));
    return EMPTY_TOTALS;
  }
}

/**
 * 현재 팔로워 수 — Threads 프로필 필드에는 followers_count가 없어(스펙 6절) insights로만 조회 가능.
 * period=lifetime(스냅샷값, since/until 없이) — 일별 시계열이 아니라 "현재 총 팔로워"로 추정.
 */
export async function fetchThreadsFollowersCount(threadsUserId: string, accessToken: string): Promise<number> {
  try {
    const res = await graphGet<{ data?: InsightRow[] }>(
      `/${threadsUserId}/threads_insights?metric=followers_count&period=lifetime`,
      accessToken,
    );
    return extractTotal(res.data?.[0]);
  } catch (e) {
    console.error("[threads-insights] 팔로워 수 조회 실패:", e instanceof Error ? e.message : String(e));
    return 0;
  }
}

export interface ThreadsDailyPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

/** 일별 조회수 시계열 — IG의 reach 시계열에 대응해 "도달" 대용으로 쓴다(Threads엔 reach 지표 없음). */
export async function fetchThreadsDailyViews(
  threadsUserId: string,
  accessToken: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<ThreadsDailyPoint[]> {
  try {
    const res = await graphGet<{ data?: InsightRow[] }>(
      `/${threadsUserId}/threads_insights?metric=views&since=${sinceUnix}&until=${untilUnix}`,
      accessToken,
    );
    const row = res.data?.[0];
    if (!row) return [];
    // time_series 형태면 values[]를 그대로 매핑, total_value 단일값이면 하루짜리 포인트로 흡수
    if (row.values && row.values.length > 0) {
      return row.values.map((v) => ({ date: (v.end_time ?? "").slice(0, 10), value: v.value ?? 0 }));
    }
    return [];
  } catch {
    return [];
  }
}

/* ── 게시물 목록 + 게시물 인사이트 ─────────────────────────── */

export interface ThreadsPost {
  id: string;
  text: string | null;
  mediaType: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  mediaUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  isQuotePost: boolean;
}

interface RawThreadsPost {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  is_quote_post?: boolean;
}

/** 최근 게시물 목록 (기본 25개) */
export async function fetchRecentThreadsPosts(threadsUserId: string, accessToken: string, limit = 25): Promise<ThreadsPost[]> {
  const fields = "id,media_type,media_url,permalink,text,timestamp,is_quote_post";
  try {
    const res = await graphGet<{ data?: RawThreadsPost[] }>(`/${threadsUserId}/threads?fields=${fields}&limit=${limit}`, accessToken);
    return (res.data ?? []).map((p) => ({
      id: p.id,
      text: p.text ?? null,
      mediaType: p.media_type ?? "TEXT",
      mediaUrl: p.media_url ?? null,
      permalink: p.permalink ?? null,
      timestamp: p.timestamp ?? null,
      isQuotePost: p.is_quote_post === true,
    }));
  } catch (e) {
    console.error("[threads-posts] 목록 조회 실패:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export interface ThreadsPostInsights {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  shares: number;
}

/** 게시물 레벨 인사이트 (스펙 8절: views, likes, replies, reposts, quotes, shares) */
export async function fetchThreadsPostInsights(mediaId: string, accessToken: string): Promise<ThreadsPostInsights | null> {
  const metrics = ["views", "likes", "replies", "reposts", "quotes", "shares"];
  try {
    const res = await graphGet<{ data?: InsightRow[] }>(`/${mediaId}/insights?metric=${metrics.join(",")}`, accessToken);
    const map = new Map((res.data ?? []).map((r) => [r.name, r]));
    return {
      views: extractTotal(map.get("views")),
      likes: extractTotal(map.get("likes")),
      replies: extractTotal(map.get("replies")),
      reposts: extractTotal(map.get("reposts")),
      quotes: extractTotal(map.get("quotes")),
      shares: extractTotal(map.get("shares")),
    };
  } catch (e) {
    console.error(`[threads-post-insights] ${mediaId} 조회 실패:`, e instanceof Error ? e.message : String(e));
    return null;
  }
}
