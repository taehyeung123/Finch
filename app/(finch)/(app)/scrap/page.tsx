import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/section-header";
import { isDemoMode } from "@/lib/supabase/config";
import { loadScrapPage } from "./actions";
import { ScrapClient } from "./_components/scrap-client";

export const metadata: Metadata = {
  title: "스크랩",
  robots: { index: false, follow: false },
};

/*
  스크랩 — 2026-08-15 IA 개편으로 메뉴에 신설, 3단계에서 배선.

  저장 자체는 원래 됐다(togglePoolSave → saved_creatives, 0029). 없던 건
  **다시 볼 곳**이었다. 저장 버튼이 눌리면 카드의 북마크만 채워지고 그걸로 끝이라,
  담을수록 어디 갔는지 모르는 상태였다.

  목록은 서버에서 조회한다. saved_creatives(개인, own-row RLS)에서 시작해 creatives 로
  조인한다 — 반대로 풀에서 시작해 필터하면 수백만 행을 훑는다(lib/pool/search.ts).
  첫 장과 "더 보기"가 같은 loadScrapPage 를 쓴다 — 두 경로가 갈리면 정렬·변환이
  조용히 어긋난다.

  보드(폴더)·메모는 표는 있지만 화면을 더 쪼갤 만큼 저장 건수가 쌓이기 전이라 뒤로 미룬다.
*/
export default async function Page() {
  const { entries, hasMore, failed } = await loadScrapPage(0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="스크랩"
        description="탐색에서 저장한 레퍼런스를 모아 봅니다. 저장한 순서대로 쌓입니다."
      />
      <ScrapClient initialEntries={entries} initialHasMore={hasMore} isDemo={isDemoMode()} loadFailed={!!failed} />
    </div>
  );
}
