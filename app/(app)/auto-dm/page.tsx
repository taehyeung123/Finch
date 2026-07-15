import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { autoDmRules as sampleRules } from "@/lib/data";
import { RULE_COLUMNS, ruleFromRow, type AutoDmRuleRow } from "@/lib/auto-dm/db";
import type { AutoDmRule } from "@/lib/types";
import { AutoDmClient } from "./_components/auto-dm-client";

/**
 * 자동 DM — 서버 페이지.
 * 데모 모드: 샘플 규칙 / 실제 모드: auto_dm_rules 실조회(RLS가 내 행만 반환).
 * DB 접근 실패 시 빈 목록으로 폴백한다 (레이아웃의 fail-open 원칙과 동일).
 */
export default async function AutoDmPage() {
  let rules: AutoDmRule[] = sampleRules;

  if (!isDemoMode()) {
    rules = [];
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("auto_dm_rules")
        .select(RULE_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[auto-dm] 규칙 조회 실패:", error.message);
      } else if (data) {
        rules = (data as unknown as AutoDmRuleRow[]).map(ruleFromRow);
      }
    } catch (e) {
      console.warn("[auto-dm] 규칙 조회 실패:", e);
    }
  }

  return <AutoDmClient initialRules={rules} />;
}
