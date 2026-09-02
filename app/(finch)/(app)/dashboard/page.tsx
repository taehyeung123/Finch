import {
  accounts,
  campaigns,
  channelTrends,
  contentMix,
  dashboardSummaries,
  IS_SAMPLE_DATA,
  profileGrid,
  recentPosts,
} from "@/lib/data";
import { getLiveDashboard } from "@/lib/data/live";
import { getLiveAds, summarizeActiveAds, type DashboardAdsSummary } from "@/lib/data/ads";
import { getPoolHomeStats } from "@/lib/pool/home-stats";
import { DashboardClient, type DashboardData } from "./_components/dashboard-client";

/*
  홈 (PART 4.1, 2026-08-14 스니핏식 개편) — 서버에서 실데이터를 조회해 클라이언트에 전달.
  - 상단: 오늘의 핀치 브리핑(공용 풀 수집 현황 + 추천 검색 칩)
  - 실 모드 + 인스타 연동: Instagram 공식 API 실데이터 (최근 7일 인사이트·미디어)
  - 데모 모드 또는 미연동: lib/data 폴백(목/빈 데이터)
  실 호출은 어댑터 단에서 300초 캐시되어 새로고침 연타에도 호출량이 억제된다.
*/
export default async function DashboardPage() {
  /* 광고 요약도 서버에서 만든다 — 예전엔 클라이언트가 빈 campaigns 배열을 집계해
     연결도 안 한 사람에게 「집행 금액 0원」을 확언했다.
     데모 모드에서는 샘플 캠페인을 그대로 쓰므로 요약을 만들지 않는다(null). */
  const [live, poolStats, liveAds] = await Promise.all([
    getLiveDashboard(),
    getPoolHomeStats(),
    IS_SAMPLE_DATA ? Promise.resolve(null) : getLiveAds(),
  ]);
  const adsSummary: DashboardAdsSummary | null = liveAds ? summarizeActiveAds(liveAds) : null;
  /* 연동 가이드 모달 — 실 모드에서 채널이 하나도 안 붙어 있을 때만.
     온보딩 마법사에서 연동 단계를 뺀 자리다(닫기 기억은 모달이 localStorage 로 처리). */
  const showConnectGuide = !IS_SAMPLE_DATA && !(live?.accounts.some((a) => a.connected) ?? false);
  const data: DashboardData = live ?? {
    accounts,
    summaries: dashboardSummaries,
    posts: recentPosts,
    contentMix,
    profileGrid,
    trends: channelTrends,
  };
  return (
    <DashboardClient
      data={data}
      campaigns={campaigns}
      adsSummary={adsSummary}
      poolStats={poolStats}
      isLive={Boolean(live)}
      showConnectGuide={showConnectGuide}
    />
  );
}
