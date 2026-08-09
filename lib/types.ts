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
  bio: string; // 프로필 소개 한 줄
  /** 프로필 사진 URL (실 연동 시 공식 API 값) — 없으면 이니셜 배지 폴백 */
  avatarUrl?: string | null;
  connected: boolean;
  followers: number;
  followersDelta7d: number; // 최근 7일 증감
  posts: number;
  avgEngagementRate: number; // %
  tokenExpiresInDays: number | null;
}

/** 프로필 미러링용 게시물 썸네일 — 채널 앱 프로필 그리드 재현 */
export interface ProfileGridPost {
  id: string;
  type: PostType;
  views: number;
  likes: number;
  /** 게시물 썸네일 URL (실 연동 시 공식 API 값) — 없으면 유형 아이콘 폴백 */
  thumbnailUrl?: string | null;
}

/** 채널 성과 추이 — 최근 N일 일별 지표 (대시보드 성과 추이 차트) */
export interface ChannelTrend {
  /** 기간 시작·종료 라벨 (예: "06.30", "07.13") */
  startLabel: string;
  endLabel: string;
  followers: number[]; // 일별 누적 팔로워
  views: number[]; // 일별 조회수
  engagement: number[]; // 일별 참여율(%)
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
  /** 대표 소재 — 이름만으로 캠페인을 식별하기 어려워 목록·성과 화면에 함께 표시한다 */
  creative: {
    format: "image" | "video";
    /** 소재 미리보기 (영상이면 썸네일) */
    imageUrl: string;
    headline: string;
  };
}

/** 캠페인 상세 성과 — 목록에서 캠페인 클릭 시 모달로 노출. Marketing API insights 연동 시 교체 지점 */
export interface AdCampaignDetail {
  /** Meta 광고 ID (표기용) */
  adId: string;
  createdAt: string;
  updatedAt: string;
  /** 조회 기간 라벨 (예: "최근 30일") */
  periodLabel: string;
  /** 이전 기간 대비 증감률(%) — 지표별 */
  deltas: {
    roas: number;
    cpa: number;
    ctr: number;
    cpc: number;
    spend: number;
    impressions: number;
    reach: number;
    frequency: number;
    linkClicks: number;
    purchases: number;
  };
  /** 일별 추이 — 두 배열은 같은 길이 */
  roasTrend: number[];
  cpaTrend: number[];
  /** 전환 퍼널 — 노출부터 구매까지 단계 순서대로 */
  funnel: { label: string; value: number }[];
  /** 게재위치별 지출 비중(%) — 합계 100 */
  placements: { label: string; pct: number }[];
  /** 성별 도달 비중(%) — 합계 100 */
  gender: { male: number; female: number };
  /** 연령 구간별 도달 비중(%) — male+female 합이 구간 비중 */
  ageBands: { range: string; male: number; female: number }[];
  /** 소재 미리보기 카드용 카피 */
  adCopy: { brandName: string; body: string; linkLabel: string; cta: string };
}

/**
 * 후킹 기법 태그 — AI가 콘텐츠에서 감지한 후킹 각도.
 * 스튜디오 카드뉴스 표지 공식 6종과 어휘를 공유해 "이 후킹으로 만들기" 연결이 자연스럽다.
 */
export type HookType =
  | "숫자리스트"
  | "손실회피"
  | "통념깨기"
  | "질문호명"
  | "결과수치"
  | "시의성"
  | "공감자극"
  | "호기심";

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
  /** AI가 감지한 후킹 기법 — 자체 분석 태그 (고지 필수, PART 4.4) */
  hooks: HookType[];
}

/** 레퍼런스 수집 필터 설정 (마이그레이션 0021·0022) — 기간·한국·형식·제외 키워드 */
export interface CollectSettings {
  /** 발행일 필터 — all(상관없음) / 1주 / 1·3·6개월 / 1년 */
  period: "all" | "7d" | "1m" | "3m" | "6m" | "1y";
  /** 한국 콘텐츠만 — 틱톡은 국가 정보, 인스타·스레드는 한글 포함 기준(휴리스틱) */
  krOnly: boolean;
  /** 형식 — 틱톡은 전부 영상, 스레드는 텍스트·사진 위주라 채널별 적용 범위가 다름 */
  mediaFormat: "all" | "video" | "photo" | "carousel";
  /** 제외 키워드 — 캡션·제목에 포함되면 수집에서 제외 (최대 10개) */
  excludeKeywords: string[];
}

export const DEFAULT_COLLECT_SETTINGS: CollectSettings = {
  period: "6m",
  krOnly: false,
  mediaFormat: "all",
  excludeKeywords: [],
};

/** 발행일 필터 → 일수 (all은 null) */
export const PERIOD_DAYS: Record<CollectSettings["period"], number | null> = {
  all: null,
  "7d": 7,
  "1m": 30,
  "3m": 91,
  "6m": 183,
  "1y": 365,
};

/** 레퍼런스 수집 기준 — 사용자가 등록한 키워드·계정·해시태그 (마이그레이션 0018) */
export interface ReferenceSource {
  id: string;
  channel: Channel;
  kind: "keyword" | "account" | "hashtag";
  value: string;
  createdAt: string;
}

