import { getReports } from "@/lib/data/internal";
import { ReportsClient } from "./_components/reports-client";

/*
  리포트 (PART 4.11) — 서버에서 실 리포트 목록을 조회해 클라이언트에 전달.
  데모 모드는 목데이터, 실 모드는 로그인 사용자의 reports 행(없으면 빈 상태).
  리포트 생성 폼은 현재 로컬 추가(생성 파일 저장·정기발송은 후속 배선).
*/
export default async function ReportsPage() {
  const initial = await getReports();
  return <ReportsClient initial={initial} />;
}
