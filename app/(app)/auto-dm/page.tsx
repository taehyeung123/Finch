import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { autoDmRules as sampleRules, recentPosts as samplePosts } from "@/lib/data";
import { getRecentPostsForPicker } from "@/lib/data/live";
import { RULE_COLUMNS, ruleFromRow, type AutoDmRuleRow } from "@/lib/auto-dm/db";
import type { AutoDmRule, Post } from "@/lib/types";
import { AutoDmClient } from "./_components/auto-dm-client";

/**
 * 자동 DM — 서버 페이지.
 * 데모 모드: 샘플 규칙·샘플 게시물 / 실제 모드: auto_dm_rules 실조회(RLS) + 연동 계정 실미디어.
 * DB 접근 실패 시 빈 목록으로 폴백한다 (레이아웃의 fail-open 원칙과 동일).
 */
export default async function AutoDmPage() {
  let rules: AutoDmRule[] = sampleRules;
  let posts: Post[] = samplePosts.filter((p) => p.channel === "instagram");

  if (!isDemoMode()) {
    rules = [];
    try {
      const supabase = await createClient();
      const [{ data, error }, livePosts] = await Promise.all([
        supabase
          .from("auto_dm_rules")
          .select(RULE_COLUMNS)
          .order("created_at", { ascending: false }),
        getRecentPostsForPicker(),
      ]);
      posts = livePosts;
      if (error) {
        console.warn("[auto-dm] 규칙 조회 실패:", error.message);
      } else if (data) {
        rules = (data as unknown as AutoDmRuleRow[]).map(ruleFromRow);
      }
    } catch (e) {
      posts = [];
      console.warn("[auto-dm] 규칙 조회 실패:", e);
    }
  }

  return <AutoDmClient initialRules={rules} posts={posts} />;
}