/** 수집된 레퍼런스 콘텐츠 — AI 요약·후킹 태그 포함. 수집 엔진(3rd party) 연동 시 교체 지점 */
export interface ReferenceItem {
  id: string;
  channel: Channel;
  category: string;
  title: string;
  /** AI 한국어 요약 — 영상을 재생하지 않아도 내용 파악이 되게 */
  summary: string;
  creatorHandle: string;
  hooks: HookType[];
  views: number;
  likes: number;
  followerCount: number;
  /** 댓글 수 — 0022 이전 수집분은 0 */
  comments?: number;
  /** 캡션에서 추출한 해시태그 (최대 6) */
  hashtags?: string[];
  /** AI 분석 코멘트 — 이 콘텐츠가 왜 반응을 얻었는지 한 문장 (자체 추정, 고지 필수) */
  aiComment?: string;
  /** 어떤 등록 기준(키워드·계정·해시태그)에 걸려 수집됐는지 */
  matchedSource: string;
  collectedAgoHours: number;
  dataSource: DataSource;
  /** 원본 게시물 링크 — 저작권 안전장치(요약+출처 링크). 목데이터는 생략 가능 */
  url?: string | null;
  /** Storage에 캐시된 썸네일 — 없으면 카드가 채널 글리프 자리표시를 보여준다 */
  thumbnailUrl?: string | null;
  /** 즐겨찾기 — 실 모드는 DB 영속(0019), 데모는 화면 상태로만 */
  favorite?: boolean;
  /** 원본 캡션 (앞 500자 저장분) — 상세 모달 전문 표시용 */
  caption?: string;
  /** 내 메모 (0023) */
  note?: string;
  /** 릴스 대본 — 요청 시 음성 받아쓰기 추출·캐시 (0023, 인스타그램만) */
  transcript?: string;
  /** 확인 상태 (0023) */
  status?: "unseen" | "seen" | "skipped";
}

/** 메타광고 레퍼런스 수집 기준 — 사용자가 등록한 검색 키워드 (마이그레이션 0026) */
export interface AdSource {
  id: string;
  value: string;
  createdAt: string;
}

/**
 * 수집된 메타광고 레퍼런스 — reference_items(오가닉)와 필드가 다르다(creatorHandle 대신
 * pageName, 단일 postedAt 대신 startDate/endDate). Channel 없이 별도 목록으로 다룬다
 * (KR 광고는 Instagram·Facebook 등 여러 platforms에 동시 게재되는 경우가 흔함).
 */
export interface ReferenceAd {
  id: string;
  adArchiveId: string;
  pageName: string;
  pageProfileUrl: string | null;
  body: string;
  ctaText: string | null;
  thumbnailUrl: string | null;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  matchedSource: string;
  aiComment: string;
  category: string;
  status: "unseen" | "seen" | "skipped";
  favorite: boolean;
  collectedAgoHours: number;
}

export type NotificationType =
  | "competitor_ad"
  | "trend"
  | "account_spike"
  | "account_drop"
  | "token_expiry"
  | "budget"
  | "billing"
  | "studio";

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
  enterprise: string;
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

/* ────────────────────────────────────────────────────────────
   인스타 댓글 자동 DM (PART 4 확장 — 게시물별 자동 응답)
   인스타그램 전용: Threads·TikTok은 서드파티 DM 발송 API가 없다.
   백엔드는 Instagram Messaging(Private Replies) + 댓글 웹훅으로 연동 예정(API-last).
   Meta 정책상 댓글 1건당 Private Reply는 1회·7일 이내, 이후는 24시간 메시징 창 적용.
──────────────────────────────────────────────────────────── */

/** 발송 트리거 — 모든 댓글 | 특정 키워드 포함 댓글 */
export type AutoDmTrigger = "all" | "keyword";

/** 규칙 상태 — 활성 / 일시중지 / 검수중(정책·연동 대기) */
export type AutoDmStatus = "active" | "paused" | "review";

/** 게시물별 자동 DM 규칙 — 하나의 규칙은 계정의 특정 게시물 1개에 연결된다 */
export interface AutoDmRule {
  id: string;
  /** 대상 게시물 식별 */
  postId: string;
  postCaption: string; // 목록에서 게시물을 알아보기 위한 짧은 캡션
  postType: PostType;
  postViews: number; // 게시물 성과 참고용
  /** 트리거 방식 */
  trigger: AutoDmTrigger;
  keywords: string[]; // trigger="keyword"일 때만 사용
  /** 댓글 공개 답글(선택) — Private Reply가 1회로 제한되므로 공개 답글로 보완 */
  publicReply: string | null;
  /** 발송 DM 본문 */
  dmMessage: string;
  /** DM에 붙는 버튼(선택) — 라벨/URL 쌍 */
  buttonLabel: string | null;
  buttonUrl: string | null;
  status: AutoDmStatus;
  /**
   * 광고성 정보 여부. true면 정보통신망법에 따라 (광고) 표기와 수신거부 안내를
   * 본문에 자동 삽입해야 한다 — UI에서 강제한다.
   */
  isAdvertising: boolean;
  /** 하루 발송 상한 — 스팸 정책·레이트리밋 대비 사용자 설정 캡 */
  dailyCap: number;
  sentTotal: number; // 누적 발송 성공
  sentToday: number; // 오늘 발송(캡 대비)
  failedTotal: number; // 수신 불가·메시징 창 만료 등 발송 실패
  lastSentAt: string | null; // ISO
  createdAt: string; // ISO
}

/** 자동 DM 대시보드 요약 — 발송 성공/응답은 Meta 실제 결과값(자체 추정치 아님) */
export interface AutoDmSummary {
  activeRules: number;
  sentToday: number;
  sent30d: number;
  /** 발송 성공률 % = 성공 / 시도 (Meta 발송 결과 기준) */
  deliveryRate: number;
  /** DM 이후 상대가 답장한 비율 % (Meta 대화 데이터 기준) */
  replyRate: number;
}
