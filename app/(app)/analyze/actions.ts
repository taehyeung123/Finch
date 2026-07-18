"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { analyzeSample } from "@/lib/mock/data";
import { getInstagramAccessContext } from "@/lib/data/live";
import { fetchMediaComments, fetchMediaInsights, fetchRecentMedia } from "@/lib/meta/instagram";
import { createClaudeClient, STUDIO_MODEL } from "@/lib/ai/claude";
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
      model: STUDIO_MODEL,
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

  // 사용량 차감 — 플랜별 한도 (free 월 10회)
  const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).maybeSingle();
  const limit = ANALYSIS_LIMITS[profile?.plan ?? "free"] ?? 10;
  const { data: allowed, error: quotaErr } = await supabase.rpc("use_quota", {
    p_metric: "content_analysis",
    p_limit: limit,
    p_amount: 1,
  });
  if (quotaErr) {
    console.error("[analyze] 쿼터 확인 실패:", quotaErr.message);
    return { ok: false, error: "사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (!allowed) {
    return { ok: false, error: "이번 달 콘텐츠 분석 한도를 모두 사용했어요. 요금제에서 플랜을 올리면 한도가 늘어납니다." };
  }

  // 내 최근 게시물에서 shortcode 매칭 (Graph API는 shortcode 직접 조회를 제공하지 않음)
  const media = await fetchRecentMedia(ctx.igUserId, ctx.token, 50);
  const target = media.find((m) => m.permalink?.includes(`/${shortcode}/`) || m.permalink?.includes(`/${shortcode}`));
  if (!target) {
    return {
      ok: false,
      error:
        "연동한 계정의 최근 게시물 50개에서 이 URL을 찾지 못했어요. 내 계정 게시물인지 확인해 주세요. (타 계정 게시물 분석은 준비 중입니다)",
    };
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
