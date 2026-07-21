"use server";

import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createClaudeClient, STUDIO_MODEL } from "@/lib/ai/claude";

/*
  AI 스튜디오 서버 액션 — Claude API 실호출.

  - ANTHROPIC_API_KEY 미설정 또는 데모 모드: { fallback: true } 반환 → 클라이언트가
    기존 템플릿 생성으로 동작한다 (연동 전에도 화면이 깨지지 않는 프로젝트 원칙).
  - 실제 모드: getUser() 재인증 + 카드뉴스는 use_quota()로 플랜별 월 한도 차감(무료 3회).
  - 출력은 output_config.format(json_schema)로 구조를 강제해 파싱 실패를 방지한다.
*/

export type SlideOut = { head: string; sub: string };
export type CardNewsResult =
  | { ok: true; slides: SlideOut[] }
  | { ok: false; fallback: true }
  | { ok: false; fallback?: false; error: string };

export type IdeaOut = {
  title: string;
  reason: string;
  format: "릴스" | "캐러셀" | "스토리";
  channels: ("instagram" | "tiktok" | "threads")[];
  engagement: "high" | "mid";
};
export type IdeasResult =
  | { ok: true; ideas: IdeaOut[] }
  | { ok: false; fallback: true }
  | { ok: false; fallback?: false; error: string };

/** 플랜별 AI 카드뉴스 월 한도 — planFeatures 표와 일치 유지 (무료 3회, 유료 무제한) */
const CARDNEWS_LIMITS: Record<string, number> = {
  free: 3,
  creator: 1000000,
  pro: 1000000,
  agency: 1000000,
  enterprise: 1000000,
};

const TONE_LABEL: Record<string, string> = {
  friendly: "친근하고 다정한",
  professional: "전문적이고 신뢰감 있는",
  witty: "위트있고 재치있는",
};

/** 인증 + (선택) 월 한도 차감. 데모/키 미설정이면 fallback 신호. */
async function guard(quota?: { metric: string; limit: number }): Promise<
  { ok: true } | { ok: false; fallback: true } | { ok: false; fallback?: false; error: string }
> {
  if (isDemoMode() || !process.env.ANTHROPIC_API_KEY) return { ok: false, fallback: true };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "로그인이 필요합니다." };

    if (quota) {
      const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).maybeSingle();
      const limit = quota.limit || CARDNEWS_LIMITS[profile?.plan ?? "free"] || 3;
      const { data: allowed, error: quotaErr } = await supabase.rpc("use_quota", {
        p_metric: quota.metric,
        p_limit: limit,
        p_amount: 1,
      });
      if (quotaErr) {
        console.error("[studio] 쿼터 확인 실패:", quotaErr.message);
        return { ok: false, error: "사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
      }
      if (!allowed) {
        return { ok: false, error: "이번 달 AI 생성 한도를 모두 사용했어요. 플랜을 업그레이드하면 계속 쓸 수 있습니다." };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "인증 확인에 실패했습니다." };
  }
}

