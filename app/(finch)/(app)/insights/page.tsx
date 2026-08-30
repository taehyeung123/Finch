import { audienceDaily, topEngagers } from "@/lib/data";
import { isDemoMode } from "@/lib/supabase/config";
import { getLiveAudience } from "@/lib/data/live";
import { AudienceClient, type AudienceView, type AudienceTotals } from "./_components/audience-client";
import { InsightsTabs } from "./tabs";

/*
  성과 분석 · 개요 (구 팔로워 분석, PART 4.3) — 서버에서 실데이터를 조회해 클라이언트에 전달.
  - 실 모드 + 인스타 연동: 일별 도달·팔로워 순증감 + 참여 합산 (Instagram 공식 API)
  - 데모 모드: 목데이터를 동일 뷰모델로 변환 (참여 계정은 표본값)
  - 실 모드 + 미연동: null → 연동 안내
*/
export default async function AudiencePage() {
  const live = await getLiveAudience();

  let view: AudienceView | null = null;
  if (live) {
    // 팬 랭킹은 댓글 수집(웹훅) 데이터가 쌓인 뒤 채워진다 — 지금은 빈 목록
    view = { ...live, topEngagers: [], isLive: true };
  } else if (isDemoMode()) {
    /* 실 모드가 Meta 에 구간을 따로 질의하듯(live.ts prev7), 데모도 구간을 잘라 만든다 —
       클라이언트에서 빼서 만들지 않는다. 두 모드가 같은 모양의 뷰모델을 받아야
       «데모에선 맞는데 연동하면 틀린» 종류의 차이가 안 생긴다. */
    const totalsOf = (from: number, to = 0): AudienceTotals => {
      const slice = to === 0 ? audienceDaily.slice(-from) : audienceDaily.slice(-from, -to);
      return {
        accountsEngaged: slice.reduce((s, d) => s + d.profileViews, 0),
        totalInteractions: slice.reduce((s, d) => s + d.profileViews + d.linkClicks, 0),
        profileLinksTaps: slice.reduce((s, d) => s + d.linkClicks, 0),
      };
    };
    view = {
      daily: audienceDaily.map((d) => ({ date: d.date, reach: d.reach, followerNet: d.followerNet })),
      totals7: totalsOf(7),
      totals14: totalsOf(14),
      prev7: totalsOf(14, 7),
      totalsOk: true, // 목데이터는 조회가 없어 실패할 수 없다
      topEngagers,
      isLive: false,
    };
  }

  return (
    <div className="space-y-5">
      <InsightsTabs current="overview" />
      <AudienceClient view={view} />
    </div>
  );
}
