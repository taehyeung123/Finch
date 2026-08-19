// 실제 모드(연동 전)의 빈 데이터 세트 — lib/mock/data.ts와 export 이름·타입을 1:1로 맞춘다.
// 각 항목은 해당 API 연동이 완료되면 lib/data/index.ts에서 실제 소스로 교체된다 (docs/API_ROADMAP.md).

import type {
  AdCampaign,
  AdCampaignDetail,
  AdSource,
  AnalyzeResult,
  AppNotification,
  AudienceDaily,
  AutoDmRule,
  AutoDmSummary,
  Channel,
  ChannelAccount,
  ChannelFilter,
  ChannelTrend,
  CompetitorAd,
  Competitor,
  ContentMix,
  DashboardSummary,
  IdeaSuggestion,
  Post,
  ProfileGridPost,
  ReferenceAd,
  ReferenceItem,
  ReferenceSource,
  ReportItem,
  TopEngager,
  UsageStat,
} from "../types";
import type { LinkWorkspace } from "@/lib/links/types";

export const MOCK_SYNCED_AT = "";

/** 연동된 채널 없음 — Instagram/TikTok/Threads OAuth 연동 후 채워진다 */
export const accounts: ChannelAccount[] = [];

/** 프로필 그리드 — 연동 전 빈 값 */
export const profileGrid: Record<Channel, ProfileGridPost[]> = {
  instagram: [],
  tiktok: [],
  threads: [],
};

/** 성과 추이 — 연동 전 빈 값 */
const emptyTrend: ChannelTrend = { startLabel: "", endLabel: "", followers: [], views: [], engagement: [] };
export const channelTrends: Record<Channel, ChannelTrend> = {
  instagram: emptyTrend,
  tiktok: emptyTrend,
  threads: emptyTrend,
};

const zeroSummary = (channel: ChannelFilter): DashboardSummary => ({
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
});

export const dashboardSummaries: Record<ChannelFilter, DashboardSummary> = {
  all: zeroSummary("all"),
  instagram: zeroSummary("instagram"),
  tiktok: zeroSummary("tiktok"),
  threads: zeroSummary("threads"),
};

export const recentPosts: Post[] = [];

export const contentMix: Record<ChannelFilter, ContentMix[]> = {
  all: [],
  instagram: [],
  tiktok: [],
  threads: [],
};

export const competitors: Competitor[] = [];
export const competitorAds: CompetitorAd[] = [];
export const campaigns: AdCampaign[] = [];
export const campaignDetails: Record<string, AdCampaignDetail> = {};

/** 레퍼런스 수집함 — 실 모드 소스는 DB(0018)에서 읽고, 수집 아이템은 수집 엔진 연동 전 빈 값 */
export const referenceSources: ReferenceSource[] = [];
export const referenceItems: ReferenceItem[] = [];
export const adSources: AdSource[] = [];
export const referenceAds: ReferenceAd[] = [];
export const notifications: AppNotification[] = [];

export const analyzeSample: AnalyzeResult = {
  url: "",
  channel: "instagram",
  isOwnPost: true,
  caption: "",
  publishedAt: "",
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  hourlyGrowth: [],
  hashtags: [],
  sentiment: null,
};

export const analyzeHistory: { id: string; url: string; channel: "instagram" | "tiktok" | "threads"; analyzedAt: string; views: number }[] = [];

export const usageStats: UsageStat[] = [
  { label: "콘텐츠 분석", used: 0, limit: 100, unit: "회" },
  { label: "AI 카드뉴스 생성", used: 0, limit: 30, unit: "회" },
  { label: "경쟁사 등록", used: 0, limit: 10, unit: "개" },
];

export const reports: ReportItem[] = [];
export const ideaSuggestions: IdeaSuggestion[] = [];
export const audienceDaily: AudienceDaily[] = [];
export const topEngagers: TopEngager[] = [];

/** 자동 DM 규칙 — 인스타그램 연동 후 사용자가 게시물별로 생성한다 */
export const autoDmRules: AutoDmRule[] = [];
export const autoDmSummary: AutoDmSummary = {
  activeRules: 0,
  sentToday: 0,
  sent30d: 0,
  deliveryRate: 0,
  replyRate: 0,
};

/** 실제 모드에서는 /links 가 DB(link_pages)를 직접 읽는다 — 샘플이 끼면 안 된다 */
export const linkWorkspace: LinkWorkspace = {
  page: null,
  blocks: [],
  snapshot: null,
  stats: { days: 30, failed: false, views: 0, uniques: 0, clicks: 0, ctr: 0, returning: 0, daily: [], blocks: [], regions: [] },
  leads: [],
};
