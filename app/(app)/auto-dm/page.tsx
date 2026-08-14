import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { autoDmRules as sampleRules, recentPosts as samplePosts } from "@/lib/data";
import { getIgAvatarUrl, getRecentPostsForPicker } from "@/lib/data/live";
import { getCurrentPlan } from "@/lib/data/internal";
import { RULE_COLUMNS, RULE_COLUMNS_LEGACY, ruleFromRow, type AutoDmRuleRow } from "@/lib/auto-dm/db";
import { dmContentLimitFor } from "@/lib/auto-dm/limits";
import type { AutoDmRule, Post } from "@/lib/types";
import { AutoDmClient } from "./_components/auto-dm-client";

/**
 * 자동 DM — 서버 페이지.
 * 데모 모드: 샘플 규칙·샘플 게시물 / 실제 모드: auto_dm_rules 실조회(RLS) + 연동 계정 실미디어.
 * DB 접근 실패 시 빈 목록으로 폴백한다 (레이아웃의 fail-open 원칙과 동일).
 * 플랜별 자동화 콘텐츠 한도(lib/auto-dm/limits.ts)를 클라이언트에 내려 위저드가 게이팅한다.
 */
export default async function AutoDmPage() {
  let rules: AutoDmRule[] = sampleRules;
  let posts: Post[] = samplePosts.filter((p) => p.channel === "instagram");
  let accountHandle: string | null = null;
  let accountAvatar: string | null = null;

  const plan = await getCurrentPlan();
  const contentLimit = dmContentLimitFor(plan);

  if (!isDemoMode()) {
    rules = [];
    try {
      const supabase = await createClient();
      // buttons/post_thumb(0038) 미적용 DB 폴백 — 컬럼 오류 시 legacy 셋으로 재조회
      const loadRules = async (): Promise<{ data: unknown; error: string | null }> => {
        const first = await supabase
          .from("auto_dm_rules")
          .select(RULE_COLUMNS)
          .order("created_at", { ascending: false });
        if (first.error && /buttons|post_thumb|public_replies/i.test(first.error.message)) {
          const fallback = await supabase
            .from("auto_dm_rules")
            .select(RULE_COLUMNS_LEGACY)
            .order("created_at", { ascending: false });
          return { data: fallback.data, error: fallback.error?.message ?? null };
        }
        return { data: first.data, error: first.error?.message ?? null };
      };
      const [{ data, error }, livePosts, accountRes, avatarUrl] = await Promise.all([
        loadRules(),
        getRecentPostsForPicker(),
        supabase
          .from("connected_accounts")
          .select("handle")
          .eq("channel", "instagram")
          .eq("connected", true)
          .maybeSingle(),
        getIgAvatarUrl(),
      ]);
      posts = livePosts;
      accountHandle = (accountRes.data?.handle as string | undefined) ?? null;
      accountAvatar = avatarUrl;
      if (error) {
        console.warn("[auto-dm] 규칙 조회 실패:", error);
      } else if (data) {
        rules = (data as AutoDmRuleRow[]).map(ruleFromRow);
      }
    } catch (e) {
      posts = [];
      console.warn("[auto-dm] 규칙 조회 실패:", e);
    }
  }

  return (
    <AutoDmClient
      initialRules={rules}
      posts={posts}
      contentLimit={contentLimit}
      accountHandle={accountHandle}
      accountAvatar={accountAvatar}
    />
  );
}
