/**
 * 실 데이터 프로바이더 (서버 전용) — 연동된 인스타그램/Threads 계정의 실 인사이트/미디어를 조회한다.
 *
 * 흐름: connected_accounts 조회(RLS) → 토큰 복호화 → 만료 임박 시 갱신·재저장 → 어댑터 호출.
 * 라이브 인사이트는 Meta 앱 심사·비즈니스 인증 완료 후에만 실제로 값이 채워진다(그 전엔 dev 테스터 계정만).
 * 어떤 단계든 불가하면 null을 반환해 호출측이 데모/빈 상태로 폴백하게 한다.
 *
 * 인스타그램·Threads·TikTok은 병렬 구조로 각각 조회하고, 대시보드의 "전체" 필터는 연동된 채널이
 * 둘 이상인 경우 원시 집계값(팔로워·조회수·상호작용 등)을 합산해 재계산한다(포맷된 비율을 단순 평균하지 않음).
 * TikTok은 심사 없이 확인된 범위가 기본 프로필(팔로워·좋아요·영상 수)뿐이라 조회수·참여율 등
 * 인사이트 계열은 항상 0/빈 값이다(docs/REAL_API_SPEC.md 6절, computeTiktokPiece 주석 참고).
 *
 * next/headers(createClient) 경유라 서버 컨텍스트에서만 동작한다.
 */

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { getWorkspaceOwnerId } from "@/lib/team";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { fetchAccountInfo, refreshLongLivedToken } from "@/lib/meta/instagram-oauth";
import { fetchThreadsAccountInfo, refreshThreadsLongLivedToken } from "@/lib/meta/threads-oauth";
import { getTiktokOAuthConfig, refreshTiktokToken } from "@/lib/tiktok/oauth";
import { fetchTiktokUserInfo } from "@/lib/tiktok/api";
import {
  fetchAccountInsights,
  fetchAccountInsightsRange,
  fetchDailySeries,
  fetchMediaInsights,
  fetchRecentMedia,
  type AccountInsights,
  type MediaItem,
} from "@/lib/meta/instagram";
import {
  fetchRecentThreadsPosts,
  fetchThreadsAccountInsightsRange,
  fetchThreadsDailyViews,
  fetchThreadsFollowersCount,
  fetchThreadsPostInsights,
  type ThreadsPost,
} from "@/lib/meta/threads";
import type {
  Channel,
  ChannelAccount,
  ChannelFilter,
  ChannelTrend,
  ContentMix,
  DashboardSummary,
  Post,
  PostType,
  ProfileGridPost,
} from "@/lib/types";

export interface LiveInstagramAccount {
  id: string;
  platformUserId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  followers: number;
  posts: number;
  tokenExpiresInDays: number | null;
}

export interface LiveInstagramAnalytics {
  account: LiveInstagramAccount;
  insights: AccountInsights;
  media: MediaItem[];
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

interface AccountRow {
  id: string;
  platform_user_id: string | null;
  handle: string;
  display_name: string | null;
  bio: string | null;
  /** 0006 마이그레이션 이전 DB에는 없을 수 있다 */
  avatar_url?: string | null;
  /** 0011 마이그레이션 이전 DB에는 없을 수 있다 — TikTok 전용(access_token과 분리된 리프레시 토큰) */
  refresh_token_cipher?: string | null;
  connected: boolean;
  followers: number;
  posts: number;
  access_token_cipher: string | null;
  token_expires_at: string | null;
}

/** 채널별 연동 계정 행 조회 (토큰 포함, 서버 전용). 없으면 null.
 *  select("*")를 쓰는 이유: 마이그레이션 시점 차이로 선택 컬럼이 없으면 조회 전체가
 *  실패해 대시보드가 통째로 폴백되는 것을 막기 위해 — 결측 컬럼은 undefined로 흡수한다.
 *
 *  워크스페이스 소유자(getWorkspaceOwnerId) 기준으로 명시 필터링한다 — 팀 멤버가 보면
 *  본인이 아니라 소유자의 연동 계정이 조회되게 하기 위해서다(RLS의 "team members read"
 *  정책이 열람은 허용하지만, 어떤 소유자 행을 볼지는 애플리케이션이 정해야 한다). */
async function loadAccountRow(channel: "instagram" | "threads" | "tiktok"): Promise<AccountRow | null> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const ownerId = await getWorkspaceOwnerId(supabase, user.id);

