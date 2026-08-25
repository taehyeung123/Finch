"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { analyzeSample } from "@/lib/data";
import { getInstagramAccessContext } from "@/lib/data/live";
import { fetchMediaComments, fetchMediaInsights, fetchRecentMedia } from "@/lib/meta/instagram";
import { createClaudeClient, FAST_MODEL } from "@/lib/ai/claude";
import type { AnalyzeResult } from "@/lib/types";

/**
 * 콘텐츠 분석 — 내 계정 게시물 URL을 공식 API로 실분석.
 *
 * 범위(정직 고지): 현재는 "연동한 인스타그램 계정의 최근 게시물"만 분석한다.
 * 타 계정은 Business Discovery(앱 심사 후), 틱톡·쓰레드는 제휴 데이터 연동 후 확장.
 * 시간대별 누적 조회는 공식 API 미제공 — 빈 배열로 반환하고 UI가 안내한다.
 * 사용량: use_quota('content_analysis') — free 월 10회, creator 월 100회, 이상 무제한.
 */

const ANALYSIS_LIMITS: Record<string, number> = {
  free: 10,
  creator: 100,
  pro: 1000000,
  agency: 1000000,
  enterprise: 1000000,
};

export type AnalyzeActionResult =
  | { ok: true; result: AnalyzeResult }
  | { ok: false; error: string };

