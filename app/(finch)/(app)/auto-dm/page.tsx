import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { autoDmRules as sampleRules, recentPosts as samplePosts } from "@/lib/data";
import { getIgAvatarUrl, getRecentPostsForPicker } from "@/lib/data/live";
import { getCurrentPlan } from "@/lib/data/internal";
import {
  RULE_COLUMNS,
  RULE_COLUMNS_LEGACY,
  RULE_COLUMNS_NO_FOLLOW,
  missingFollowRequest,
  missingLegacyColumns,
  ruleFromRow,
  type AutoDmRuleRow,
} from "@/lib/auto-dm/db";
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
  /* 0052(follow_request) 컬럼이 실제로 있는가 — false 면 위저드가 팔로우 요청 토글을
     비활성화한다. 저장이 조용히 버려지는데 성공으로 보이는 컨트롤은 없느니만 못하다
     (links 0051 때 확정한 규칙 — 같은 패턴, 같은 대책). */
  let followRequestReady = true;
  /* 조회가 실패했는가 — «규칙 0건»과 구분해서 화면에 나른다 */
  let rulesFailed = false;

  /* 플랜 조회가 실패하면 null 이다 — 한도는 fail-closed 로 free 를 쓰되(dmContentLimitFor),
     화면이 그 한도를 «당신 플랜의 한도»라고 단정하면 안 된다. 유료 고객이 이유도 모른 채
     "1/1개 사용 중"으로 막히는 화면이 된다(lib/data/internal.ts 규칙). */
  const plan = await getCurrentPlan();
  const contentLimit = dmContentLimitFor(plan);

  if (!isDemoMode()) {
    rules = [];
    try {
      const supabase = await createClient();
      // buttons/post_thumb(0038) 미적용 DB 폴백 — 컬럼 오류 시 legacy 셋으로 재조회
      /* 컬럼 폴백은 한 단계씩 — 0052 만 없으면 0038·0042 컬럼은 그대로 읽는다.
         폴백 발동 여부는 반환값으로 알린다(클로저 밖 재할당은 린트가 막는다). */
      const loadRules = async (): Promise<{ data: unknown; error: string | null; followReady: boolean }> => {
        const q = (cols: string) =>
          supabase.from("auto_dm_rules").select(cols).order("created_at", { ascending: false });
        let followReady = true;
        let res = await q(RULE_COLUMNS);
        if (res.error && missingFollowRequest(res.error.message)) {
          followReady = false;
          res = await q(RULE_COLUMNS_NO_FOLLOW);
        }
        if (res.error && missingLegacyColumns(res.error.message)) res = await q(RULE_COLUMNS_LEGACY);
        return { data: res.data, error: res.error?.message ?? null, followReady };
      };
      const [{ data, error, followReady }, livePosts, accountRes, avatarUrl] = await Promise.all([
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
      followRequestReady = followReady;
      accountHandle = (accountRes.data?.handle as string | undefined) ?? null;
      accountAvatar = avatarUrl;
      if (error) {
        /* 예전엔 로그만 남기고 rules=[] 로 넘어갔다 — 그러면 화면은 「아직 자동 DM 규칙이 없어요」와
           「실행 중 규칙 0 · 누적 발송 0 · 성공률 0.0%」를 그린다. 규칙이 돌고 있는 사람이 그 화면을
           보면 자동화가 통째로 날아간 줄 안다. 실패는 «없음»이 아니다(lib/data/internal.ts 규칙). */
        console.error("[auto-dm] 규칙 조회 실패:", error);
        rulesFailed = true;
      } else if (data) {
        rules = (data as AutoDmRuleRow[]).map(ruleFromRow);
      }
    } catch (e) {
      posts = [];
      console.error("[auto-dm] 규칙 조회 실패:", e);
      rulesFailed = true;
    }
  }

  return (
    <AutoDmClient
      initialRules={rules}
      rulesFailed={rulesFailed}
      posts={posts}
      contentLimit={contentLimit}
      planFailed={plan === null}
      accountHandle={accountHandle}
      accountAvatar={accountAvatar}
      followRequestReady={followRequestReady}
    />
  );
}