  const { data, error } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("channel", channel)
    .eq("connected", true)
    .eq("user_id", ownerId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[live] ${channel} 계정 조회 실패:`, error.message);
    return null;
  }
  return (data as AccountRow | null) ?? null;
}

async function loadInstagramRow(): Promise<AccountRow | null> {
  return loadAccountRow("instagram");
}

async function loadThreadsRow(): Promise<AccountRow | null> {
  return loadAccountRow("threads");
}

async function loadTiktokRow(): Promise<AccountRow | null> {
  return loadAccountRow("tiktok");
}

/** 계정 기본 정보(토큰 제외) — 대시보드/설정의 실 계정 표시용. 라이브 호출 없이 DB만. */
export async function getConnectedInstagramAccount(): Promise<LiveInstagramAccount | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;
  return {
    id: row.id,
    platformUserId: row.platform_user_id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    followers: row.followers,
    posts: row.posts,
    tokenExpiresInDays: daysUntil(row.token_expires_at),
  };
}

/** Threads판 getConnectedInstagramAccount — DB만 조회, 라이브 호출 없음. */
export async function getConnectedThreadsAccount(): Promise<LiveInstagramAccount | null> {
  const row = await loadThreadsRow();
  if (!row || !row.platform_user_id) return null;
  return {
    id: row.id,
    platformUserId: row.platform_user_id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    followers: row.followers,
    posts: row.posts,
    tokenExpiresInDays: daysUntil(row.token_expires_at),
  };
}

/**
 * TikTok판 getConnectedInstagramAccount — DB만 조회, 라이브 호출 없음.
 * tokenExpiresInDays는 항상 null로 고정한다: TikTok 액세스 토큰은 24시간짜리라 매일 자동 갱신되므로
 * (ensureFreshTiktokToken/크론) "N일 후 만료" 카운트다운을 그대로 보여주면 정상 상태에서도 매번
 * "만료 임박 — 재연동 필요"처럼 보여 오해를 유발한다.
 */
export async function getConnectedTiktokAccount(): Promise<LiveInstagramAccount | null> {
  const row = await loadTiktokRow();
  if (!row || !row.platform_user_id) return null;
  return {
    id: row.id,
    platformUserId: row.platform_user_id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    followers: row.followers,
    posts: row.posts,
    tokenExpiresInDays: null,
  };
}

type RefreshFn = (token: string) => Promise<{ accessToken: string; expiresInSeconds: number }>;

/**
 * 유효 토큰 확보 — 만료 임박(<=10일)이면 갱신 후 재저장. 만료·복호화 실패면 null.
 * 갱신은 실패해도 기존 토큰으로 시도(아직 유효할 수 있음)하되, 이미 만료면 포기.
 * refresh 함수는 채널별로 다르다(기본값 인스타그램) — Threads는 refreshThreadsLongLivedToken을 넘긴다.
 */
async function ensureFreshToken(row: AccountRow, refresh: RefreshFn = refreshLongLivedToken): Promise<string | null> {
  const token = decryptToken(row.access_token_cipher);
  if (!token) return null;

  const remaining = daysUntil(row.token_expires_at);
  if (remaining !== null && remaining <= 0) {
    // 이미 만료 — 재연동 필요
    return null;
  }
  if (remaining !== null && remaining <= 10) {
    try {
      const refreshed = await refresh(token);
      const cipher = encryptToken(refreshed.accessToken);
      if (cipher) {
        const supabase = await createClient();
        await supabase
          .from("connected_accounts")
          .update({
            access_token_cipher: cipher,
            token_expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
          })
          .eq("id", row.id);
        return refreshed.accessToken;
      }
    } catch (e) {
      console.error("[live] 토큰 갱신 실패, 기존 토큰으로 시도:", e instanceof Error ? e.message : String(e));
    }
  }
  return token;
}

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

/**
 * TikTok 전용 유효 토큰 확보 — ensureFreshToken과 달리 재사용할 수 없다:
 * IG/Threads는 "장기토큰이 자기 자신을 갱신"하는 모델이지만, TikTok은 access_token(24시간)과
 * refresh_token(365일)이 분리된 표준 OAuth2 모델이다. 또한 액세스 토큰 수명이 24시간뿐이라
 * daysUntil(올림 계산)로는 갱신 시점을 판별할 수 없다 — 발급 직후에도 "1일 남음"으로 계산돼
 * 매 요청마다 불필요하게 갱신을 시도하게 된다. 그래서 시간 단위(hoursUntil)로 별도 판단한다.
 */
async function ensureFreshTiktokToken(row: AccountRow): Promise<string | null> {
  const currentToken = decryptToken(row.access_token_cipher);
  const remainingHours = hoursUntil(row.token_expires_at);

  // 1시간 넘게 남았으면 그대로 사용 (여유 버퍼 — 요청 처리 중 만료되는 것을 방지)
  if (remainingHours !== null && remainingHours > 1 && currentToken) {
    return currentToken;
  }

  const refreshToken = decryptToken(row.refresh_token_cipher ?? null);
  const config = getTiktokOAuthConfig();
  if (!refreshToken || !config) {
    // 리프레시 토큰(0011 미적용 DB 포함)·앱 자격증명 중 하나라도 없으면 갱신 불가 —
    // 기존 액세스 토큰이 아직 안 만료됐으면 그거라도 쓰고, 아니면 재연동 필요
    return remainingHours !== null && remainingHours > 0 ? currentToken : null;
  }

  try {
    const refreshed = await refreshTiktokToken(refreshToken, config);
    const accessCipher = encryptToken(refreshed.accessToken);
    const refreshCipher = encryptToken(refreshed.refreshToken);
    if (accessCipher && refreshCipher) {
      const supabase = await createClient();
      await supabase
        .from("connected_accounts")
        .update({
          access_token_cipher: accessCipher,
          refresh_token_cipher: refreshCipher,
          token_expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
        })
        .eq("id", row.id);
      return refreshed.accessToken;
    }
  } catch (e) {
    console.error("[live] TikTok 토큰 갱신 실패:", e instanceof Error ? e.message : String(e));
  }
  // 갱신 실패 — 기존 액세스 토큰이 아직 유효하면 그것으로 시도
  return remainingHours !== null && remainingHours > 0 ? currentToken : null;
}

/* ── 대시보드/팔로워분석 뷰모델 ────────────────────────────── */

const DAY = 86_400;

/** until을 시간 경계로 라운딩 — 요청 간 URL이 같아져 fetch 캐시(300초)가 공유된다 */
function hourAlignedNowUnix(): number {
  return Math.floor(Date.now() / 1000 / 3600) * 3600;
}

/** media_product_type/media_type → 핀치 PostType (인스타그램) */
function toPostType(m: MediaItem): PostType {
  if (m.mediaProductType === "REELS") return "reels";
  if (m.mediaProductType === "STORY") return "story";
  if (m.mediaType === "VIDEO") return "video";
  if (m.mediaType === "CAROUSEL_ALBUM") return "carousel";
  return "feed";
}

/** Threads media_type → 핀치 PostType */
function toThreadsPostType(p: ThreadsPost): PostType {
  if (p.mediaType === "VIDEO") return "video";
  if (p.mediaType === "CAROUSEL_ALBUM") return "carousel";
  if (p.mediaType === "IMAGE") return "feed";
  return "text";
}

const TYPE_LABEL: Record<string, string> = { reels: "릴스", feed: "피드", carousel: "캐러셀", video: "영상", story: "스토리", text: "텍스트" };

export interface LiveDashboard {
  accounts: ChannelAccount[];
  summaries: Record<ChannelFilter, DashboardSummary>;
  posts: Post[];
  contentMix: Record<ChannelFilter, ContentMix[]>;
  profileGrid: Record<Channel, ProfileGridPost[]>;
  trends: Record<Channel, ChannelTrend>;
}

const EMPTY_TREND: ChannelTrend = { startLabel: "", endLabel: "", followers: [], views: [], engagement: [] };

function disconnectedAccount(channel: Channel): ChannelAccount {
  return {
    channel,
    handle: "",
    displayName: "",
    bio: "",
    connected: false,
    followers: 0,
    followersDelta7d: 0,
    posts: 0,
    avgEngagementRate: 0,
    tokenExpiresInDays: null,
  };
}

function zeroSummary(channel: ChannelFilter): DashboardSummary {
  return {
    channel,
    followers: 0,
    followersDelta: 0,
    weeklyViews: 0,
    weeklyViewsDelta: 0,
    postCount: 0,
    avgLikes: 0,
    avgComments: 0,
    engagementRate: 0,
    engagementDelta: 0,
  };
}

/**
 * "전체" 필터 재계산에 필요한 원시 집계값 — 포맷된 DashboardSummary(비율·평균)를 단순 합산하면
 * 부정확해지므로(예: 참여율 평균 ≠ 두 채널 평균), 분자·분모를 각각 들고 있다가 합산 후 재계산한다.
 */
interface DashboardPieceRaw {
  followers: number;
  followersDelta: number;
  views7: number;
  viewsPrev7: number;
  postCount: number;
  likesSum: number;
  commentsSum: number;
  sampleCount: number;
  /** 참여율 분자(좋아요+댓글+공유 등 상호작용 합) */
  interactions7: number;
  interactionsPrev7: number;
  /** 참여율 분모 — 인스타그램은 도달(reach), Threads는 대응 지표가 없어 조회수(views)로 대체 */
  denominator7: number;
  denominatorPrev7: number;
  /** 콘텐츠 유형별 원시 개수(합산용) — ContentMix는 비율만 갖고 있어 병합 전 단계 값이 필요 */
  typeCounts: Partial<Record<PostType, number>>;
}

interface DashboardPiece {
  account: ChannelAccount;
  summary: DashboardSummary;
  posts: Post[];
  contentMix: ContentMix[];
  profileGrid: ProfileGridPost[];
  trend: ChannelTrend;
  raw: DashboardPieceRaw;
}

function contentMixFromCounts(typeCounts: Partial<Record<PostType, number>>): ContentMix[] {
  const total = Object.values(typeCounts).reduce((s, n) => s + (n ?? 0), 0);
  if (total === 0) return [];
  return Object.entries(typeCounts)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([t, n]) => ({ label: TYPE_LABEL[t] ?? t, ratio: Math.round(((n ?? 0) / total) * 100) }));
}

/**
 * 인스타그램 대시보드 조각 — 최근 7일 인사이트·미디어를 채널별 뷰모델로 변환.
 * 토큰 확보 실패면 null(호출측이 미연동 취급). 부분 실패는 0/빈값으로 흡수.
 */
async function computeInstagramPiece(row: AccountRow): Promise<DashboardPiece | null> {
  const token = await ensureFreshToken(row);
  if (!token) return null;

  const ig = row.platform_user_id!;
  const until = hourAlignedNowUnix();
  const since7 = until - 7 * DAY;
  const since14 = until - 14 * DAY;

  // 계정 정보는 실패해도 DB 행 값으로 폴백
  const infoPromise = fetchAccountInfo(token).catch(() => null);

  const [info, cur7, prev7, followerSeries, media] = await Promise.all([
    infoPromise,
    fetchAccountInsightsRange(ig, token, since7, until),
    fetchAccountInsightsRange(ig, token, since14, since7),
    fetchDailySeries(ig, token, "follower_count", since14, until),
    fetchRecentMedia(ig, token, 12),
  ]);

  // 팔로워/게시물 수·프로필 사진 최신화 — 실패는 무시 (다음 로드에서 재시도)
  if (info) {
    const supabase = await createClient();
    const patch = {
      followers: info.followersCount,
      posts: info.mediaCount,
      display_name: info.name ?? info.username ?? null,
      bio: info.biography,
    };
    // avatar_url은 0006 미적용 DB에 없을 수 있어 실패 시 컬럼 제외 재시도
    const { error: patchErr } = await supabase
      .from("connected_accounts")
      .update({ ...patch, avatar_url: info.profilePictureUrl })
      .eq("id", row.id);
    if (patchErr && /avatar_url/i.test(patchErr.message)) {
      await supabase.from("connected_accounts").update(patch).eq("id", row.id);
    } else if (patchErr) {
      console.error("[live] 계정 정보 갱신 실패:", patchErr.message);
    }
  }

  const followers = info?.followersCount ?? row.followers;
  const postCount = info?.mediaCount ?? row.posts;

  // 게시물별 인사이트(조회수·공유) — 최근 10개만 (호출량 절제, 300초 캐시)
  const withInsights = media.slice(0, 10);
  const mediaInsights = await Promise.all(
    withInsights.map((m) => fetchMediaInsights(m.id, m.mediaProductType, token)),
  );

  const followersDelta7d = followerSeries.slice(-7).reduce((s, p) => s + p.value, 0);
  const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  const engagementRate = cur7.reach > 0 ? (cur7.totalInteractions / cur7.reach) * 100 : 0;
  const prevEngagementRate = prev7.reach > 0 ? (prev7.totalInteractions / prev7.reach) * 100 : 0;

  const summary: DashboardSummary = {
    channel: "instagram",
    followers,
    followersDelta: followersDelta7d,
    weeklyViews: cur7.views,
    weeklyViewsDelta: prev7.views > 0 ? Number((((cur7.views - prev7.views) / prev7.views) * 100).toFixed(1)) : 0,
    postCount,
    avgLikes: Math.round(avg(media.map((m) => m.likeCount))),
    avgComments: Math.round(avg(media.map((m) => m.commentsCount))),
    engagementRate: Number(engagementRate.toFixed(2)),
    engagementDelta: Number((engagementRate - prevEngagementRate).toFixed(2)),
  };

  const posts: Post[] = withInsights.map((m, i) => ({
    id: m.id,
    channel: "instagram",
    type: toPostType(m),
    caption: m.caption?.split("\n")[0]?.slice(0, 80) || "(캡션 없음)",
    publishedAt: m.timestamp ?? new Date().toISOString(),
    views: mediaInsights[i]?.views ?? 0,
    likes: m.likeCount,
    comments: m.commentsCount,
    shares: mediaInsights[i]?.shares ?? 0,
    trend: [], // 게시물별 일별 추이는 공식 API 미제공 — 스파크라인은 값 있을 때만 렌더
  }));

  const grid: ProfileGridPost[] = withInsights.slice(0, 9).map((m, i) => ({
    id: m.id,
    type: toPostType(m),
    views: mediaInsights[i]?.views ?? 0,
    likes: m.likeCount,
    // VIDEO/REELS만 thumbnail_url 제공 — 이미지는 media_url 폴백 (docs/REAL_API_SPEC.md 2절)
    thumbnailUrl: m.thumbnailUrl ?? m.mediaUrl,
  }));

  // 콘텐츠 유형 비중 — 최근 미디어 기준
  const typeCounts: Partial<Record<PostType, number>> = {};
  for (const m of media) {
    const t = toPostType(m);
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  const mix = contentMixFromCounts(typeCounts);

  // 성과 추이 — 팔로워: 일별 순증감을 현재 팔로워에서 역산해 누적 곡선으로.
  // 조회 곡선은 일별 도달(reach) 시계열을 쓴다(views는 시계열 미지원 — UI에서 '도달'로 표기).
  const reachSeries = await fetchDailySeries(ig, token, "reach", since14, until);
  let cumulative = followers;
  const followerCurve: number[] = new Array(followerSeries.length);
  for (let i = followerSeries.length - 1; i >= 0; i--) {
    followerCurve[i] = cumulative;
    cumulative -= followerSeries[i].value;
  }
  const fmtLabel = (d: string | undefined) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : "");
  const trend: ChannelTrend =
    followerSeries.length >= 2 || reachSeries.length >= 2
      ? {
          startLabel: fmtLabel(followerSeries[0]?.date ?? reachSeries[0]?.date),
          endLabel: fmtLabel(followerSeries.at(-1)?.date ?? reachSeries.at(-1)?.date),
          followers: followerCurve,
          views: reachSeries.map((p) => p.value),
          engagement: [], // 일별 참여율은 공식 API 미제공(합산 지표만) — 탭에서 안내
        }
      : EMPTY_TREND;

  const account: ChannelAccount = {
    channel: "instagram",
    handle: row.handle,
    displayName: info?.name ?? row.display_name ?? row.handle,
    bio: info?.biography ?? row.bio ?? "",
    avatarUrl: info?.profilePictureUrl ?? row.avatar_url ?? null,
    connected: true,
    followers,
    followersDelta7d,
    posts: postCount,
    avgEngagementRate: summary.engagementRate,
    tokenExpiresInDays: daysUntil(row.token_expires_at),
  };

  return {
    account,
    summary,
    posts,
    contentMix: mix,
    profileGrid: grid,
    trend,
    raw: {
      followers,
      followersDelta: followersDelta7d,
      views7: cur7.views,
      viewsPrev7: prev7.views,
      postCount,
      likesSum: media.reduce((s, m) => s + m.likeCount, 0),
      commentsSum: media.reduce((s, m) => s + m.commentsCount, 0),
      sampleCount: media.length,
      interactions7: cur7.totalInteractions,
      interactionsPrev7: prev7.totalInteractions,
      denominator7: cur7.reach,
      denominatorPrev7: prev7.reach,
      typeCounts,
    },
  };
}

/**
 * Threads 대시보드 조각 — computeInstagramPiece와 동일 구조.
 * Threads는 프로필 필드에 팔로워·게시물 총수가 없어(스펙 5절) 인사이트/목록 조회로 근사한다:
 * - followers: threads_insights(followers_count, lifetime 스냅샷)
 * - posts: 최근 게시물 목록 길이로 근사(공식 총계 아님, TODO — 정확한 총계는 전체 페이지네이션 필요)
 * - 참여율 분모는 reach 지표가 없어 조회수(views)로 대체한다.
 */
async function computeThreadsPiece(row: AccountRow): Promise<DashboardPiece | null> {
  const token = await ensureFreshToken(row, refreshThreadsLongLivedToken);
  if (!token) return null;

  const th = row.platform_user_id!;
  const until = hourAlignedNowUnix();
  const since7 = until - 7 * DAY;
  const since14 = until - 14 * DAY;

  const infoPromise = fetchThreadsAccountInfo(token).catch(() => null);

  const [info, followers, cur7, prev7, media] = await Promise.all([
    infoPromise,
    fetchThreadsFollowersCount(th, token),
    fetchThreadsAccountInsightsRange(th, token, since7, until),
    fetchThreadsAccountInsightsRange(th, token, since14, since7),
    fetchRecentThreadsPosts(th, token, 25),
  ]);

  const postCount = media.length; // 근사치 — 위 함수 주석 참고

  // 계정 정보 최신화 — 실패는 무시 (다음 로드에서 재시도)
  if (info) {
    const supabase = await createClient();
    const patch = {
      followers,
      posts: postCount,
      display_name: info.name ?? info.username ?? null,
      bio: info.biography,
    };
    const { error: patchErr } = await supabase
      .from("connected_accounts")
      .update({ ...patch, avatar_url: info.profilePictureUrl })
      .eq("id", row.id);
    if (patchErr && /avatar_url/i.test(patchErr.message)) {
      await supabase.from("connected_accounts").update(patch).eq("id", row.id);
    } else if (patchErr) {
      console.error("[live] Threads 계정 정보 갱신 실패:", patchErr.message);
    }
  }

  // 게시물별 인사이트 — 최근 10개만 (호출량 절제, 300초 캐시). Threads 목록 필드엔 좋아요/댓글 수가
  // 없어(스펙 9절) 인사이트 호출이 IG보다 더 필수적이다.
  const withInsights = media.slice(0, 10);
  const postInsights = await Promise.all(withInsights.map((p) => fetchThreadsPostInsights(p.id, token)));

  const likesSum = postInsights.reduce((s, i) => s + (i?.likes ?? 0), 0);
  const repliesSum = postInsights.reduce((s, i) => s + (i?.replies ?? 0), 0);
  const sampleCount = withInsights.length;
  const avg = (sum: number, n: number) => (n > 0 ? sum / n : 0);

  const interactions7 = cur7.likes + cur7.replies + cur7.reposts + cur7.quotes;
  const interactionsPrev7 = prev7.likes + prev7.replies + prev7.reposts + prev7.quotes;
  const engagementRate = cur7.views > 0 ? (interactions7 / cur7.views) * 100 : 0;
  const prevEngagementRate = prev7.views > 0 ? (interactionsPrev7 / prev7.views) * 100 : 0;

  const displayName = info?.name ?? row.display_name ?? row.handle;

  const summary: DashboardSummary = {
    channel: "threads",
    followers,
    followersDelta: 0, // Threads 팔로워는 스냅샷만 제공 — 일별 순증감 산출 불가(TODO, 스펙 5절)
    weeklyViews: cur7.views,
    weeklyViewsDelta: prev7.views > 0 ? Number((((cur7.views - prev7.views) / prev7.views) * 100).toFixed(1)) : 0,
    postCount,
    avgLikes: Math.round(avg(likesSum, sampleCount)),
    avgComments: Math.round(avg(repliesSum, sampleCount)),
    engagementRate: Number(engagementRate.toFixed(2)),
    engagementDelta: Number((engagementRate - prevEngagementRate).toFixed(2)),
  };

  const posts: Post[] = withInsights.map((p, i) => ({
    id: p.id,
    channel: "threads",
    type: toThreadsPostType(p),
    caption: p.text?.split("\n")[0]?.slice(0, 80) || "(텍스트 없음)",
    publishedAt: p.timestamp ?? new Date().toISOString(),
    views: postInsights[i]?.views ?? 0,
    likes: postInsights[i]?.likes ?? 0,
    comments: postInsights[i]?.replies ?? 0,
    shares: postInsights[i]?.shares ?? 0,
    trend: [],
  }));

  const grid: ProfileGridPost[] = withInsights.slice(0, 9).map((p, i) => ({
    id: p.id,
    type: toThreadsPostType(p),
    views: postInsights[i]?.views ?? 0,
    likes: postInsights[i]?.likes ?? 0,
    thumbnailUrl: p.mediaUrl,
  }));

  const typeCounts: Partial<Record<PostType, number>> = {};
  for (const p of media) {
    const t = toThreadsPostType(p);
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  const mix = contentMixFromCounts(typeCounts);

  // 조회수 일별 시계열 — 팔로워 시계열은 없어 followers 곡선은 항상 빈 배열(EmptyState로 안내됨)
  const viewsSeries = await fetchThreadsDailyViews(th, token, since14, until);
  const fmtLabel = (d: string | undefined) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : "");
  const trend: ChannelTrend =
    viewsSeries.length >= 2
      ? {
          startLabel: fmtLabel(viewsSeries[0]?.date),
          endLabel: fmtLabel(viewsSeries.at(-1)?.date),
          followers: [],
          views: viewsSeries.map((p) => p.value),
          engagement: [],
        }
      : EMPTY_TREND;

  const account: ChannelAccount = {
    channel: "threads",
    handle: row.handle,
    displayName,
    bio: info?.biography ?? row.bio ?? "",
    avatarUrl: info?.profilePictureUrl ?? row.avatar_url ?? null,
    connected: true,
    followers,
    followersDelta7d: 0,
    posts: postCount,
    avgEngagementRate: summary.engagementRate,
    tokenExpiresInDays: daysUntil(row.token_expires_at),
  };

  return {
    account,
    summary,
    posts,
    contentMix: mix,
    profileGrid: grid,
    trend,
    raw: {
      followers,
      followersDelta: 0,
      views7: cur7.views,
      viewsPrev7: prev7.views,
      postCount,
      likesSum,
      commentsSum: repliesSum,
      sampleCount,
      interactions7,
      interactionsPrev7,
      denominator7: cur7.views, // Threads엔 reach 지표가 없어 조회수로 대체
      denominatorPrev7: prev7.views,
      typeCounts,
    },
  };
}

/**
 * TikTok 대시보드 조각 — computeInstagramPiece/computeThreadsPiece와 형태는 같지만 내용은 훨씬 얇다.
 * 심사 없이(Sandbox + target user) 확인된 범위가 GET /v2/user/info/ 기본 프로필(팔로워·좋아요·영상 수)
 * 뿐이라(docs/REAL_API_SPEC.md 6절), 조회수·참여율·게시물 목록 등 인사이트 계열은 전부
 * posts:[]/contentMix:[]/EMPTY_TREND/engagementRate:0으로 정직하게 비워둔다 — 없는 걸 있는 척 만들지 않는다.
 * followers/postCount만 실제 API 값이라 raw에 실어 "전체" 합산에는 반영된다(팔로워 합계는 정확해야 하므로).
 */
async function computeTiktokPiece(row: AccountRow): Promise<DashboardPiece | null> {
  const token = await ensureFreshTiktokToken(row);
  if (!token) return null;

  const info = await fetchTiktokUserInfo(token).catch(() => null);
  const followers = info?.followerCount ?? row.followers;
  const postCount = info?.videoCount ?? row.posts;

  // 프로필 최신화 — 실패는 무시 (다음 로드에서 재시도)
  if (info) {
    const supabase = await createClient();
    const patch = {
      followers,
      posts: postCount,
      display_name: info.displayName ?? info.username ?? null,
    };
    const { error: patchErr } = await supabase
      .from("connected_accounts")
      .update({ ...patch, avatar_url: info.avatarUrl })
      .eq("id", row.id);
    if (patchErr && /avatar_url/i.test(patchErr.message)) {
      await supabase.from("connected_accounts").update(patch).eq("id", row.id);
    } else if (patchErr) {
      console.error("[live] TikTok 계정 정보 갱신 실패:", patchErr.message);
    }
  }

  const summary: DashboardSummary = { ...zeroSummary("tiktok"), followers, postCount };

  const account: ChannelAccount = {
    channel: "tiktok",
    handle: info?.username ? `@${info.username}` : row.handle,
    displayName: info?.displayName ?? row.display_name ?? row.handle,
    bio: "", // TODO: user.info.profile의 bio_description — 최소 스코프 원칙상 미요청(lib/tiktok/oauth.ts)
    avatarUrl: info?.avatarUrl ?? row.avatar_url ?? null,
    connected: true,
    followers,
    followersDelta7d: 0, // 일별 팔로워 시계열 API 미확보(TODO, docs/REAL_API_SPEC.md 6절)
    posts: postCount,
    avgEngagementRate: 0, // 참여율 산출용 조회수 등 인사이트 API 미확보(TODO)
    tokenExpiresInDays: null, // 24h 액세스 토큰 자동 갱신 — 근거는 getConnectedTiktokAccount 주석 참고
  };

  return {
    account,
    summary,
    posts: [],
    contentMix: [],
    profileGrid: [],
    trend: EMPTY_TREND,
    raw: {
      followers,
      followersDelta: 0,
      views7: 0,
      viewsPrev7: 0,
      postCount,
      likesSum: 0,
      commentsSum: 0,
      sampleCount: 0,
      interactions7: 0,
      interactionsPrev7: 0,
      denominator7: 0,
      denominatorPrev7: 0,
      typeCounts: {},
    },
  };
}

/** "전체" 필터용 병합 요약 — 원시 분자·분모를 합산한 뒤 비율을 재계산한다.
 *  연동된 채널이 몇 개든(현재 최대 3개: 인스타그램·Threads·TikTok) 처리할 수 있도록 배열을 받는다. */
function mergeSummaries(raws: (DashboardPieceRaw | null | undefined)[]): DashboardSummary {
  const valid = raws.filter((r): r is DashboardPieceRaw => Boolean(r));
  if (valid.length === 0) return zeroSummary("all");
  const pick = (f: (r: DashboardPieceRaw) => number) => valid.reduce((sum, r) => sum + f(r), 0);

  const followers = pick((r) => r.followers);
  const followersDelta = pick((r) => r.followersDelta);
  const views7 = pick((r) => r.views7);
  const viewsPrev7 = pick((r) => r.viewsPrev7);
  const postCount = pick((r) => r.postCount);
  const likesSum = pick((r) => r.likesSum);
  const commentsSum = pick((r) => r.commentsSum);
  const sampleCount = pick((r) => r.sampleCount);
  const interactions7 = pick((r) => r.interactions7);
  const interactionsPrev7 = pick((r) => r.interactionsPrev7);
  const denominator7 = pick((r) => r.denominator7);
  const denominatorPrev7 = pick((r) => r.denominatorPrev7);

  const engagementRate = denominator7 > 0 ? (interactions7 / denominator7) * 100 : 0;
  const prevEngagementRate = denominatorPrev7 > 0 ? (interactionsPrev7 / denominatorPrev7) * 100 : 0;

  return {
    channel: "all",
    followers,
    followersDelta,
    weeklyViews: views7,
    weeklyViewsDelta: viewsPrev7 > 0 ? Number((((views7 - viewsPrev7) / viewsPrev7) * 100).toFixed(1)) : 0,
    postCount,
    avgLikes: sampleCount > 0 ? Math.round(likesSum / sampleCount) : 0,
    avgComments: sampleCount > 0 ? Math.round(commentsSum / sampleCount) : 0,
    engagementRate: Number(engagementRate.toFixed(2)),
    engagementDelta: Number((engagementRate - prevEngagementRate).toFixed(2)),
  };
}

function mergeContentMix(raws: (DashboardPieceRaw | null | undefined)[]): ContentMix[] {
  const merged: Partial<Record<PostType, number>> = {};
  for (const raw of raws) {
    if (!raw) continue;
    for (const [t, n] of Object.entries(raw.typeCounts) as [PostType, number][]) {
      merged[t] = (merged[t] ?? 0) + n;
    }
  }
  return contentMixFromCounts(merged);
}

/**
 * 대시보드 실데이터 — 연동된 인스타그램/Threads/TikTok 계정의 실 데이터를 UI 뷰모델로 변환.
 * 세 채널 다 미연동이면 null(호출측이 목/빈 데이터 폴백). 일부만 연동돼도 실데이터를 채우고
 * 나머지 채널은 disconnectedAccount/zeroSummary로 폴백한다. "전체"는 연동된 채널을 합산한다.
 * TikTok은 기본 프로필(팔로워·영상 수)만 실데이터이고 조회수·참여율 등은 항상 0이다(computeTiktokPiece 주석 참고).
 */
export async function getLiveDashboard(): Promise<LiveDashboard | null> {
  const [igRow, thRow, tkRow] = await Promise.all([loadInstagramRow(), loadThreadsRow(), loadTiktokRow()]);
  if (
    (!igRow || !igRow.platform_user_id) &&
    (!thRow || !thRow.platform_user_id) &&
    (!tkRow || !tkRow.platform_user_id)
  ) {
    return null;
  }

  const [igPiece, thPiece, tkPiece] = await Promise.all([
    igRow && igRow.platform_user_id ? computeInstagramPiece(igRow) : Promise.resolve(null),
    thRow && thRow.platform_user_id ? computeThreadsPiece(thRow) : Promise.resolve(null),
    tkRow && tkRow.platform_user_id ? computeTiktokPiece(tkRow) : Promise.resolve(null),
  ]);
  if (!igPiece && !thPiece && !tkPiece) return null;

  const igAccount = igPiece?.account ?? disconnectedAccount("instagram");
  const thAccount = thPiece?.account ?? disconnectedAccount("threads");
  const tkAccount = tkPiece?.account ?? disconnectedAccount("tiktok");

  return {
    accounts: [igAccount, tkAccount, thAccount],
    summaries: {
      all: mergeSummaries([igPiece?.raw, thPiece?.raw, tkPiece?.raw]),
      instagram: igPiece?.summary ?? zeroSummary("instagram"),
      tiktok: tkPiece?.summary ?? zeroSummary("tiktok"),
      threads: thPiece?.summary ?? zeroSummary("threads"),
    },
    // TikTok 게시물 목록은 심사 없이 확보된 API가 없어(docs/REAL_API_SPEC.md 6절) 항상 빈 배열이다.
    posts: [...(igPiece?.posts ?? []), ...(thPiece?.posts ?? [])],
    contentMix: {
      all: mergeContentMix([igPiece?.raw, thPiece?.raw, tkPiece?.raw]),
      instagram: igPiece?.contentMix ?? [],
      tiktok: tkPiece?.contentMix ?? [],
      threads: thPiece?.contentMix ?? [],
    },
    profileGrid: {
      instagram: igPiece?.profileGrid ?? [],
      tiktok: tkPiece?.profileGrid ?? [],
      threads: thPiece?.profileGrid ?? [],
    },
    trends: {
      instagram: igPiece?.trend ?? EMPTY_TREND,
      tiktok: tkPiece?.trend ?? EMPTY_TREND,
      threads: thPiece?.trend ?? EMPTY_TREND,
    },
  };
}

/** 연동 계정의 API 접근 컨텍스트 — 콘텐츠 분석 등 개별 기능이 재사용한다. 연동/토큰 없으면 null.
 *  인스타그램 전용(자동 DM·콘텐츠 분석은 인스타그램만 지원 — lib/types.ts 하단 주석 참고). */
export async function getInstagramAccessContext(): Promise<{ igUserId: string; token: string } | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;
  const token = await ensureFreshToken(row);
  if (!token) return null;
  return { igUserId: row.platform_user_id, token };
}

/**
 * 자동 DM 게시물 피커용 최근 게시물 — 미디어 목록만 경량 조회(개별 인사이트 호출 없음).
 * 연동/토큰 없으면 빈 배열 (에디터가 연동 안내를 띄운다). 인스타그램 전용.
 */
export async function getRecentPostsForPicker(): Promise<Post[]> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return [];
  const token = await ensureFreshToken(row);
  if (!token) return [];

  const media = await fetchRecentMedia(row.platform_user_id, token, 25);
  return media.map((m) => ({
    id: m.id,
    channel: "instagram" as const,
    type: toPostType(m),
    caption: m.caption?.split("\n")[0]?.slice(0, 80) || "(캡션 없음)",
    publishedAt: m.timestamp ?? new Date().toISOString(),
    views: 0, // 피커에선 조회수 미사용 — 개별 인사이트 호출 절제
    likes: m.likeCount,
    comments: m.commentsCount,
    shares: 0,
    trend: [],
  }));
}

export interface LiveAudience {
  /** 최근 14일 일별 — reach·팔로워 순증감 (100팔로워 미만이면 follower 계열 결측 가능) */
  daily: { date: string; reach: number; followerNet: number }[];
  /** 합산 지표 — 기간(7/14일)별로 UI가 선택 */
  totals7: { accountsEngaged: number; totalInteractions: number; profileLinksTaps: number };
  totals14: { accountsEngaged: number; totalInteractions: number; profileLinksTaps: number };
}

type AudienceTotals = LiveAudience["totals7"];

const ZERO_AUDIENCE_TOTALS: AudienceTotals = { accountsEngaged: 0, totalInteractions: 0, profileLinksTaps: 0 };

/**
 * 팔로워 분석 실데이터 — 일별 도달·순증감 + 참여 합산. 인스타그램/Threads 중 하나라도
 * 연동돼 있으면 값을 채우고(날짜 기준 합산), 둘 다 없으면 null.
 * Threads는 reach 대신 조회수(views)를, 팔로워 순증감은 일별 시계열이 없어 항상 0을 쓴다(TODO 스펙 5절).
 */
export async function getLiveAudience(): Promise<LiveAudience | null> {
  const [igRow, thRow] = await Promise.all([loadInstagramRow(), loadThreadsRow()]);
  const [igToken, thToken] = await Promise.all([
    igRow && igRow.platform_user_id ? ensureFreshToken(igRow) : Promise.resolve(null),
    thRow && thRow.platform_user_id ? ensureFreshToken(thRow, refreshThreadsLongLivedToken) : Promise.resolve(null),
  ]);
  if (!igToken && !thToken) return null;

  const until = hourAlignedNowUnix();
  const since7 = until - 7 * DAY;
  const since14 = until - 14 * DAY;

  let igDaily: LiveAudience["daily"] = [];
  let igTotals7: AudienceTotals = ZERO_AUDIENCE_TOTALS;
  let igTotals14: AudienceTotals = ZERO_AUDIENCE_TOTALS;

  if (igToken && igRow?.platform_user_id) {
    const ig = igRow.platform_user_id;
    const [reachSeries, followerSeries, cur7, cur14] = await Promise.all([
      fetchDailySeries(ig, igToken, "reach", since14, until),
      fetchDailySeries(ig, igToken, "follower_count", since14, until),
      fetchAccountInsightsRange(ig, igToken, since7, until), // 대시보드와 동일 URL — 캐시 공유
      fetchAccountInsightsRange(ig, igToken, since14, until),
    ]);
    const followerByDate = new Map(followerSeries.map((p) => [p.date, p.value]));
    igDaily =
      reachSeries.length > 0
        ? reachSeries.map((p) => ({ date: p.date, reach: p.value, followerNet: followerByDate.get(p.date) ?? 0 }))
        : followerSeries.map((p) => ({ date: p.date, reach: 0, followerNet: p.value }));
    igTotals7 = { accountsEngaged: cur7.accountsEngaged, totalInteractions: cur7.totalInteractions, profileLinksTaps: cur7.profileLinksTaps };
    igTotals14 = { accountsEngaged: cur14.accountsEngaged, totalInteractions: cur14.totalInteractions, profileLinksTaps: cur14.profileLinksTaps };
  }

  let thDaily: LiveAudience["daily"] = [];
  let thTotals7: AudienceTotals = ZERO_AUDIENCE_TOTALS;
  let thTotals14: AudienceTotals = ZERO_AUDIENCE_TOTALS;

  if (thToken && thRow?.platform_user_id) {
    const th = thRow.platform_user_id;
    const [viewsSeries, cur7, cur14] = await Promise.all([
      fetchThreadsDailyViews(th, thToken, since14, until),
      fetchThreadsAccountInsightsRange(th, thToken, since7, until),
      fetchThreadsAccountInsightsRange(th, thToken, since14, until),
    ]);
    // followerNet: Threads 팔로워는 스냅샷만 제공돼 일별 순증감 산출 불가 — 0 고정
    thDaily = viewsSeries.map((p) => ({ date: p.date, reach: p.value, followerNet: 0 }));
    // accountsEngaged 대응 지표 없음(TODO) — totalInteractions은 좋아요+답글+리포스트+인용, profileLinksTaps 대용은 clicks
    thTotals7 = { accountsEngaged: 0, totalInteractions: cur7.likes + cur7.replies + cur7.reposts + cur7.quotes, profileLinksTaps: cur7.clicks };
    thTotals14 = { accountsEngaged: 0, totalInteractions: cur14.likes + cur14.replies + cur14.reposts + cur14.quotes, profileLinksTaps: cur14.clicks };
  }

  // 날짜 기준 병합(두 채널 다 있으면 같은 날짜끼리 합산)
  const dateMap = new Map<string, { reach: number; followerNet: number }>();
  for (const d of [...igDaily, ...thDaily]) {
    if (!d.date) continue;
    const prev = dateMap.get(d.date) ?? { reach: 0, followerNet: 0 };
    dateMap.set(d.date, { reach: prev.reach + d.reach, followerNet: prev.followerNet + d.followerNet });
  }
  const merged = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));

  return {
    daily: merged,
    totals7: {
      accountsEngaged: igTotals7.accountsEngaged + thTotals7.accountsEngaged,
      totalInteractions: igTotals7.totalInteractions + thTotals7.totalInteractions,
      profileLinksTaps: igTotals7.profileLinksTaps + thTotals7.profileLinksTaps,
    },
    totals14: {
      accountsEngaged: igTotals14.accountsEngaged + thTotals14.accountsEngaged,
      totalInteractions: igTotals14.totalInteractions + thTotals14.totalInteractions,
      profileLinksTaps: igTotals14.profileLinksTaps + thTotals14.profileLinksTaps,
    },
  };
}

/**
 * 라이브 인사이트 + 미디어. 연동/토큰/설정 중 하나라도 없으면 null → 호출측 폴백.
 * 부분 실패(인사이트만 막힘 등)는 어댑터가 0/빈배열로 흡수한다. 인스타그램 전용.
 */
export async function getLiveInstagramAnalytics(): Promise<LiveInstagramAnalytics | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;

  const token = await ensureFreshToken(row);
  if (!token) return null;

  const igId = row.platform_user_id;
  const [insights, media] = await Promise.all([
    fetchAccountInsights(igId, token),
    fetchRecentMedia(igId, token),
  ]);

  return {
    account: {
      id: row.id,
      platformUserId: igId,
      handle: row.handle,
      displayName: row.display_name,
      bio: row.bio,
      followers: row.followers,
      posts: row.posts,
      tokenExpiresInDays: daysUntil(row.token_expires_at),
    },
    insights,
    media,
  };
}
