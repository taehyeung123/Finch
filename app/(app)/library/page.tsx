import { isDemoMode } from "@/lib/supabase/config";
import { referenceSources as mockSources, referenceItems } from "@/lib/data";
import { listReferenceSources } from "@/lib/actions/reference";
import { LibraryClient } from "./_components/library-client";

/*
  레퍼런스 수집함 (훔쳐봐 대응 기능) — 서버에서 수집 기준을 조회해 클라이언트에 전달.
  - 데모 모드: 목 기준 + 목 수집 결과(지난 수집 예시)
  - 실제 모드: Supabase reference_sources(마이그레이션 0018)의 내 기준, 수집 아이템은
    수집 엔진(3rd party) 연동 전까지 빈 배열 — 화면은 정직한 준비중 안내를 보여준다.
*/
export default async function LibraryPage() {
  const isDemo = isDemoMode();
  const sources = isDemo ? mockSources : ((await listReferenceSources()) ?? []);
  const items = isDemo ? referenceItems : [];
  return <LibraryClient sources={sources} items={items} isDemo={isDemo} />;
}
