// 핀치(Finch) 공용 타입 정의
// PART 3 채널 매트릭스, PART 4 기능 명세 기준.
// 실제 API 연동 시 이 타입을 유지한 채 lib/mock 대신 실제 데이터 소스로 교체한다 (PART 10 데이터 소스 추상화).

export type Channel = "instagram" | "tiktok" | "threads";
export type ChannelFilter = Channel | "all";

/** 데이터 출처 — UI에서 공식 API / 제휴 데이터 공급사 구분 배지에 사용 (PART 3) */
export type DataSource = "official" | "thirdparty" | "internal";

/** 채널별 기능 지원 수준 (PART 3 매트릭스) */
export type SupportLevel = "full" | "partial" | "thirdparty" | "none";

export interface ChannelAccount {
  channel: Channel;
  handle: string;
  displayName: string;
  connected: boolean;
  followers: number;
  followersDelta7d: number; // 최근 7일 증감
  posts: number;
  avgEngagementRate: number; // %
  tokenExpiresInDays: number | null;
}

export type PostType = "reels" | "feed" | "story" | "video" | "carousel" | "text";

export interface Post {
  id: string;
  channel: Channel;
  type: PostType;
  caption: string;
  publishedAt: string; // ISO
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** 최근 7일 조회수 추이 (스파크라인용) */
  trend: number[];
}

export interface DashboardSummary {
  channel: ChannelFilter;
  followers: number;
  followersDelta: number;
  weeklyViews: number;
  weeklyViewsDelta: number;
  postCount: number;
  avgLikes: number;
  avgComments: number;
  engagementRate: number;
  engagementDelta: number;
}

/** 콘텐츠 유형 비중 (대시보드 스타일 분석) */
export interface ContentMix {
  label: string;
  ratio: number; // 0~100
}

export interface Competitor {
  id: string;
  channel: Channel;
  handle: string;
  displayName: string;
  category: string;
  followers: number;
  posts: number;
  avgEngagementRate: number;
  avgViews: number;
  uploadPerWeek: number;
  dataSource: DataSource;
}

export interface CompetitorAd {
  id: string;
  pageName: string;
  detectedAt: string;
  startedAt: string;
  runningDays: number;
  platforms: ("facebook" | "instagram")[];
  mediaType: "image" | "video" | "carousel";
  headline: string;
  bodyPreview: string;
  impressionRange: string; // 예: "10K~50K"
  isNew: boolean;
}

export interface AdCampaign {
  id: string;
  name: string;
  objective: string;
  status: "active" | "paused" | "ended";
  dailyBudget: number; // KRW
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
}

export interface TrendItem {
  id: string;
  channel: Channel;
  category: string;
  title: string;
  creatorHandle: string;
  views: number;
  likes: number;
  followerCount: number;
  /** 팔로워 대비 조회수 비율 — 자체 추정 스코어 (고지 필수, PART 4.4) */
  reachScore: number;
  postedAgoHours: number;
  dataSource: DataSource;
}

export type NotificationType =
  | "competitor_ad"
  | "trend"
  | "account_spike"
  | "account_drop"
  | "token_expiry"
  | "budget";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface AnalyzeResult {
  url: string;
  channel: Channel;
  isOwnPost: boolean;
  caption: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  hourlyGrowth: number[]; // 업로드 후 시간대별 누적 조회수
  hashtags: string[];
  sentiment: { positive: number; neutral: number; negative: number } | null;
}

export interface PlanFeature {
  label: string;
  free: string;
  creator: string;
  pro: string;
  agency: string;
}

export interface UsageStat {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

export interface ReportItem {
  id: string;
  title: string;
  period: string;
  channels: Channel[];
  format: "pdf" | "excel";
  createdAt: string;
  scheduled: boolean;
}

/** 오디언스 분석 — 일별 집계 지표 (공식 Insights 범위) */
export interface AudienceDaily {
  date: string; // ISO (일 단위)
  profileViews: number;
  reach: number;
  followerNet: number; // 순증감 (공식 API는 개별 이탈자 식별 불가)
  linkClicks: number;
}

/** 자주 반응하는 팬 — 공개 상호작용(댓글·좋아요) 기반. 프로필 "방문자" 식별이 아님 */
export interface TopEngager {
  id: string;
  handle: string;
  displayName: string;
  comments30d: number;
  likes30d: number;
  isFollower: boolean;
  lastEngagedAt: string;
}

export interface IdeaSuggestion {
  id: string;
  topic: string;
  reason: string;
  category: string;
  channels: Channel[];
  expectedEngagement: "high" | "mid" | "low";
}
