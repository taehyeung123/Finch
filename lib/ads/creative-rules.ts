import type { CreatableObjective } from "./campaign-rules";

/**
 * 소재·광고 쓰기 규칙 — 화면(마법사 ②)과 서버 액션이 같은 값을 본다.
 * 근거 docs/ADS_STAGE2_SPEC.md §1.3·§2.5·§2.6·§13. 순수 함수만(클라이언트에서도 import).
 *
 * v1 소재는 **단일 이미지 + 링크**(link_data) 하나다. 영상·캐러셀·기존 게시물은 2차(§9).
 */

/* ── 글자 수 — 권장은 화면 안내, 차단은 검증 ────────────────────── */
export const MESSAGE_RECOMMENDED = 125;
export const MESSAGE_MAX = 1024;
export const HEADLINE_RECOMMENDED = 40;
export const HEADLINE_MAX = 255;
export const DESCRIPTION_MAX = 255;
export const LINK_MAX = 1000;
export const CREATIVE_NAME_MAX = 100;
export const AD_NAME_MAX = 400;

/* ── CTA 표(§2.6) — 목표별 노출, 기본 LEARN_MORE ────────────────── */
export const CTA_LABELS = {
  LEARN_MORE: "더 알아보기",
  SHOP_NOW: "지금 구매",
  BUY_NOW: "바로 구매",
  ORDER_NOW: "지금 주문",
  GET_OFFER: "혜택 받기",
  SIGN_UP: "가입하기",
  BOOK_NOW: "예약하기",
  CONTACT_US: "문의하기",
  DOWNLOAD: "다운로드",
  SUBSCRIBE: "구독하기",
  WATCH_MORE: "더 보기",
  SEE_MORE: "더 보기",
  FOLLOW_PAGE: "페이지 팔로우",
  NO_BUTTON: "버튼 없음",
} as const;
export type CtaType = keyof typeof CTA_LABELS;

export const CTA_BY_OBJECTIVE: Partial<Record<CreatableObjective, readonly CtaType[]>> = {
  OUTCOME_SALES: ["SHOP_NOW", "BUY_NOW", "ORDER_NOW", "GET_OFFER", "LEARN_MORE"],
  OUTCOME_TRAFFIC: ["LEARN_MORE", "SIGN_UP", "BOOK_NOW", "CONTACT_US", "DOWNLOAD", "SUBSCRIBE"],
  OUTCOME_AWARENESS: ["LEARN_MORE", "WATCH_MORE", "NO_BUTTON"],
  OUTCOME_ENGAGEMENT: ["LEARN_MORE", "SEE_MORE", "FOLLOW_PAGE", "NO_BUTTON"],
};
export const DEFAULT_CTA: CtaType = "LEARN_MORE";

export function ctaOptionsFor(objective: string | null): readonly CtaType[] {
  return (objective && CTA_BY_OBJECTIVE[objective as CreatableObjective]) || [DEFAULT_CTA];
}

/* ── 입력 모델 ──────────────────────────────────────────────────── */

export interface CreativeInput {
  /** 본문(primary text) */
  message: string;
  /** 제목(headline) */
  headline: string;
  /** 설명 — Facebook 피드에서만 보인다(IG 는 무시) */
  description: string;
  /** https 만 */
  link: string;
  cta: CtaType;
  /** adimages 가 준 hash — 보통 32자 hex(md5). 형식은 첫 실 호출에서 좁힌다(스펙 §7.3) */
  imageHash: string;
  /** 광고 이름(자동 이름을 접힌 입력에서 바꿀 수 있다) */
  adName: string;
}

/** 관측된 형식은 32자 hex 지만 문서가 형식을 보장하지 않는다 — 공백·특수문자 없는 16~128자까지 받고, 좁히는 건 실측 뒤에 */
export const IMAGE_HASH_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** 표시 URL(caption) — 링크의 호스트. 실패하면 빈 문자열(보내지 않는다) */
export function displayHost(link: string): string {
  try {
    return new URL(link).host;
  } catch {
    return "";
  }
}

export function isHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.host.length > 0 && v.length <= LINK_MAX;
  } catch {
    return false;
  }
}

/** 제어문자(개행·탭·CR 제외) 금지 — Meta 가 거절하기 전에 우리가 거른다. 정규식 대신 코드 비교(파일에 제어 바이트를 남기지 않는다) */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x7f || (c < 0x20 && c !== 0x0a && c !== 0x09 && c !== 0x0d)) return true;
  }
  return false;
}

