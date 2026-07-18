/**
 * Instagram 읽기 어댑터 — 대시보드/분석용 인사이트·미디어 조회 (graph.instagram.com v25.0).
 * 근거·필드·폐기지표: docs/REAL_API_SPEC.md 2절.
 *
 * 2025 폐기 반영:
 *  - profile_views(계정)·impressions(계정/미디어)는 폐기 → reach·views·profile_links_taps 사용
 *  - 계정 total_value 지표는 data[].total_value.value 위치, reach/follower_count만 time_series
 *  - 미디어 저장 지표는 'saved'(계정은 'saves'), REELS엔 profile_visits/follows 없음
 *  - 100팔로워 미만이면 팔로워/데모그래픽 결측 → 우아하게 0/빈값 처리
 *
 * 서버 전용: 액세스 토큰을 클라이언트로 노출하지 않는다.
 */

import { GRAPH_INSTAGRAM_BASE } from "./graph";

async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_INSTAGRAM_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`, {
    // 인사이트는 자주 안 바뀌므로 짧게 캐시(중복 호출·레이트리밋 완화)
    next: { revalidate: 300 },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    throw new Error(`graph_get_failed ${path}: ${json.error?.message ?? `http_${res.status}`}`);
  }
  return json;
}

/* ── 계정 인사이트 ─────────────────────────────────────────── */

export interface AccountInsights {
  reach: number;
  views: number;
  accountsEngaged: number;
  totalInteractions: number;
  profileLinksTaps: number;
  /** 기간 내 순증 팔로워(follower_count 합) */
  followerCountDelta: number;
}

interface TotalValueRow {
  name: string;
  total_value?: { value?: number };
}
interface TimeSeriesRow {
  name: string;
  values?: { value?: number }[];
}

/** 계정 total_value 지표 묶음 조회 (period=day). 소액계정 결측은 0. */
export async function fetchAccountInsights(igUserId: string, accessToken: string): Promise<AccountInsights> {
  const totalMetrics = ["reach", "views", "accounts_engaged", "total_interactions", "profile_links_taps"];
  const empty: AccountInsights = {
    reach: 0,
    views: 0,
    accountsEngaged: 0,
    totalInteractions: 0,
    profileLinksTaps: 0,
    followerCountDelta: 0,
  };

  // total_value 묶음 — 일부 지표가 계정 유형/규모로 막혀도 나머지는 얻도록 개별 실패를 흡수
  let totals: Record<string, number> = {};
  try {
    const res = await graphGet<{ data?: TotalValueRow[] }>(
      `/${igUserId}/insights?metric=${totalMetrics.join(",")}&metric_type=total_value&period=day`,
      accessToken,
    );
    totals = Object.fromEntries((res.data ?? []).map((r) => [r.name, r.total_value?.value ?? 0]));
  } catch (e) {
    console.error("[ig-insights] total_value 조회 실패:", e instanceof Error ? e.message : String(e));
  }

  // follower_count는 time_series — 기간 내 신규 팔로워 합산
  let followerDelta = 0;
  try {
    const res = await graphGet<{ data?: TimeSeriesRow[] }>(
      `/${igUserId}/insights?metric=follower_count&period=day`,
      accessToken,
    );
    const series = res.data?.[0]?.values ?? [];
    followerDelta = series.reduce((sum, v) => sum + (v.value ?? 0), 0);
  } catch {
    // 100팔로워 미만이면 막힘 — 0 유지
  }

  return {
    ...empty,
    reach: totals.reach ?? 0,
    views: totals.views ?? 0,
    accountsEngaged: totals.accounts_engaged ?? 0,
    totalInteractions: totals.total_interactions ?? 0,
    profileLinksTaps: totals.profile_links_taps ?? 0,
    followerCountDelta: followerDelta,
  };
}

/* ── 기간 합산 인사이트 + 일별 시계열 ──────────────────────── */

export interface AccountTotals {
  reach: number;
  views: number;
  accountsEngaged: number;
  totalInteractions: number;
  profileLinksTaps: number;
}

/**
 * 기간 합산 계정 인사이트 — since/until은 unix 초.
 * total_value + since/until이면 data[].total_value.value가 기간 합계다.
 * until을 시간 단위로 라운딩해 호출하면 URL이 안정되어 fetch 캐시(300초)가 공유된다.
 */
export async function fetchAccountInsightsRange(
  igUserId: string,
  accessToken: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<AccountTotals> {
  const metrics = ["reach", "views", "accounts_engaged", "total_interactions", "profile_links_taps"];
  const empty: AccountTotals = { reach: 0, views: 0, accountsEngaged: 0, totalInteractions: 0, profileLinksTaps: 0 };
  try {
    const res = await graphGet<{ data?: TotalValueRow[] }>(
      `/${igUserId}/insights?metric=${metrics.join(",")}&metric_type=total_value&period=day&since=${sinceUnix}&until=${untilUnix}`,
      accessToken,
    );
    const map = Object.fromEntries((res.data ?? []).map((r) => [r.name, r.total_value?.value ?? 0]));
    return {
      reach: map.reach ?? 0,
      views: map.views ?? 0,
      accountsEngaged: map.accounts_engaged ?? 0,
      totalInteractions: map.total_interactions ?? 0,
      profileLinksTaps: map.profile_links_taps ?? 0,
    };
  } catch (e) {
    console.error("[ig-insights] 기간 합산 조회 실패:", e instanceof Error ? e.message : String(e));
    return empty;
  }
}

export interface DailyPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

/**
 * 일별 시계열 — time_series를 지원하는 지표(follower_count·reach)만.
 * follower_count는 일별 '순증감'(신규-이탈), reach는 일별 도달 수다.
 * 100팔로워 미만 계정은 follower_count가 막혀 빈 배열이 온다 — 호출측은 빈 값 허용.
 */
export async function fetchDailySeries(
  igUserId: string,
  accessToken: string,
  metric: "follower_count" | "reach",
  sinceUnix: number,
  untilUnix: number,
): Promise<DailyPoint[]> {
  try {
    const res = await graphGet<{ data?: { values?: { value?: number; end_time?: string }[] }[] }>(
      `/${igUserId}/insights?metric=${metric}&period=day&metric_type=time_series&since=${sinceUnix}&until=${untilUnix}`,
      accessToken,
    );
    return (res.data?.[0]?.values ?? []).map((v) => ({
      date: (v.end_time ?? "").slice(0, 10),
      value: v.value ?? 0,
    }));
  } catch {
    // 소액 계정 차단·지표 미지원 — 빈 시계열로 폴백
    return [];
  }
}

/* ── 미디어 목록 + 미디어 인사이트 ─────────────────────────── */

export type MediaProductType = "AD" | "FEED" | "STORY" | "REELS";

export interface MediaItem {
  id: string;
  caption: string | null;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  mediaProductType: MediaProductType | string;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  timestamp: string | null;
  likeCount: number;
  commentsCount: number;
}

interface RawMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

/** 최근 미디어 목록 (기본 25개). 썸네일은 VIDEO/REELS만 → IMAGE는 media_url 폴백. */
export async function fetchRecentMedia(igUserId: string, accessToken: string, limit = 25): Promise<MediaItem[]> {
  const fields = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";
  try {
    const res = await graphGet<{ data?: RawMedia[] }>(`/${igUserId}/media?fields=${fields}&limit=${limit}`, accessToken);
    return (res.data ?? []).map((m) => ({
      id: m.id,
      caption: m.caption ?? null,
      mediaType: m.media_type ?? "IMAGE",
      mediaProductType: m.media_product_type ?? "FEED",
      permalink: m.permalink ?? null,
      thumbnailUrl: m.thumbnail_url ?? null,
      mediaUrl: m.media_url ?? null,
      timestamp: m.timestamp ?? null,
      likeCount: m.like_count ?? 0,
      commentsCount: m.comments_count ?? 0,
    }));
  } catch (e) {
    console.error("[ig-media] 목록 조회 실패:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** 게시물 댓글 텍스트 — 감성 분석용(최대 limit개). 실패·권한 없음은 빈 배열. */
export async function fetchMediaComments(mediaId: string, accessToken: string, limit = 50): Promise<string[]> {
  try {
    const res = await graphGet<{ data?: { text?: string }[] }>(
      `/${mediaId}/comments?fields=text&limit=${limit}`,
      accessToken,
    );
    return (res.data ?? []).map((c) => c.text ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

export interface MediaInsights {
  views: number;
  reach: number;
  likes: number;
  saved: number;
  shares: number;
  comments: number;
  totalInteractions: number;
}

/** media_product_type에 따라 유효 지표만 요청 (REELS엔 profile_visits/follows 없음). */
export async function fetchMediaInsights(
  mediaId: string,
  mediaProductType: string,
  accessToken: string,
): Promise<MediaInsights | null> {
  // 공통 지표만 사용 — 전 유형(FEED/REELS/STORY)에 적용되어 유형 분기 오류를 피한다
  const metrics = ["views", "reach", "likes", "saved", "shares", "comments", "total_interactions"];
  try {
    const res = await graphGet<{ data?: { name: string; values?: { value?: number }[] }[] }>(
      `/${mediaId}/insights?metric=${metrics.join(",")}`,
      accessToken,
    );
    const map = Object.fromEntries((res.data ?? []).map((r) => [r.name, r.values?.[0]?.value ?? 0]));
    return {
      views: map.views ?? 0,
      reach: map.reach ?? 0,
      likes: map.likes ?? 0,
      saved: map.saved ?? 0,
      shares: map.shares ?? 0,
      comments: map.comments ?? 0,
      totalInteractions: map.total_interactions ?? 0,
    };
  } catch (e) {
    console.error(`[ig-media-insights] ${mediaId} (${mediaProductType}) 조회 실패:`, e instanceof Error ? e.message : String(e));
    return null;
  }
}
