"use server";

import { createClient } from "@/lib/supabase/server";
import { chargeGeneration, refundGenerationCredits, CREDIT_COSTS } from "@/lib/actions/credits";
import { isDemoMode } from "@/lib/supabase/config";
import { CHAT_MODEL, createClaudeClient } from "@/lib/ai/claude";
import { getConnectedInstagramAccount, getInstagramAccessContext } from "@/lib/data/live";
import { fetchAccountInsightsRange } from "@/lib/meta/instagram";

/**
 * AI 에이전트 챗 v1 — Claude 실호출 + 연동 계정 실지표 컨텍스트 주입.
 * 데모 모드·키 미설정·오류 시 null 반환 → 클라이언트가 기존 목 응답으로 폴백.
 * v2(후속): function calling으로 트렌드 검색·카드뉴스 생성 직접 실행.
 */

export interface AgentChatMessage {
  role: "user" | "agent";
  text: string;
}

export interface AgentChatReply {
  text: string;
  linkCard?: { href: string; label: string };
}

/** 링크 카드로 안내 가능한 화면 — 스키마 enum과 1:1 */
const ROUTES = [
  "/dashboard",
  "/publish",
  "/auto-dm",
  "/links",
  "/ads",
  "/insights",
  "/insights/posts",
  "/insights/link",
  "/reports",
  "/library",
  "/scrap",
  "/competitors",
  "/competitors/ads",
  "/studio",
  "/studio/brand",
  "/studio/works",
  "/settings",
  "/settings/billing",
] as const;

const DAY = 86_400;

async function buildAccountContext(): Promise<string> {
  try {
    const account = await getConnectedInstagramAccount();
    if (!account) {
      return "사용자는 아직 인스타그램 계정을 연동하지 않았다. 연동(/settings)을 권하되 강요하지 말 것.";
    }
    let insightsLine = "";
    const ctx = await getInstagramAccessContext();
    if (ctx) {
      const until = Math.floor(Date.now() / 1000 / 3600) * 3600;
      const cur = await fetchAccountInsightsRange(ctx.igUserId, ctx.token, until - 7 * DAY, until);
      /* 조회 실패(null)면 지표 줄을 아예 넣지 않는다 — 예전엔 전부 0인 객체가 와서
         «도달 0, 참여 계정 0» 이 실데이터로 프롬프트에 실렸고, 바로 아래 문장이
         «위 수치는 공식 API 실데이터다» 라고 못박아 AI 가 «성과가 없다»고 상담했다. */
      if (cur) {
        insightsLine = `최근 7일 지표: 도달 ${cur.reach}, 조회 ${cur.views}, 참여 계정 ${cur.accountsEngaged}, 총 상호작용 ${cur.totalInteractions}, 프로필 링크 클릭 ${cur.profileLinksTaps}.`;
      }
    }
    return [
      `연동 계정: ${account.handle} (팔로워 ${account.followers}, 게시물 ${account.posts}).`,
      insightsLine,
      "위 수치는 Instagram 공식 API 실데이터다. 수치를 지어내지 말고, 모르는 값은 모른다고 답할 것.",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "계정 지표를 불러오지 못했다. 일반적인 안내만 제공할 것.";
  }
}

export async function agentChat(history: AgentChatMessage[]): Promise<AgentChatReply | null> {
  if (isDemoMode()) return null;
  const claude = createClaudeClient();
  if (!claude) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  /* 메시지 상한. 건당 비용은 작지만 상한이 없으면 누적이 무제한이다 —
     로그인만 하면 누구나 무한히 부를 수 있는 유료 호출이었다(2026-08-11 감사).
     한도를 넘으면 조용히 끊지 않고 안내 문구를 돌려준다: 답이 안 오는 것과
     "이번 달 한도를 다 썼다"는 전혀 다른 경험이다. */
  const charge = await chargeGeneration({
    metric: "ai_agent_chat",
    creditCost: CREDIT_COSTS.agentChat,
    reason: "agent_chat",
  });
  if (!charge.ok) {
    return { text: charge.error, linkCard: { href: "/settings/billing", label: "요금제 보기" } };
  }

  const context = await buildAccountContext();

  try {
    const response = await claude.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1000,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: { type: "string", description: "사용자에게 보여줄 답변 (한국어, 2~4문장, 존댓말)" },
              linkHref: {
                type: "string",
                enum: [...ROUTES, ""],
                description: "관련 화면이 있으면 그 경로, 없으면 빈 문자열",
              },
              linkLabel: { type: "string", description: "링크 카드 라벨 (예: '대시보드에서 자세히 보기'), 링크 없으면 빈 문자열" },
            },
            required: ["text", "linkHref", "linkLabel"],
          },
        },
      },
      system: [
        "당신은 SNS 통합 분석 도구 '핀치(Finch)'의 AI 에이전트다.",
        "할 수 있는 것: 연동 계정 지표 해설, 콘텐츠·마케팅 조언, 핀치 화면 안내(링크 카드).",
        "지표는 아래 실데이터만 근거로 답하고, 없는 수치는 절대 지어내지 않는다.",
        "경쟁사 광고·트렌드 데이터는 아직 연동 전이므로 관련 질문에는 준비 중이라고 정직하게 답한다.",
        "",
        "[사용자 계정 컨텍스트]",
        context,
      ].join("\n"),
      messages: history.slice(-8).map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      })),
    });

    if (response.stop_reason === "refusal") return null;
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const parsed = JSON.parse(block.text) as { text: string; linkHref: string; linkLabel: string };
    if (!parsed.text) return null;
    return {
      text: parsed.text,
      linkCard:
        parsed.linkHref && parsed.linkLabel && (ROUTES as readonly string[]).includes(parsed.linkHref)
          ? { href: parsed.linkHref, label: parsed.linkLabel }
          : undefined,
    };
  } catch (e) {
    // 답을 못 줬으면 차감분을 돌려준다 — 실패한 요청에 돈을 받으면 안 된다
    if (charge.via === "credits") {
      await refundGenerationCredits(charge.userId, CREDIT_COSTS.agentChat, "agent_chat_fail_refund");
    }
    console.error("[agent-chat] 호출 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
