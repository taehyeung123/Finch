"use server";

import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createClaudeClient, STUDIO_MODEL } from "@/lib/ai/claude";
import { chargeGeneration, refundGenerationCredits, CREDIT_COSTS } from "@/lib/actions/credits";

/*
  AI 스튜디오 서버 액션 — Claude API 실호출.

  - ANTHROPIC_API_KEY 미설정 또는 데모 모드: { fallback: true } 반환 → 클라이언트가
    기존 템플릿 생성으로 동작한다 (연동 전에도 화면이 깨지지 않는 프로젝트 원칙).
  - 실제 모드: getUser() 재인증 + 카드뉴스는 "무료 월 한도(플랜별) → 크레딧 소비"
    2단계 과금(lib/actions/credits.ts). 무료 3회는 기존 그대로, 그 이후 2크레딧/회.
  - 출력은 output_config.format(json_schema)로 구조를 강제해 파싱 실패를 방지한다.
*/

export type SlideOut = {
  role: "cover" | "content" | "closing";
  kicker?: string;
  headline: string;
  points?: string[];
  footnote?: string;
  body?: string;
  cta?: { action: "save" | "follow" | "share"; text: string };
};
/** 하나의 안 — 접근 각도 라벨 + 5장 */
export type CardVariant = { angle: string; slides: SlideOut[] };
export type CardNewsResult =
  | {
      ok: true;
      variants: CardVariant[];
      /** 크레딧으로 소비된 경우에만 채워짐(무료 월 한도 구간은 null) — 표시용 근사 잔액 */
      credits: { spent: number; remaining: number } | null;
    }
  | { ok: false; fallback: true }
  | { ok: false; fallback?: false; error: string };

/** 브랜드 톤 프로필 — "학습"의 실체는 이 요약 + 예시를 프롬프트에 주입하는 것이다(모델 학습 아님) */
export interface BrandProfile {
  tone: string; // 말투 요약 (예: "친근하고 단정한, 군더더기 없는")
  phrases: string[]; // 자주 쓰는 표현
  banned: string[]; // 피해야 할 표현
  target: string; // 타깃 독자
  industry: string; // 업종
}

export type BrandProfileState = { profile: BrandProfile; samples: string[] } | null;

/** 현재 사용자의 브랜드 프로필 로드 (없으면 null). 서버 컴포넌트/액션 공용. */
export async function getBrandProfile(): Promise<BrandProfileState> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("brand_profiles").select("profile, samples").eq("user_id", user.id).maybeSingle();
  if (!data?.profile || Object.keys(data.profile as object).length === 0) return null;
  return {
    profile: data.profile as BrandProfile,
    samples: Array.isArray(data.samples) ? (data.samples as string[]) : [],
  };
}

/** 생성 프롬프트에 주입할 브랜드 컨텍스트 문자열 (프로필 없으면 빈 문자열) */
function brandContextString(state: BrandProfileState): string {
  if (!state) return "";
  const { profile: p, samples } = state;
  const lines = [
    "",
    "[브랜드 톤 프로필] 아래는 이 사용자의 브랜드 톤이다. 이 톤·표현을 반영하되, 위 카피 규칙(구체성·금지어)은 그대로 지켜라.",
    p.tone ? `- 말투: ${p.tone}` : "",
    p.phrases?.length ? `- 자주 쓰는 표현: ${p.phrases.join(", ")}` : "",
    p.banned?.length ? `- 피해야 할 표현: ${p.banned.join(", ")}` : "",
    p.target ? `- 타깃 독자: ${p.target}` : "",
    p.industry ? `- 업종: ${p.industry}` : "",
  ].filter(Boolean);
  if (samples.length > 0) {
    lines.push("[이 브랜드의 잘 된 예시 캡션]", samples.slice(0, 3).join("\n---\n"));
  }
  return lines.join("\n");
}

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

const TONE_LABEL: Record<string, string> = {
  friendly: "친근하고 다정한",
  professional: "전문적이고 신뢰감 있는",
  witty: "위트있고 재치있는",
};

/**
 * AI 호출 게이트 — 인증 + 과금.
 *
 * 전에는 "가벼운 호출용이라 과금 없음"이었는데, 실제로는 아이디어 추천이
 * 카드뉴스와 **완전히 같은 설정**(max_tokens 16000 + adaptive thinking)으로 돌고 있었다.
 * 가볍다는 건 주석에만 있었고 코드에는 없었다 — 그래서 버튼을 연타하면 토큰이 무제한으로 나갔다.
 * (2026-08-11 감사에서 발견. 브랜드 톤 학습도 같은 경로였다.)
 *
 * 반환된 refund 는 AI 호출이 실패했을 때 반드시 불러야 한다 —
 * 크레딧이 차감됐는데 결과를 못 주면 그건 그냥 돈을 가져간 것이다.
 */
