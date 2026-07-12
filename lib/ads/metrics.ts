import type { AdCampaign } from "@/lib/types";

/**
 * 광고 지표 공통 집계 — 대시보드와 광고 관리 페이지가 반드시 이 함수를 공유한다
 * (같은 지표가 화면마다 다른 값으로 표시되던 문제의 재발 방지).
 *
 * 평균 지표는 단순 산술평균이 아니라 가중 평균으로 계산한다:
 * - CTR = 총 클릭 ÷ 총 노출 (노출 가중) — 캠페인별 CTR의 단순 평균은 규모가 다른
 *   캠페인을 동일 가중해 계정 실제 성과를 왜곡한다
 * - ROAS = Σ(지출 × ROAS) ÷ Σ지출 (지출 가중) — 전환가치 합 ÷ 지출 합과 동치
 * - CPC = 총 지출 ÷ 총 클릭
 */
export interface AdTotals {
  count: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** 노출 가중 CTR (%) */
  ctr: number;
  /** 지출 가중 ROAS (배) */
  roas: number;
  /** 총 지출 ÷ 총 클릭 (원) */
  cpc: number;
}

export function aggregateCampaigns(list: AdCampaign[]): AdTotals {
  const spend = list.reduce((s, c) => s + c.spend, 0);
  const impressions = list.reduce((s, c) => s + c.impressions, 0);
  const clicks = list.reduce((s, c) => s + c.clicks, 0);
  const conversions = list.reduce((s, c) => s + c.conversions, 0);
  const revenue = list.reduce((s, c) => s + c.spend * c.roas, 0);
  return {
    count: list.length,
    spend,
    impressions,
    clicks,
    conversions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    roas: spend > 0 ? revenue / spend : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
  };
}

/** 진행 중 캠페인만 — 대시보드 "광고 현황" 카드의 집계 범위 */
export function aggregateActive(list: AdCampaign[]): AdTotals {
  return aggregateCampaigns(list.filter((c) => c.status === "active"));
}
