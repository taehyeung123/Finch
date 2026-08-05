import { isDemoMode } from "@/lib/supabase/config";
import { referenceSources as mockSources, referenceItems as mockItems } from "@/lib/data";
import { listReferenceItems, listReferenceSources } from "@/lib/actions/reference";
import { LibraryClient } from "./_components/library-client";

/*
  레퍼런스 수집함 — 서버에서 수집 기준·수집 결과를 조회해 클라이언트에 전달.
  - 데모 모드: 목 기준 + 목 수집 결과(지난 수집 예시)
  - 실제 모드: reference_sources(0018)의 내 기준 + reference_items(0019)의 실수집 결과.
    수집 실행은 클라이언트의 "지금 수집" → runCollection 서버 액션(ScrapeCreators 어댑터).
*/
export default async function LibraryPage() {
  const isDemo = isDemoMode();
  const [sources, items] = isDemo
    ? [mockSources, mockItems]
    : await Promise.all([listReferenceSources().then((s) => s ?? []), listReferenceItems()]);
  return <LibraryClient sources={sources} items={items} isDemo={isDemo} />;
}