async function guard(charge: { metric: string; creditCost: number; reason: string }): Promise<
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; fallback: true }
  | { ok: false; fallback?: false; error: string }
> {
  if (isDemoMode() || !process.env.ANTHROPIC_API_KEY) return { ok: false, fallback: true };

  try {
    const result = await chargeGeneration(charge);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      refund: async () => {
        if (result.via === "credits") {
          await refundGenerationCredits(result.userId, charge.creditCost, `${charge.reason}_fail_refund`);
        }
      },
    };
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

export async function generateCardNews(topic: string, tone: string, extra?: string): Promise<CardNewsResult> {
  const t = topic.trim();
  if (!t) return { ok: false, error: "주제를 입력해 주세요." };
  if (t.length > 200) return { ok: false, error: "주제는 200자 이내로 입력해 주세요." };
  const extraNote = (extra ?? "").trim().slice(0, 500);

  if (isDemoMode() || !process.env.ANTHROPIC_API_KEY) return { ok: false, fallback: true };
  const claude = createClaudeClient();
  if (!claude) return { ok: false, fallback: true };

  // 과금은 실제 호출이 가능한 상태에서만 — 무료 월 한도(3회) 우선, 소진 시 2크레딧
  const charge = await chargeGeneration({
    metric: "ai_cardnews",
    creditCost: CREDIT_COSTS.cardnews,
    reason: "cardnews_generate",
  });
  if (!charge.ok) return { ok: false, error: charge.error };
  // 크레딧이 차감됐는데 이후 처리가 실패하면 반드시 환불한다
  const refundIfCharged = async () => {
    if (charge.via === "credits") {
      await refundGenerationCredits(charge.userId, CREDIT_COSTS.cardnews, "generate_fail_refund: cardnews");
    }
  };

  // 학습된 브랜드 톤 프로필이 있으면 생성 프롬프트에 주입한다(없으면 빈 문자열)
  const brandState = await getBrandProfile();

  try {
    const response = await claude.messages.create({
      model: STUDIO_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        format: {
          type: "json_schema",
          // 역할별 필드가 다르므로 anyOf 판별 유니온으로 강제한다(role을 const로 고정).
          // Anthropic structured output은 oneOf·maxItems·maxLength 미지원 → 글자수/개수/장수 분포는 프롬프트로 강제.
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["variants"],
            properties: {
              variants: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["angle", "slides"],
                  properties: {
                    angle: { type: "string", description: "이 안의 접근 각도 라벨 (예: 정보형, 공감·스토리형, 후킹형)" },
                    slides: {
                      type: "array",
                      items: {
                        anyOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["role", "headline"],
                      properties: {
                        role: { const: "cover" },
                        kicker: { type: "string", description: "상단 카테고리 라벨 6~12자" },
                        headline: { type: "string", description: "표지 후킹 헤드라인 20~26자" },
                        footnote: { type: "string", description: "신뢰·구체화 부연 한 줄 40자 이내" },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["role", "kicker", "headline", "points"],
                      properties: {
                        role: { const: "content" },
                        kicker: { type: "string", description: "진행 라벨 6~12자 (예: 흔한 실수, 핵심 지표, STEP 2)" },
                        headline: { type: "string", description: "그 장의 주장 한 문장 25자 이내" },
                        points: {
                          type: "array",
                          description: "핵심 포인트 명사구 2~3개, 각 24자 이내",
                          items: { type: "string" },
                        },
                        footnote: { type: "string", description: "근거·예시 한 줄 40자 이내 (선택)" },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["role", "headline", "cta"],
                      properties: {
                        role: { const: "closing" },
                        headline: { type: "string", description: "마무리 요약 헤드라인 20자 내외" },
                        body: { type: "string", description: "요약 한 줄 40자 이내 (선택)" },
                        cta: {
                          type: "object",
                          additionalProperties: false,
                          required: ["action", "text"],
                          properties: {
                            action: { enum: ["save", "follow", "share"] },
                            text: { type: "string", description: "행동 유도 버튼 문구 22자 이내" },
                          },
                        },
                      },
                    },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      system: [
        "너는 한국 인스타그램 정보성 카드뉴스 전문 카피라이터다. 정확히 5장을 생성한다: 1장 cover, 2~4장 content(3장), 5장 closing.",
        "",
        "[표지 cover] 후킹 공식 6개 중 반드시 하나를 채택: 숫자리스트 / 손실회피 / 통념깨기 / 질문호명 / 결과수치 / 시의성.",
        "headline은 20~26자 한 방. footnote는 신뢰·구체화(수치·근거) 한 줄. 표지에 '저장하세요' 같은 CTA는 넣지 마라(마무리 담당).",
        "",
        "[본문 content] 한 장 = 한 아이디어. 필드 계층을 반드시 지켜라:",
        "- kicker: 6~12자 진행 라벨(예: '흔한 실수', '핵심 지표', 'STEP 2')",
        "- headline: 그 장의 주장 한 문장, 25자 이내",
        "- points: 2~3개, 각 24자 이내 '명사구·체언 종결'(예: '업로드 후 30분 도달 속도'). 완결문·서술문 금지. points만 훑어도 정보가 남게 하라.",
        "- footnote: 근거·예시 한 줄(선택)",
        "",
        "[마무리 closing] 요약 headline 1줄 + 단일 행동 하나(save/follow/share 중 택1). 행동 2개 이상 나열 금지. cta.text는 '이득 리마인드 + 행동' 패턴.",
        "",
        "[전 슬라이드 금지 규칙]",
        "- 동어반복 금지: headline과 하위 필드가 같은 말이면 실패. 하위 필드는 headline에 없던 새 정보(수치·방법·이유·예시)만 담아라.",
        "- 추상어 금지: '잘', '제대로', '중요합니다', '도움이 됩니다' 같은 정보 0인 표현 금지.",
        "- 상투구 금지: '요즘 대세', '꼭 알아야 할'.",
        "- 모든 조언은 구체적으로(숫자·구간·행동). '제목 잘 쓰기'(X) → '제목 앞 15자에 검색 키워드'(O).",
        "- 점수·검색량 지수 등 추정 지표를 사실처럼 단정하지 마라. 이모지 금지. 과장·허위 금지.",
        "톤: 표지=긴장·강한 동사·물음표 허용, 본문=단정형 '~다', 마무리=짧고 감정적.",
        "",
        "[다안 생성] variants는 정확히 2안. 각 안은 서로 다른 접근 각도(예: 1안 정보·근거형 / 2안 공감·후킹형)로, 같은 주제를 다르게 풀어라. 두 안이 비슷하면 실패다. 각 안은 정확히 5장(cover 1 / content 3 / closing 1).",
      ].join("\n") + brandContextString(brandState),
      messages: [
        {
          role: "user",
          content: `주제: ${t}\n브랜드 톤: ${TONE_LABEL[tone] ?? TONE_LABEL.friendly}${extraNote ? `\n\n[추가 지침] ${extraNote}` : ""}\n\n이 주제로 서로 다른 접근의 카드뉴스 2안을 만들어줘. 각 안은 5장(cover 1 / content 3 / closing 1).`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      await refundIfCharged();
      return { ok: false, error: "이 주제로는 생성할 수 없어요. 다른 주제로 시도해 주세요." };
    }
    const parsed = parseJsonText(response.content as { type: string; text?: string }[]) as {
      variants?: CardVariant[];
    } | null;
    const variants = (parsed?.variants ?? [])
      .map((v) => ({ angle: v.angle || "안", slides: (v.slides ?? []).filter((s) => s.role && s.headline).slice(0, 5) }))
      .filter((v) => v.slides.length > 0)
      .slice(0, 3);
    if (variants.length === 0) {
      await refundIfCharged();
      return { ok: false, error: "생성 결과 처리에 실패했어요. 다시 시도해 주세요." };
    }
    return {
      ok: true,
      variants,
      credits:
        charge.via === "credits"
          ? { spent: CREDIT_COSTS.cardnews, remaining: charge.remainingCredits ?? 0 }
          : null,
    };
  } catch (e) {
    console.error("[studio] 카드뉴스 생성 실패:", e);
    await refundIfCharged();
    return { ok: false, error: "AI 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export type LearnResult =
  | { ok: true; profile: BrandProfile }
  | { ok: false; fallback?: true; error?: string };

/** 브랜드 톤 학습 — 예시 캡션/설명에서 톤 프로필을 추출해 저장한다(Claude 1회 호출). */
export async function learnBrandProfile(input: string): Promise<LearnResult> {
  /* 데모 확인이 **맨 앞**이다 — 없으면 ANTHROPIC_API_KEY 가 있는 데모 환경에서 Supabase 조회까지
     들어가 「로그인이 필요합니다」가 떴다. 바로 옆 「저장하고 적용」은 같은 상황에서
     「데모 모드에서는 사용할 수 없어요」라고 정확히 말한다 — 같은 원인에 두 설명이 나란히 붙어 있었다. */
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 사용할 수 없어요." };
  const text = input.trim();
  if (text.length < 20) return { ok: false, error: "브랜드 톤을 파악할 수 있게 예시 캡션이나 설명을 조금 더 입력해 주세요." };
  if (text.length > 4000) return { ok: false, error: "입력이 너무 길어요. 4000자 이내로 줄여 주세요." };
  const claude = createClaudeClient();
  if (!claude) return { ok: false, fallback: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const guarded = await guard({
    metric: "ai_brand_tone",
    creditCost: CREDIT_COSTS.brandTone,
    reason: "studio_brand_tone",
  });
  if (!guarded.ok) {
    return guarded.fallback ? { ok: false, fallback: true } : { ok: false, error: guarded.error };
  }

  try {
    const response = await claude.messages.create({
      model: STUDIO_MODEL,
      max_tokens: 4000,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["tone", "phrases", "banned", "target", "industry"],
            properties: {
              tone: { type: "string", description: "말투·문체 요약 한 문장" },
              phrases: { type: "array", items: { type: "string" }, description: "자주 쓰거나 어울리는 표현 3~6개" },
              banned: { type: "array", items: { type: "string" }, description: "이 브랜드에 안 어울리는 표현 2~4개" },
              target: { type: "string", description: "주 타깃 독자" },
              industry: { type: "string", description: "업종·분야" },
            },
          },
        },
      },
      system:
        "너는 브랜드 보이스 분석가다. 사용자가 준 예시 캡션이나 설명에서 브랜드의 말투·자주 쓰는 표현·피해야 할 표현·타깃·업종을 추출한다. 지어내지 말고 주어진 텍스트에서 근거를 찾아 요약해라. 이모지 금지.",
      messages: [
        { role: "user", content: `아래는 내 브랜드의 예시 캡션 또는 톤 설명이야. 여기서 브랜드 톤 프로필을 추출해줘.\n\n${text}` },
      ],
    });

    if (response.stop_reason === "refusal") return { ok: false, error: "이 입력으로는 분석할 수 없어요." };
    const parsed = parseJsonText(response.content as { type: string; text?: string }[]) as BrandProfile | null;
    if (!parsed?.tone) return { ok: false, error: "톤 분석에 실패했어요. 다시 시도해 주세요." };

    const profile: BrandProfile = {
      tone: parsed.tone,
      phrases: (parsed.phrases ?? []).slice(0, 6),
      banned: (parsed.banned ?? []).slice(0, 4),
      target: parsed.target ?? "",
      industry: parsed.industry ?? "",
    };
    // 예시 캡션은 줄 단위로 최대 5개 보관(few-shot 주입용)
    const samples = text
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length >= 8)
      .slice(0, 5);

    const { error } = await supabase
      .from("brand_profiles")
      .upsert({ user_id: user.id, profile, samples, updated_at: new Date().toISOString() });
    if (error) {
      console.error("[studio] 브랜드 프로필 저장 실패:", error.message);
      await guarded.refund();
      return { ok: false, error: "저장에 실패했어요. 다시 시도해 주세요." };
    }
    return { ok: true, profile };
  } catch (e) {
    console.error("[studio] 브랜드 톤 학습 실패:", e);
    await guarded.refund();
    return { ok: false, error: "분석 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
  }
}

/** 저장된 브랜드 톤 프로필 삭제 (초기화) */
export async function clearBrandProfile(): Promise<void> {
  /* learnBrandProfile 과 같은 이유로 데모를 먼저 막는다 — 데모에서 지울 수 있는 것이 없다 */
  if (isDemoMode()) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("brand_profiles").delete().eq("user_id", user.id);
}

export async function generateIdeas(keyword: string, category: string): Promise<IdeasResult> {
  const kw = keyword.trim();
  if (!kw) return { ok: false, error: "키워드를 입력해 주세요." };
  if (kw.length > 100) return { ok: false, error: "키워드는 100자 이내로 입력해 주세요." };

  const claude = createClaudeClient();
  if (!claude) return { ok: false, fallback: true };

  /* 과금은 실제로 호출 가능한 상태를 확인한 뒤에 한다 — 키가 없어 못 돌리는데
     한도만 깎이면 사용자는 아무것도 못 받고 횟수를 잃는다. */
  const guarded = await guard({
    metric: "ai_ideas",
    creditCost: CREDIT_COSTS.ideas,
    reason: "studio_ideas",
  });
  if (!guarded.ok) {
    return guarded.fallback ? { ok: false, fallback: true } : { ok: false, error: guarded.error };
  }

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
      await guarded.refund();
      return { ok: false, error: "이 키워드로는 생성할 수 없어요. 다른 키워드로 시도해 주세요." };
    }
    const parsed = parseJsonText(response.content as { type: string; text?: string }[]) as {
      ideas?: IdeaOut[];
    } | null;
    const ideas = parsed?.ideas?.filter((i) => i.title && i.reason).slice(0, 6);
    if (!ideas || ideas.length === 0) {
      await guarded.refund();
      return { ok: false, error: "생성 결과 처리에 실패했어요. 다시 시도해 주세요." };
    }
    return { ok: true, ideas };
  } catch (e) {
    console.error("[studio] 아이디어 생성 실패:", e);
    await guarded.refund();
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