/** 응답에서 JSON 텍스트 블록을 안전하게 파싱 */
function parseJsonText(content: { type: string; text?: string }[]): unknown {
  const text = content.find((b) => b.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function generateCardNews(topic: string, tone: string): Promise<CardNewsResult> {
  const t = topic.trim();
  if (!t) return { ok: false, error: "주제를 입력해 주세요." };
  if (t.length > 200) return { ok: false, error: "주제는 200자 이내로 입력해 주세요." };

  const guarded = await guard({ metric: "ai_cardnews", limit: 0 });
  if (!guarded.ok) return guarded;

  const claude = createClaudeClient();
  if (!claude) return { ok: false, fallback: true };

  try {
    const response = await claude.messages.create({
      model: STUDIO_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              slides: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    head: { type: "string", description: "슬라이드 헤드카피 (한 줄, 25자 이내)" },
                    sub: { type: "string", description: "서브카피 (1~2문장, 60자 이내)" },
                  },
                  required: ["head", "sub"],
                  additionalProperties: false,
                },
              },
            },
            required: ["slides"],
            additionalProperties: false,
          },
        },
      },
      system:
        "당신은 한국 SNS 콘텐츠 마케팅 전문 카피라이터다. 인스타그램 카드뉴스(정사각형 5장) 카피를 작성한다. " +
        "구성: 1장=스크롤을 멈추게 하는 표지 후킹, 2~4장=핵심 내용(왜/실수/실전 팁 등 자연스러운 전개), 5장=저장·팔로우를 부르는 마무리. " +
        "규칙: 정확히 5장. 헤드카피는 25자 이내로 강렬하게, 서브카피는 60자 이내로 구체적으로. 이모지 금지. 과장·허위 표현 금지.",
      messages: [
        {
          role: "user",
          content: `주제: ${t}\n브랜드 톤: ${TONE_LABEL[tone] ?? TONE_LABEL.friendly}\n\n이 주제로 카드뉴스 5장 카피를 만들어줘.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "이 주제로는 생성할 수 없어요. 다른 주제로 시도해 주세요." };
    }
    const parsed = parseJsonText(response.content as { type: string; text?: string }[]) as {
      slides?: SlideOut[];
    } | null;
    const slides = parsed?.slides?.filter((s) => s.head && s.sub).slice(0, 5);
    if (!slides || slides.length === 0) {
      return { ok: false, error: "생성 결과 처리에 실패했어요. 다시 시도해 주세요." };
    }
    return { ok: true, slides };
  } catch (e) {
    console.error("[studio] 카드뉴스 생성 실패:", e);
    return { ok: false, error: "AI 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export async function generateIdeas(keyword: string, category: string): Promise<IdeasResult> {
  const kw = keyword.trim();
  if (!kw) return { ok: false, error: "키워드를 입력해 주세요." };
  if (kw.length > 100) return { ok: false, error: "키워드는 100자 이내로 입력해 주세요." };

  const guarded = await guard(); // 아이디어는 한도 미차감 (가벼운 호출)
  if (!guarded.ok) return guarded;

  const claude = createClaudeClient();
  if (!claude) return { ok: false, fallback: true };

  try {
    const response = await claude.messages.create({
      model: STUDIO_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              ideas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "콘텐츠 아이디어 제목 (구체적으로)" },
                    reason: { type: "string", description: "이 아이디어를 추천하는 이유 (1문장)" },
                    format: { type: "string", enum: ["릴스", "캐러셀", "스토리"] },
                    channels: {
                      type: "array",
                      items: { type: "string", enum: ["instagram", "tiktok", "threads"] },
                    },
                    engagement: { type: "string", enum: ["high", "mid"] },
                  },
                  required: ["title", "reason", "format", "channels", "engagement"],
                  additionalProperties: false,
                },
              },
            },
            required: ["ideas"],
            additionalProperties: false,
          },
        },
      },
      system:
        "당신은 한국 SNS 콘텐츠 전략가다. 키워드와 카테고리를 받아 인스타그램·틱톡·스레드용 콘텐츠 아이디어를 만든다. " +
        "규칙: 정확히 5개. 제목은 바로 제작에 들어갈 수 있게 구체적으로(후킹 포함). 이유는 어떤 포맷 전략이 통하는지 1문장. " +
        "format은 릴스(숏폼 영상)/캐러셀(카드 슬라이드)/스토리 중 콘텐츠 성격에 맞게. channels는 그 포맷이 통하는 채널만. " +
        "engagement는 반응이 클 것 같으면 high, 무난하면 mid. 이모지 금지.",
      messages: [
        {
          role: "user",
          content: `키워드: ${kw}\n카테고리: ${category === "전체" ? "제한 없음" : category}\n\n이 키워드로 콘텐츠 아이디어 5개를 만들어줘.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "이 키워드로는 생성할 수 없어요. 다른 키워드로 시도해 주세요." };
    }
    const parsed = parseJsonText(response.content as { type: string; text?: string }[]) as {
      ideas?: IdeaOut[];
    } | null;
    const ideas = parsed?.ideas?.filter((i) => i.title && i.reason).slice(0, 6);
    if (!ideas || ideas.length === 0) {
      return { ok: false, error: "생성 결과 처리에 실패했어요. 다시 시도해 주세요." };
    }
    return { ok: true, ideas };
  } catch (e) {
    console.error("[studio] 아이디어 생성 실패:", e);
    return { ok: false, error: "AI 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
  }
}

/** 예약 발행 취소 — RLS(auth.uid()=user_id)로 본인 행만, scheduled 상태일 때만 취소 가능 */
export async function cancelScheduledPost(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("scheduled_posts")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("status", "scheduled");
  if (error) {
    console.error("[studio] 예약 취소 실패:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
