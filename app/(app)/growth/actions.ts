"use server";

import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createClaudeClient, STUDIO_MODEL } from "@/lib/ai/claude";
import { getPostPerformance, type GrowthPerformance } from "@/lib/data/growth";

/*
  성장 진단 AI 분석 — 연동 계정의 실제 게시물 성과(저장률·참여율·도달)를 근거로
  Claude가 강점·약점·다음 콘텐츠 아이디어를 제안한다.

  정직 원칙: 모든 판단은 프롬프트에 넣은 "실제 집계 수치" 위에서의 추론이다.
  Claude가 임의로 지어낸 지표가 아니라, 사용자의 진짜 데이터를 해석한 결과다.
  키 미설정/데모/크레딧 부족이면 fallback 신호를 준다(화면은 실데이터 표만 보여줌).
*/

export interface DiagnosisIdea {
  topic: string;
  reason: string;
  /** 어떤 성과 근거에서 나온 제안인지 (예: "저장률 상위 유형") */
  basedOn: string;
}

export type DiagnosisResult =
  | {
      ok: true;
      strengths: string[];
      weaknesses: string[];
      ideas: DiagnosisIdea[];
    }
  | { ok: false; reason: "not_connected" | "insufficient_data" | "fallback" | "error"; message?: string };

/** Claude에 넘길 성과 요약 — 상위/하위 게시물과 평균을 압축 */
function buildPerfSummary(perf: GrowthPerformance): string {
  const top = perf.posts.slice(0, 5);
  const bottom = perf.posts.slice(-3).reverse();
  const line = (p: (typeof perf.posts)[number]) =>
    `- [${p.kind}] 저장률 ${p.saveRate}% · 참여율 ${p.engagementRate}% · 도달 ${p.reach.toLocaleString("ko-KR")} · "${p.caption}"`;
  return [
    `표본 ${perf.sampleSize}개 게시물. 계정 평균: 저장률 ${perf.avgSaveRate}%, 참여율 ${perf.avgEngagementRate}%, 도달 ${perf.avgReach.toLocaleString("ko-KR")}`,
    "",
    "[저장률 상위 게시물]",
    ...top.map(line),
    "",
    "[저장률 하위 게시물]",
    ...bottom.map(line),
  ].join("\n");
}

export async function diagnoseAccount(): Promise<DiagnosisResult> {
  if (isDemoMode() || !process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "fallback" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "error", message: "로그인이 필요합니다." };

  const perf = await getPostPerformance();
  if (!perf) return { ok: false, reason: "not_connected" };
  if (perf.sampleSize < 3) return { ok: false, reason: "insufficient_data" };

  const claude = createClaudeClient();
  if (!claude) return { ok: false, reason: "fallback" };

  try {
    const response = await claude.messages.create({
      model: STUDIO_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["strengths", "weaknesses", "ideas"],
            properties: {
              strengths: { type: "array", items: { type: "string" }, description: "잘 되고 있는 점 2~3개, 수치 근거 포함" },
              weaknesses: { type: "array", items: { type: "string" }, description: "약점·개선점 2~3개, 수치 근거 포함" },
              ideas: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["topic", "reason", "basedOn"],
                  properties: {
                    topic: { type: "string", description: "바로 카드뉴스로 만들 수 있는 구체적 주제" },
                    reason: { type: "string", description: "이 주제를 추천하는 이유 (성과 근거 연결)" },
                    basedOn: { type: "string", description: "근거가 된 성과 신호 (예: 저장률 상위 유형)" },
                  },
                },
              },
            },
          },
        },
      },
      system: [
        "너는 인스타그램 성장 코치다. 사용자의 '실제 계정 성과 수치'만 근거로 진단한다.",
        "주어진 데이터에 없는 수치를 지어내지 마라. 모든 강점·약점은 제시된 저장률·참여율·도달 수치에 연결해 서술하라.",
        "저장률은 콘텐츠가 '나중에 다시 볼 가치'가 있다는 강한 노출 신호다. 저장률이 높은 유형·주제를 강점으로, 낮은 유형을 약점으로 본다.",
        "ideas는 정확히 4개. 강점 유형은 강화하고 약점은 메우는, 바로 카드뉴스로 만들 수 있는 구체적 주제로.",
        "추상어(잘/제대로/중요합니다) 금지. 모든 조언은 구체적으로. 이모지 금지. 과장 금지.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `아래는 내 인스타그램 계정의 실제 게시물 성과 데이터야. 이걸 근거로 진단해줘.\n\n${buildPerfSummary(perf)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "error", message: "진단을 생성할 수 없어요. 잠시 후 다시 시도해 주세요." };
    }
    const text = (response.content as { type: string; text?: string }[]).find((b) => b.type === "text")?.text;
    const parsed = text ? (JSON.parse(text) as { strengths?: string[]; weaknesses?: string[]; ideas?: DiagnosisIdea[] }) : null;
    if (!parsed?.strengths || !parsed?.weaknesses || !parsed?.ideas) {
      return { ok: false, reason: "error", message: "진단 결과 처리에 실패했어요. 다시 시도해 주세요." };
    }
    return {
      ok: true,
      strengths: parsed.strengths.slice(0, 4),
      weaknesses: parsed.weaknesses.slice(0, 4),
      ideas: parsed.ideas.filter((i) => i.topic && i.reason).slice(0, 4),
    };
  } catch (e) {
    console.error("[growth] 진단 실패:", e);
    return { ok: false, reason: "error", message: "AI 진단 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
  }
}
