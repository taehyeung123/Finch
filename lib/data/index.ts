/**
 * 데이터 액세스 레이어 — 페이지·컴포넌트는 반드시 여기서 import 한다 (lib/mock 직접 참조 금지).
 *
 * - 데모 모드(키 미설정 또는 NEXT_PUBLIC_DEMO_MODE=true): 샘플 데이터 표시 + 화면에 예시 배너
 * - 실제 모드: 연동 전까지 빈 데이터 — 각 export가 API/DB 연동 시 교체 지점이다
 *
 * 연동 대상과 순서는 docs/API_ROADMAP.md 참고.
 * NEXT_PUBLIC_ 환경변수는 빌드 시 인라인되므로 서버·클라이언트 어디서나 동작한다.
 */
import { isDemoMode } from "@/lib/supabase/config";
import * as sample from "@/lib/mock/data";
import * as empty from "./empty";

// 두 모듈은 export 이름·타입이 1:1 대응 (empty.ts가 좁은 쪽 기준) — 유니온을 좁은 타입으로 고정
const src = (isDemoMode() ? sample : empty) as typeof empty;

/** 화면의 "예시 데이터" 배너 노출 여부 */
export const IS_SAMPLE_DATA = isDemoMode();

/** 데이터 기준 시각 — 실제 연동 시 수집 잡의 마지막 실행 시각으로 교체 */
export const DATA_SYNCED_AT = src.MOCK_SYNCED_AT;

/* ---- 채널·콘텐츠 (Instagram/TikTok/Threads 공식 API로 교체 예정) ---- */
export const accounts = src.accounts;
export const dashboardSummaries = src.dashboardSummaries;
export const recentPosts = src.recentPosts;
export const contentMix = src.contentMix;
export const analyzeSample = src.analyzeSample;
export const analyzeHistory = src.analyzeHistory;
export const audienceDaily = src.audienceDaily;
export const topEngagers = src.topEngagers;
export const profileGrid = src.profileGrid;

/* ---- 경쟁사·광고 (Meta Ad Library / Marketing API로 교체 예정) ---- */
export const competitors = src.competitors;
export const competitorAds = src.competitorAds;
export const campaigns = src.campaigns;

/* ---- 트렌드 (3rd party 데이터 공급사로 교체 예정) ---- */
export const trendItems = src.trendItems;

/* ---- 서비스 내부 데이터 (Supabase DB로 교체 예정) ---- */
export const notifications = src.notifications;
export const usageStats = src.usageStats;
export const reports = src.reports;
export const ideaSuggestions = src.ideaSuggestions;

/* ---- 제품 설정 (데이터가 아님 — 모드와 무관하게 동일) ---- */
export const TREND_CATEGORIES = sample.TREND_CATEGORIES;
export const planFeatures = sample.planFeatures;
