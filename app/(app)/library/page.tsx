import { isDemoMode } from "@/lib/supabase/config";
import { referenceSources as mockSources, referenceItems as mockItems } from "@/lib/data";
import { getCollectSettings, listReferenceItems, listReferenceSources } from "@/lib/actions/reference";
import { DEFAULT_COLLECT_SETTINGS } from "@/lib/types";
import { LibraryClient } from "./_components/library-client";

/*
  레퍼런스 수집함 — 서버에서 수집 기준·수집 결과·필터 설정을 조회해 클라이언트에 전달.
  - 데모 모드: 목 기준 + 목 수집 결과(지난 수집 예시) + 기본 필터
  - 실제 모드: reference_sources(0018) + reference_items(0019) + collect_settings(0021).
    수집 실행은 클라이언트의 "지금 수집" → runCollection 서버 액션(ScrapeCreators 어댑터).
*/
/* 수집(공급사 런 대기 포함)이 60초를 넘을 수 있어 서버 액션 실행 상한을 올린다 — 플랜 상한 내에서 적용 */
export const maxDuration = 300;

export default async function LibraryPage() {
  const isDemo = isDemoMode();
  const [sources, items, settings] = isDemo
    ? [mockSources, mockItems, DEFAULT_COLLECT_SETTINGS]
    : await Promise.all([
        listReferenceSources().then((s) => s ?? []),
        listReferenceItems(),
        getCollectSettings(),
      ]);
  return <LibraryClient sources={sources} items={items} settings={settings} isDemo={isDemo} />;
}
