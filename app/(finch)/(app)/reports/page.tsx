import { getReports } from "@/lib/data/internal";
import { LoadFailed } from "@/components/ui/load-failed";
import { ReportsClient } from "./_components/reports-client";

/*
  리포트 (PART 4.11) — 서버에서 실 리포트 목록을 조회해 클라이언트에 전달.
  데모 모드는 목데이터, 실 모드는 로그인 사용자의 reports 행(없으면 빈 상태).
  리포트 생성 폼은 현재 로컬 추가(생성 파일 저장·정기발송은 후속 배선).

  ⚠️ null 은 «리포트 없음»이 아니라 «조회 실패»다 — 만들어 둔 리포트가 있는데
  「리포트가 없습니다」를 보여 주면 다시 만들게 된다(lib/data/internal.ts 규칙).
*/
export default async function ReportsPage() {
  const initial = await getReports();
  if (initial === null) return <LoadFailed title="리포트를 불러오지 못했어요" />;
  return <ReportsClient initial={initial} />;
}
