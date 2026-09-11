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

import { GRAPH_INSTAGRAM_BASE, GRAPH_READ_TIMEOUT_MS } from "./graph";

/** Graph 가 돌려준 오류 — 호출부가 «지원 안 되는 지표»(code 100)와 «못 가져옴»을 가를 수 있게 코드를 싣는다 */
class GraphReadError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly subcode: number | undefined = undefined,
  ) {
    super(message);
    this.name = "GraphReadError";
  }
}

/**
 * @param opts.fresh true 면 캐시를 거치지 않는다 — 인사이트는 5분 캐시가 맞지만, «방금 달린 댓글»을 보는 조회
 *   (자동 DM «지금 확인»)가 5분 전 목록을 받으면 새 댓글이 없는 것으로 보인다.
 *   `cache: "no-store"` 와 `next.revalidate` 를 함께 주면 둘 다 무시되므로(Next fetch 문서) 한쪽만 준다.
 */
async function graphGet<T>(path: string, accessToken: string, opts?: { fresh?: boolean }): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_INSTAGRAM_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`, {
    // 인사이트는 자주 안 바뀌므로 짧게 캐시(중복 호출·레이트리밋 완화)
    ...(opts?.fresh ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
    // 호출마다 새로 만든다 — 모듈 상수로 공유하면 두 번째 호출부터 즉시 끊긴다(graph.ts 주석)
    signal: AbortSignal.timeout(GRAPH_READ_TIMEOUT_MS),
  });
  /* 본문을 읽다 끊기면(시간 초과가 본문 도중에 오는 경우) 파싱이 실패한다 — 그걸 {} 로 눌러 «성공»으로
     돌려주면 호출부가 «데이터 없음»으로 읽는다. 성공 응답인데 본문이 없으면 실패로 올린다. */
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string; code?: number; error_subcode?: number } })
    | null;
  if (!res.ok || json === null) {
    throw new GraphReadError(
      `graph_get_failed ${path}: ${json?.error?.message ?? `http_${res.status}`}`,
      json?.error?.code,
      json?.error?.error_subcode,
    );
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
 *
 * **조회 실패는 null이다 — 0이 아니다.** 예전엔 전부 0인 객체를 돌려줬는데,
 * 그러면 «이 기간에 아무 일도 없었다»와 «레이트리밋에 걸렸다»가 구분되지 않는다.
 * 두 창을 비교하는 화면에서 한쪽만 실패하면 그 0이 «-100% 급락»이라는 빨간 확언으로
 * 둔갑한다(2026-08-30 점검에서 성과 분석·대시보드 두 곳 적발).
 * 호출측은 null을 받으면 값과 증감을 모두 «—»로 두어야 한다.
 */
export async function fetchAccountInsightsRange(
  igUserId: string,
  accessToken: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<AccountTotals | null> {
  const metrics = ["reach", "views", "accounts_engaged", "total_interactions", "profile_links_taps"];
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
    return null;
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
 *
 * **못 가져왔으면 null 이다 — 빈 배열이 아니다.** 예전엔 모든 실패를 [] 로 삼켜서, 레이트리밋·시간 초과가
 * 홈 추이 카드에 「추이 데이터가 아직 없어요」(= 사실 주장)로 나갔다. 호출마다 10초 상한을 건 뒤로는
 * 그런 실패가 더 잦아지므로 여기서 가른다(2026-09-10).
 *  - Graph code 100(잘못된 매개변수) = 이 계정에서 **지원 안 되는 지표**다. 100팔로워 미만 계정의
 *    follower_count 가 이렇게 막힌다 — 다시 불러도 안 나오니 «없음»([])이 사실이다.
 *  - 그 밖(시간 초과·네트워크·레이트리밋·토큰 오류·5xx)은 «모름»(null) — 호출측이 실패로 그린다.
 */
export async function fetchDailySeries(
  igUserId: string,
  accessToken: string,
  metric: "follower_count" | "reach",
  sinceUnix: number,
  untilUnix: number,
): Promise<DailyPoint[] | null> {
  try {
    const res = await graphGet<{ data?: { values?: { value?: number; end_time?: string }[] }[] }>(
      `/${igUserId}/insights?metric=${metric}&period=day&metric_type=time_series&since=${sinceUnix}&until=${untilUnix}`,
      accessToken,
    );
    return (res.data?.[0]?.values ?? []).map((v) => ({
      date: (v.end_time ?? "").slice(0, 10),
      value: v.value ?? 0,
    }));
  } catch (e) {
    if (e instanceof GraphReadError && e.code === 100) return [];
    console.error(`[ig-insights] 일별 ${metric} 조회 실패:`, e instanceof Error ? e.message : String(e));
    return null;
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

/** 연동 계정 프로필 사진 URL — 자동 DM 미리보기 아바타용. 실패·미설정 시 null */
export async function fetchProfileAvatar(igUserId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await graphGet<{ profile_picture_url?: string }>(`/${igUserId}?fields=profile_picture_url`, accessToken);
    return res.profile_picture_url ?? null;
  } catch {
    return null;
  }
}

/** 단일 미디어 메타 — "다음 게시물" 자동화 바인딩용 (업로드 시각·캡션·형식·썸네일) */
export interface MediaMeta {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaProductType: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  timestamp: string | null;
}

export async function fetchMediaMeta(mediaId: string, accessToken: string): Promise<MediaMeta | null> {
  try {
    const m = await graphGet<RawMedia>(
      `/${mediaId}?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,timestamp`,
      accessToken,
    );
    return {
      id: m.id,
      caption: m.caption ?? null,
      mediaType: m.media_type ?? "IMAGE",
      mediaProductType: m.media_product_type ?? "FEED",
      thumbnailUrl: m.thumbnail_url ?? null,
      mediaUrl: m.media_url ?? null,
      timestamp: m.timestamp ?? null,
    };
  } catch (e) {
    console.error("[ig-media] 미디어 메타 조회 실패:", mediaId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * 최근 미디어 목록 (기본 25개). 썸네일은 VIDEO/REELS만 → IMAGE는 media_url 폴백.
 *
 * ⚠️ **실패는 null 이다. 빈 배열이 아니다.** 예전엔 catch 에서 [] 를 돌려줬는데, 호출부가 «못 가져옴»과
 * «정말 0개»를 구분할 수 없어 세 화면이 거짓을 말했다(2026-09-07 감사):
 *  · 성장 진단: 게시물 200개인 사람에게 「진단할 게시물이 아직 부족해요 — 꾸준히 올려보세요」
 *  · 자동 DM 게시물 고르기: 「이 계정에 게시물이 없어요 — 게시물이 있는 계정으로 연동을 바꾸세요」
 *  · 링크 분석: 자기 게시물을 「내 계정 게시물인지 확인해 주세요」로 의심하게 만든다
 * 레이트리밋·토큰 일시 오류에서 그대로 재현된다. 같은 파일 fetchAccountInsightsRange 가 이미 이 규약이다.
 */
export async function fetchRecentMedia(igUserId: string, accessToken: string, limit = 25): Promise<MediaItem[] | null> {
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
    return null;
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

/** 자동 DM «지금 확인»이 읽는 댓글 한 건 — 웹훅 comments 페이로드와 같은 값들이다 */
export interface AutoDmComment {
  id: string;
  text: string;
  /** ISO 8601. 없으면 null — 호출측이 «기간 확인 불가»로 건너뛴다 */
  timestamp: string | null;
  /** 댓글 단 사람의 인스타 범위 ID(from.id) — 웹훅 value.from.id 와 같은 종류의 값이다. 없으면 null */
  fromId: string | null;
  fromUsername: string | null;
}

/**
 * 못 가져온 이유 — 화면이 할 일을 가른다(다시 연결 / 게시물 확인 / 잠시 후 다시).
 * ⚠️ 실패를 빈 배열로 돌려주지 않는다 — «새 댓글 0개»로 읽히면 DM 이 안 나간 이유가 사라진다.
 */
export type AutoDmCommentsFetch =
  | { ok: true; comments: AutoDmComment[] }
  | { ok: false; reason: "token" | "permission" | "gone" | "failed" };

/**
 * 게시물의 최근 댓글 — 자동 DM «지금 확인» 전용(캐시 없음).
 *
 * 근거(메타 문서, 2026-09-11 확인):
 *  · GET /{ig-media-id}/comments — Instagram 로그인은 instagram_business_basic + instagram_business_manage_comments.
 *    최상위 댓글만 준다(답글은 replies 확장이 따로 필요하다). v3.2 부터 **최신순**, 한 번에 **최대 50개**, 시각으로 거를 수 없다.
 *  · IG Comment 노드 — `from` 은 {id: 댓글 단 사람의 인스타 범위 ID, username} 이고 graph.instagram.com 에서도 준다.
 *    웹훅 comments 페이로드의 value.from.id 도 같은 인스타 범위 ID 라 수신자 해시가 두 경로에서 같은 값이 된다.
 * 한 페이지(최신 50개)만 읽는다 — 더 오래된 댓글은 대개 7일 창 밖이고, 누를 때마다 수백 개를 훑지 않게 한다.
 */
export async function fetchCommentsForAutoDm(mediaId: string, accessToken: string, limit = 50): Promise<AutoDmCommentsFetch> {
  try {
    const res = await graphGet<{
      data?: { id?: string; text?: string; timestamp?: string; username?: string; from?: { id?: string; username?: string } }[];
    }>(
      `/${encodeURIComponent(mediaId)}/comments?fields=id,text,timestamp,username,from{id,username}&limit=${Math.min(Math.max(limit, 1), 50)}`,
      accessToken,
      { fresh: true },
    );
    const comments: AutoDmComment[] = [];
    for (const c of res.data ?? []) {
      if (!c.id) continue;
      comments.push({
        id: c.id,
        text: c.text ?? "",
        timestamp: c.timestamp ?? null,
        fromId: c.from?.id ?? null,
        fromUsername: c.from?.username ?? c.username ?? null,
      });
    }
    return { ok: true, comments };
  } catch (e) {
    const code = e instanceof GraphReadError ? e.code : undefined;
    const subcode = e instanceof GraphReadError ? e.subcode : undefined;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ig-comments] 댓글 조회 실패:", mediaId, message);
    if (code === 190) return { ok: false, reason: "token" };
    /* 10·200·3 = 권한 없음(동의 때 댓글 권한을 안 받았거나 거둬들였다) */
    if (code === 10 || code === 200 || code === 3) return { ok: false, reason: "permission" };
    if (code === 100 && (subcode === 33 || /does not exist|cannot be loaded/i.test(message))) return { ok: false, reason: "gone" };
    return { ok: false, reason: "failed" };
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