export function validateCreativeInput(input: CreativeInput, objective: string | null): string | null {
  const message = input.message.trim();
  if (!message) return "광고 본문을 입력해 주세요.";
  if (message.length > MESSAGE_MAX) return `본문은 ${MESSAGE_MAX}자 이내로 입력해 주세요.`;
  const headline = input.headline.trim();
  if (!headline) return "제목을 입력해 주세요.";
  if (headline.length > HEADLINE_MAX) return `제목은 ${HEADLINE_MAX}자 이내로 입력해 주세요.`;
  if (input.description.length > DESCRIPTION_MAX) return `설명은 ${DESCRIPTION_MAX}자 이내로 입력해 주세요.`;
  if ([message, headline, input.description, input.adName].some(hasControlChars)) return "사용할 수 없는 문자가 들어 있어요.";
  if (!isHttpsUrl(input.link.trim())) return "웹사이트 주소는 https:// 로 시작하는 주소여야 해요.";
  if (!(input.cta in CTA_LABELS)) return "버튼 문구를 골라 주세요.";
  if (!ctaOptionsFor(objective).includes(input.cta)) return "이 캠페인 목표에서 쓸 수 없는 버튼이에요.";
  if (!IMAGE_HASH_RE.test(input.imageHash)) return "이미지를 먼저 올려 주세요.";
  if (!input.adName.trim()) return "광고 이름을 입력해 주세요.";
  if (input.adName.length > AD_NAME_MAX) return `광고 이름은 ${AD_NAME_MAX}자 이내로 입력해 주세요.`;
  return null;
}

/* ── 직렬화(§2.5) ───────────────────────────────────────────────── */

export interface CreativeParamsCtx {
  pageId: string;
  /** 인스타 노출용 — 없으면 보내지 않는다(그러면 IG 노출 위치에 안 나간다) */
  igUserId: string | null;
  campaignName: string;
  validateOnly?: boolean;
}

export function creativeAutoName(campaignName: string, n: number): string {
  const base = `${campaignName} 광고 ${n}`;
  return base.length > CREATIVE_NAME_MAX ? base.slice(0, CREATIVE_NAME_MAX) : base;
}

/**
 * 소재 스펙(객체) — adcreatives 생성과 generatepreviews 의 `creative` 파라미터가 **같은 것**을 쓴다.
 * 그래야 미리보기 = 게재본이다(이 저장소의 «편집기와 발행본이 다르다» 회귀 원칙).
 * degrees_of_freedom_spec 은 문서가 «기본 opt-in»으로 적은 세 기능을 끈다 — 같은 이유다.
 */
export function buildCreativeSpec(input: CreativeInput, ctx: Omit<CreativeParamsCtx, "validateOnly">): Record<string, unknown> {
  const link = input.link.trim();
  const linkData: Record<string, unknown> = {
    link,
    message: input.message.trim(),
    name: input.headline.trim(),
    image_hash: input.imageHash,
  };
  const description = input.description.trim();
  if (description) linkData.description = description;
  const caption = displayHost(link);
  if (caption) linkData.caption = caption;
  if (input.cta !== "NO_BUTTON") {
    /* call_to_action.value.link 는 link_data.link 와 같아야 한다(확인) */
    linkData.call_to_action = { type: input.cta, value: { link } };
  }

  const objectStorySpec: Record<string, unknown> = { page_id: ctx.pageId, link_data: linkData };
  /* instagram_actor_id 는 v22 폐기 — instagram_user_id 만 쓴다 */
  if (ctx.igUserId) objectStorySpec.instagram_user_id = ctx.igUserId;

  return {
    name: creativeAutoName(ctx.campaignName, 1),
    object_story_spec: objectStorySpec,
    degrees_of_freedom_spec: {
      creative_features_spec: {
        adapt_to_placement: { enroll_status: "OPT_OUT" },
        description_automation: { enroll_status: "OPT_OUT" },
        inline_comment: { enroll_status: "OPT_OUT" },
      },
    },
  };
}

/** POST /act_{id}/adcreatives 파라미터 — buildCreativeSpec 을 문자열로 편 것 */
export function buildCreativeParams(input: CreativeInput, ctx: CreativeParamsCtx): Record<string, string> {
  const spec = buildCreativeSpec(input, ctx);
  const params: Record<string, string> = {
    name: String(spec.name),
    object_story_spec: JSON.stringify(spec.object_story_spec),
    degrees_of_freedom_spec: JSON.stringify(spec.degrees_of_freedom_spec),
  };
  if (ctx.validateOnly) params.execution_options = JSON.stringify(["validate_only"]);
  return params;
}

/** POST /act_{id}/ads 파라미터 — status 는 PAUSED 상수. conversion_domain 은 v1 에서 보내지 않는다(§13-15) */
export function buildAdParams(p: {
  name: string;
  adsetId: string;
  creativeId: string;
  validateOnly?: boolean;
}): Record<string, string> {
  const params: Record<string, string> = {
    name: p.name,
    adset_id: p.adsetId,
    creative: JSON.stringify({ creative_id: p.creativeId }),
    status: "PAUSED",
  };
  if (p.validateOnly) params.execution_options = JSON.stringify(["validate_only"]);
  return params;
}
