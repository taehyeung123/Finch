import {
  accounts,
  campaigns,
  channelTrends,
  competitorAds,
  contentMix,
  dashboardSummaries,
  profileGrid,
  recentPosts,
} from "@/lib/data";
import { getLiveDashboard } from "@/lib/data/live";
import { DashboardClient, type DashboardData } from "./_components/dashboard-client";

/*
  대시보드 (PART 4.1) — 서버에서 실데이터를 조회해 클라이언트에 전달.
  - 실 모드 + 인스타 연동: Instagram 공식 API 실데이터 (최근 7일 인사이트·미디어)
  - 데모 모드 또는 미연동: lib/data 폴백(목/빈 데이터)
  실 호출은 어댑터 단에서 300초 캐시되어 새로고침 연타에도 호출량이 억제된다.
*/
export default async function DashboardPage() {
  const live = await getLiveDashboard();
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
      competitorAds={competitorAds}
      isLive={Boolean(live)}
    />
  );
}
