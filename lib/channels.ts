// 채널 메타 정보 — 배지 컬러(PART 7.5), 지원 매트릭스(PART 3)
import type { Channel, ChannelFilter, SupportLevel } from "./types";

export const CHANNEL_LABEL: Record<Channel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  threads: "Threads",
};

export const CHANNEL_FILTERS: { value: ChannelFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "threads", label: "Threads" },
];

/** PART 3 매트릭스 축약 — 랜딩/기능 페이지의 "채널 지원 매트릭스"와 각 기능 화면 배지에 공통 사용 */
export interface MatrixRow {
  feature: string;
  instagram: SupportLevel;
  tiktok: SupportLevel;
  threads: SupportLevel;
  note?: string;
}

export const SUPPORT_MATRIX: MatrixRow[] = [
  { feature: "계정 연동·내 게시물 지표", instagram: "full", tiktok: "full", threads: "full" },
  { feature: "계정 인사이트(도달·인구통계)", instagram: "full", tiktok: "partial", threads: "partial", note: "TikTok·Threads는 기본 지표 중심" },
  { feature: "게시물 예약 발행", instagram: "full", tiktok: "full", threads: "full" },
  { feature: "댓글 관리·감성분석", instagram: "full", tiktok: "partial", threads: "full", note: "감성분석은 자체 AI 처리" },
  { feature: "타 계정(경쟁사) 분석", instagram: "partial", tiktok: "thirdparty", threads: "thirdparty", note: "Instagram은 공식 Business Discovery 기초 지표" },
  { feature: "카테고리 탐색·실시간 트렌드", instagram: "thirdparty", tiktok: "thirdparty", threads: "thirdparty", note: "제휴 데이터 공급사 연동" },
  { feature: "경쟁사 광고 자동 모니터링", instagram: "full", tiktok: "thirdparty", threads: "partial", note: "Meta 광고 라이브러리 공식 API" },
  { feature: "AI 카드뉴스·아이디어", instagram: "full", tiktok: "full", threads: "full" },
];

export const SUPPORT_LEVEL_LABEL: Record<SupportLevel, string> = {
  full: "완전 지원",
  partial: "부분 지원",
  thirdparty: "제휴 데이터",
  none: "미지원",
};
