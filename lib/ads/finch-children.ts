import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { isMissingColumnError } from "@/lib/publish-rules";

/**
 * 핀치가 이 화면에서 만든 하위(광고 세트·광고) id — 감사 로그 `create_ad` 의 adset_id/ad_id(0082 컬럼).
 * 게재 시작 «함께 켜기»의 **기본 체크** 대상이다(스펙 §13-3): 핀치가 만든 것만 기본 켬, 그 밖의 PAUSED 하위는 나열하되 기본 해제.
 * 실패·표 없음·컬럼 없음은 전부 빈 집합 — «기본 해제»로 떨어질 뿐 켜지는 쪽으로 기울지 않는다.
 */
export interface FinchChildren {
  adsetIds: Set<string>;
  adIds: Set<string>;
}

export async function getFinchCreatedChildren(ownerId: string, adAccountId: string, campaignId: string): Promise<FinchChildren> {
  const empty: FinchChildren = { adsetIds: new Set(), adIds: new Set() };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("meta_ad_write_log")
      .select("adset_id, ad_id, result")
      .eq("user_id", ownerId)
      .eq("ad_account_id", adAccountId)
      .eq("campaign_id", campaignId)
      .eq("action", "create_ad")
      .limit(500);
    if (error) {
      if (!isMissingTableError(error) && !isMissingColumnError(error, /adset_id|ad_id/i)) {
        console.error("[ads-tree] 핀치 생성 하위 조회 실패:", error.message);
      }
      return empty;
    }
    const out: FinchChildren = { adsetIds: new Set(), adIds: new Set() };
    for (const row of (data ?? []) as { adset_id: string | null; ad_id: string | null }[]) {
      /* 부분 실패 행(failed + adset_id)도 포함한다 — 광고 세트는 실제로 생겼다 */
      if (row.adset_id) out.adsetIds.add(row.adset_id);
      if (row.ad_id) out.adIds.add(row.ad_id);
    }
    return out;
  } catch (e) {
    console.error("[ads-tree] 핀치 생성 하위 조회 실패:", e);
    return empty;
  }
}