/** instagram.com URL에서 게시물 shortcode 추출 (p/reel/reels/tv 경로) */
function extractShortcode(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function extractHashtags(caption: string | null): string[] {
  if (!caption) return [];
  return [...new Set(caption.match(/#[^\s#@]+/g) ?? [])].slice(0, 20);
}

/** 댓글 감성 분류 — Claude(자체 추정치). 키 없음·댓글 부족이면 null. */
async function classifySentiment(comments: string[]): Promise<AnalyzeResult["sentiment"]> {
  if (comments.length < 5) return null;
  const client = createClaudeClient();
  if (!client) return null;
  try {
    const response = await client.messages.create({
      model: FAST_MODEL, // 감성 3분류는 Haiku 로 충분 — Opus 는 과스펙 (2026-08-14 확정)
      max_tokens: 300,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              positive: { type: "integer", minimum: 0, maximum: 100 },
              neutral: { type: "integer", minimum: 0, maximum: 100 },
              negative: { type: "integer", minimum: 0, maximum: 100 },
            },
            required: ["positive", "neutral", "negative"],
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `다음 인스타그램 댓글들을 긍정/중립/부정 비율(합계 100)로 분류해줘.\n\n${comments
            .slice(0, 50)
            .map((c, i) => `${i + 1}. ${c.slice(0, 200)}`)
            .join("\n")}`,
        },
      ],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const parsed = JSON.parse(block.text) as { positive: number; neutral: number; negative: number };
    const total = parsed.positive + parsed.neutral + parsed.negative;
    if (total <= 0) return null;
    // 합계를 100으로 정규화
    return {
      positive: Math.round((parsed.positive / total) * 100),
      neutral: Math.round((parsed.neutral / total) * 100),
      negative: Math.max(0, 100 - Math.round((parsed.positive / total) * 100) - Math.round((parsed.neutral / total) * 100)),
    };
  } catch (e) {
    console.error("[analyze] 감성 분류 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function analyzeUrl(url: string): Promise<AnalyzeActionResult> {
  if (isDemoMode()) {
    return { ok: true, result: { ...analyzeSample, url } };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const shortcode = extractShortcode(url.trim());
  if (!shortcode) {
    return {
      ok: false,
      error: "인스타그램 게시물 URL을 입력해 주세요. (틱톡·쓰레드 분석은 준비 중입니다)",
    };
  }

  const ctx = await getInstagramAccessContext();
  if (!ctx) {
    return { ok: false, error: "먼저 설정에서 인스타그램 계정을 연동해 주세요." };
  }

  /* 매칭을 **먼저** 한다. 예전에는 차감이 먼저였는데, 남의 계정 URL 을 넣어
     "최근 50개에서 못 찾았다"는 에러를 받은 사용자도 월 10회 중 1회를 잃었다.
     아무것도 못 받았는데 횟수만 깎이는 건 그냥 뺏은 것이다.
     이 조회는 우리 Graph API 토큰이라 공급사 과금이 없다 — 먼저 해도 손해가 없다. */
  const media = await fetchRecentMedia(ctx.igUserId, ctx.token, 50);
  const target = media.find((m) => m.permalink?.includes(`/${shortcode}/`) || m.permalink?.includes(`/${shortcode}`));
  if (!target) {
    return {
      ok: false,
      error:
        "연동한 계정의 최근 게시물 50개에서 이 URL을 찾지 못했어요. 내 계정 게시물인지 확인해 주세요. (타 계정 게시물 분석은 준비 중입니다)",
    };
  }

  /* 분석할 대상이 확정된 뒤에 차감.
     ⚠️ 한도는 **DB(free_plan_limits)** 가 갖는다 — 0047 이후 use_quota 는 p_limit 인자를 무시한다.
     예전엔 여기서 플랜별 한도를 인자로 넘겼는데, 그 값은 버려지고 DB 에는 content_analysis 행이
     아예 없어서 **모든 플랜에서 언제나 false** 였다(= 기능이 죽어 있었다, 2026-08-25 감사).
     지금은 무료 플랜만 계량기를 탄다. 유료는 통합 크레딧 모델인데 이 기능 단가가 아직 없어
     계량하지 않는다 — 단가가 정해지면 chargeGeneration 으로 옮긴다. */
  const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).maybeSingle();
  const plan = profile?.plan ?? "free";
  if (plan === "free") {
    const { data: allowed, error: quotaErr } = await supabase.rpc("use_quota", {
      p_metric: "content_analysis",
      /* 시그니처 호환용 — DB 가 무시한다(넘겨도 반영되지 않는다) */
      p_limit: ANALYSIS_LIMITS.free,
      p_amount: 1,
    });
    if (quotaErr) {
      console.error("[analyze] 쿼터 확인 실패:", quotaErr.message);
      return { ok: false, error: "사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
    }
    if (!allowed) {
      return { ok: false, error: "이번 달 콘텐츠 분석 한도를 모두 사용했어요. 요금제에서 플랜을 올리면 한도가 늘어납니다." };
    }
  } else {
    /* 유료 플랜은 지금 **막지도 세지도 않는다** — 요금제가 정립되기 전이라 단가도 한도도 없다(사장님 확인, 2026-08-25).
       그렇다고 원가가 눈에 안 보이는 채로 두면 안 된다: docs/COST_STRUCTURE.md 가 「가장 큰 위험 = 무제한 기능의
       원가 상한 부재」라고 적어 둔 바로 그 자리다. 계량기를 붙일 때까지는 로그로 남겨 실사용량을 센다.
       ⚠️ 단가·상한이 정해지면 이 else 를 지우고 chargeGeneration(또는 플랜별 계량기)로 옮긴다. */
    console.info(`[analyze] 유료 플랜 무제한 사용 — plan=${plan} user=${user.id} metric=content_analysis`);
  }

  const [insights, commentTexts] = await Promise.all([
    fetchMediaInsights(target.id, target.mediaProductType, ctx.token),
    fetchMediaComments(target.id, ctx.token, 50),
  ]);
  const sentiment = await classifySentiment(commentTexts);

  return {
    ok: true,
    result: {
      url,
      channel: "instagram",
      isOwnPost: true,
      caption: target.caption?.split("\n")[0]?.slice(0, 120) || "(캡션 없음)",
      publishedAt: target.timestamp ?? new Date().toISOString(),
      views: insights?.views ?? 0,
      likes: target.likeCount,
      comments: target.commentsCount,
      shares: insights?.shares ?? 0,
      hourlyGrowth: [], // 공식 API 미제공 — UI가 안내문 표시
      hashtags: extractHashtags(target.caption),
      sentiment,
    },
  };
}
