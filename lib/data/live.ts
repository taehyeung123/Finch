/**
 * 실 데이터 프로바이더 (서버 전용) — 연동된 인스타그램 계정의 실 인사이트/미디어를 조회한다.
 *
 * 흐름: connected_accounts 조회(RLS) → 토큰 복호화 → 만료 임박 시 갱신·재저장 → 어댑터 호출.
 * 라이브 인사이트는 Meta 앱 심사·비즈니스 인증 완료 후에만 실제로 값이 채워진다(그 전엔 dev 테스터 계정만).
 * 어떤 단계든 불가하면 null을 반환해 호출측이 데모/빈 상태로 폴백하게 한다.
 *
 * next/headers(createClient) 경유라 서버 컨텍스트에서만 동작한다.
 */

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { fetchAccountInfo, refreshLongLivedToken } from "@/lib/meta/instagram-oauth";
import {
  fetchAccountInsights,
  fetchAccountInsightsRange,
  fetchDailySeries,
  fetchMediaInsights,
  fetchRecentMedia,
  type AccountInsights,
  type MediaItem,
} from "@/lib/meta/instagram";
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
  connected: boolean;
  followers: number;
  posts: number;
  access_token_cipher: string | null;
  token_expires_at: string | null;
}

/** 연동된 인스타 계정 행 조회 (토큰 포함, 서버 전용). 없으면 null.
 *  select("*")를 쓰는 이유: 마이그레이션 시점 차이로 선택 컬럼이 없으면 조회 전체가
 *  실패해 대시보드가 통째로 폴백되는 것을 막기 위해 — 결측 컬럼은 undefined로 흡수한다. */
async function loadInstagramRow(): Promise<AccountRow | null> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("channel", "instagram")
    .eq("connected", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[live] 인스타 계정 조회 실패:", error.message);
    return null;
  }
  return (data as AccountRow | null) ?? null;
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

/**
 * 유효 토큰 확보 — 만료 임박(<=10일)이면 갱신 후 재저장. 만료·복호화 실패면 null.
 * 갱신은 실패해도 기존 토큰으로 시도(아직 유효할 수 있음)하되, 이미 만료면 포기.
 */
async function ensureFreshToken(row: AccountRow): Promise<string | null> {
  const token = decryptToken(row.access_token_cipher);
  if (!token) return null;

  const remaining = daysUntil(row.token_expires_at);
  if (remaining !== null && remaining <= 0) {
    // 이미 만료 — 재연동 필요
    return null;
  }
  if (remaining !== null && remaining <= 10) {
    try {
      const refreshed = await refreshLongLivedToken(token);
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

/* ── 대시보드/팔로워분석 뷰모델 ────────────────────────────── */

const DAY = 86_400;

/** until을 시간 경계로 라운딩 — 요청 간 URL이 같아져 fetch 캐시(300초)가 공유된다 */
function hourAlignedNowUnix(): number {
  return Math.floor(Date.now() / 1000 / 3600) * 3600;
}

/** media_product_type/media_type → 핀치 PostType */
function toPostType(m: MediaItem): PostType {
  if (m.mediaProductType === "REELS") return "reels";
  if (m.mediaProductType === "STORY") return "story";
  if (m.mediaType === "VIDEO") return "video";
  if (m.mediaType === "CAROUSEL_ALBUM") return "carousel";
  return "feed";
}

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
 * 대시보드 실데이터 — 연동된 인스타 계정의 최근 7일 인사이트·미디어를 UI 뷰모델로 변환.
 * 연동/토큰 없으면 null(호출측이 목/빈 데이터 폴백). 부분 실패는 0/빈값으로 흡수.
 * 계정 정보는 매 로드 시 신선하게 가져와 DB 행도 갱신한다(팔로워 수 스테일 방지).
 */
export async function getLiveDashboard(): Promise<LiveDashboard | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;
  const token = await ensureFreshToken(row);
  if (!token) return null;

  const ig = row.platform_user_id;
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
  const TYPE_LABEL: Record<string, string> = { reels: "릴스", feed: "피드", carousel: "캐러셀", video: "영상", story: "스토리", text: "텍스트" };
  const counts = new Map<string, number>();
  for (const m of media) {
    const t = toPostType(m);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const mix: ContentMix[] =
    media.length > 0
      ? [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => ({ label: TYPE_LABEL[t] ?? t, ratio: Math.round((n / media.length) * 100) }))
      : [];

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

  const igAccount: ChannelAccount = {
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
    accounts: [igAccount, disconnectedAccount("tiktok"), disconnectedAccount("threads")],
    summaries: {
      all: { ...summary, channel: "all" },
      instagram: summary,
      tiktok: zeroSummary("tiktok"),
      threads: zeroSummary("threads"),
    },
    posts,
    contentMix: { all: mix, instagram: mix, tiktok: [], threads: [] },
    profileGrid: { instagram: grid, tiktok: [], threads: [] },
    trends: { instagram: trend, tiktok: EMPTY_TREND, threads: EMPTY_TREND },
  };
}

/** 연동 계정의 API 접근 컨텍스트 — 콘텐츠 분석 등 개별 기능이 재사용한다. 연동/토큰 없으면 null. */
export async function getInstagramAccessContext(): Promise<{ igUserId: string; token: string } | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;
  const token = await ensureFreshToken(row);
  if (!token) return null;
  return { igUserId: row.platform_user_id, token };
}

/**
 * 자동 DM 게시물 피커용 최근 게시물 — 미디어 목록만 경량 조회(개별 인사이트 호출 없음).
 * 연동/토큰 없으면 빈 배열 (에디터가 연동 안내를 띄운다).
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

/** 팔로워 분석 실데이터 — 일별 도달·순증감 + 참여 합산. 연동 없으면 null. */
export async function getLiveAudience(): Promise<LiveAudience | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;
  const token = await ensureFreshToken(row);
  if (!token) return null;

  const ig = row.platform_user_id;
  const until = hourAlignedNowUnix();
  const since7 = until - 7 * DAY;
  const since14 = until - 14 * DAY;

  const [reachSeries, followerSeries, cur7, cur14] = await Promise.all([
    fetchDailySeries(ig, token, "reach", since14, until),
    fetchDailySeries(ig, token, "follower_count", since14, until),
    fetchAccountInsightsRange(ig, token, since7, until), // 대시보드와 동일 URL — 캐시 공유
    fetchAccountInsightsRange(ig, token, since14, until),
  ]);

  const followerByDate = new Map(followerSeries.map((p) => [p.date, p.value]));
  const daily = reachSeries.map((p) => ({
    date: p.date,
    reach: p.value,
    followerNet: followerByDate.get(p.date) ?? 0,
  }));
  // reach 시계열이 비면 follower 시계열 기준으로라도 구성
  const merged =
    daily.length > 0
      ? daily
      : followerSeries.map((p) => ({ date: p.date, reach: 0, followerNet: p.value }));

  return {
    daily: merged,
    totals7: {
      accountsEngaged: cur7.accountsEngaged,
      totalInteractions: cur7.totalInteractions,
      profileLinksTaps: cur7.profileLinksTaps,
    },
    totals14: {
      accountsEngaged: cur14.accountsEngaged,
      totalInteractions: cur14.totalInteractions,
      profileLinksTaps: cur14.profileLinksTaps,
    },
  };
}

/**
 * 라이브 인사이트 + 미디어. 연동/토큰/설정 중 하나라도 없으면 null → 호출측 폴백.
 * 부분 실패(인사이트만 막힘 등)는 어댑터가 0/빈배열로 흡수한다.
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
