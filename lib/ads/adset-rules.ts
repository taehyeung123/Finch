import type { CreatableObjective, SpecialAdCategory } from "./campaign-rules";

/**
 * 광고 세트 쓰기 규칙 — 화면(마법사 ①)과 서버 액션이 **같은 값**을 본다(campaign-rules.ts 와 같은 원칙).
 * 근거는 docs/ADS_STAGE2_SPEC.md §1.2·§2.2·§2.3·§13. 문서 확인 못 한 항목은 주석에 «추정»으로 남겼다 —
 * 첫 실 호출(validate_only)에서 지운다.
 *
 * ⚠️ 이 파일은 순수 함수만 — 클라이언트(마법사)에서도 import 한다. 서버 전용 import 금지.
 */

/* ── 목표별 고정값 — 화면에 선택지를 주지 않는다(§2.2) ─────────────── */

export interface AdSetObjectiveSpec {
  /** 생략(«해당 없음»)이면 undefined */
  destinationType?: "WEBSITE" | "ON_POST";
  optimizationGoal: "LINK_CLICKS" | "REACH" | "POST_ENGAGEMENT";
  /** v1 은 전부 노출당 청구 — 기본값이 문서에 없어 항상 명시한다 */
  billingEvent: "IMPRESSIONS";
  /** page = promoted_object {page_id} 를 보낸다(인지도 — 매핑표 정황, 추정 §11-5) */
  promotedObject: "none" | "page";
}

export const ADSET_SPEC_BY_OBJECTIVE: Partial<Record<CreatableObjective, AdSetObjectiveSpec>> = {
  OUTCOME_TRAFFIC: { destinationType: "WEBSITE", optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS", promotedObject: "none" },
  OUTCOME_AWARENESS: { optimizationGoal: "REACH", billingEvent: "IMPRESSIONS", promotedObject: "page" },
  OUTCOME_ENGAGEMENT: { destinationType: "ON_POST", optimizationGoal: "POST_ENGAGEMENT", billingEvent: "IMPRESSIONS", promotedObject: "none" },
  /* 판매는 픽셀 없이 LINK_CLICKS 로만(§2.2) — promoted_object 생략 가능 여부는 §11-2, 거절되면 sales_pixel_required */
  OUTCOME_SALES: { destinationType: "WEBSITE", optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS", promotedObject: "none" },
};

export function adsetSpecFor(objective: string | null): AdSetObjectiveSpec | null {
  if (!objective) return null;
  return ADSET_SPEC_BY_OBJECTIVE[objective as CreatableObjective] ?? null;
}

/* ── 입력 모델 ──────────────────────────────────────────────────── */

export interface GeoRegion {
  /** adgeolocation 검색이 준 key */
  key: string;
  name: string;
}
export interface Interest {
  id: string;
  name: string;
}

export type GeoInput = { mode: "country" } | { mode: "regions"; regions: GeoRegion[] };
export type GenderInput = "all" | "male" | "female";
export type PlacementInput = "auto" | "instagram";

export interface AdSetInput {
  name: string;
  geo: GeoInput;
  ageMin: number;
  /** 65 = «65+». 자동 확장 켬이면 무시된다(보내지 않는다) */
  ageMax: number;
  gender: GenderInput;
  interests: Interest[];
  /** Advantage+ audience(타겟 자동 확장) — 항상 명시해 보낸다 */
  advantageAudience: boolean;
  placement: PlacementInput;
  /** UNIX 초(UTC). «지금»은 호출 시각 */
  startTime: number;
  /** null = 종료 없음(end_time:"0") */
  endTime: number | null;
}

/** 타겟만 떼어 낸 부분 — 검색 피커·도달 추정이 이 모양을 주고받는다(이름·일정은 필요 없다) */
export type TargetingInput = Pick<
  AdSetInput,
  "geo" | "ageMin" | "ageMax" | "gender" | "interests" | "advantageAudience" | "placement"
>;

export const ADSET_NAME_MAX = 400;
export const AGE_MIN_FLOOR = 13;
export const AGE_MAX_CEIL = 65;
/** 광고 세트당 지역(시·도) 상한 — Meta regions 200. 한국은 17개라 사실상 안 걸린다 */
export const MAX_REGIONS = 200;
/** 관심사 상한 — v1 제품 결정(너무 많이 고르면 flexible_spec 이 OR 합집합이라 타겟이 의미를 잃는다) */
export const MAX_INTERESTS = 25;
/** adgeolocation region key · adinterest id 모양 — 클라이언트가 보낸 값은 이걸 통과해야 서버가 본다 */
export const REGION_KEY_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const INTEREST_ID_RE = /^\d{1,30}$/;
export const TARGET_NAME_MAX = 120;

/**
 * 클라이언트가 보낸 타겟 JSON 의 **모양** 검사 — 서버 액션(도달 추정·생성)이 buildTargeting 에 넣기 전에 통과시킨다.
 * 값의 의미(정책 잠금)는 validateAdSetInput 이, 여기서는 «우리가 만든 모양인가»만 본다. 실패는 null.
 */
export function parseTargetingInput(raw: unknown): TargetingInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const geoRaw = r.geo as Record<string, unknown> | undefined;
  let geo: GeoInput;
  if (geoRaw?.mode === "country") geo = { mode: "country" };
  else if (geoRaw?.mode === "regions" && Array.isArray(geoRaw.regions)) {
    if (geoRaw.regions.length === 0 || geoRaw.regions.length > MAX_REGIONS) return null;
    const regions: GeoRegion[] = [];
    for (const g of geoRaw.regions as unknown[]) {
      const o = g as Record<string, unknown>;
      if (typeof o?.key !== "string" || !REGION_KEY_RE.test(o.key)) return null;
      if (typeof o.name !== "string" || o.name.length === 0 || o.name.length > TARGET_NAME_MAX) return null;
      regions.push({ key: o.key, name: o.name });
    }
    geo = { mode: "regions", regions };
  } else return null;

  const ageMin = r.ageMin, ageMax = r.ageMax;
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax)) return null;
  if ((ageMin as number) < AGE_MIN_FLOOR || (ageMax as number) > AGE_MAX_CEIL || (ageMin as number) > (ageMax as number)) return null;

  const gender = r.gender;
  if (gender !== "all" && gender !== "male" && gender !== "female") return null;
  const placement = r.placement;
  if (placement !== "auto" && placement !== "instagram") return null;
  if (typeof r.advantageAudience !== "boolean") return null;

  if (!Array.isArray(r.interests) || r.interests.length > MAX_INTERESTS) return null;
  const interests: Interest[] = [];
  for (const i of r.interests as unknown[]) {
    const o = i as Record<string, unknown>;
    if (typeof o?.id !== "string" || !INTEREST_ID_RE.test(o.id)) return null;
    if (typeof o.name !== "string" || o.name.length === 0 || o.name.length > TARGET_NAME_MAX) return null;
    interests.push({ id: o.id, name: o.name });
  }

  return {
    geo,
    ageMin: ageMin as number,
    ageMax: ageMax as number,
    gender,
    interests,
    advantageAudience: r.advantageAudience,
    placement,
  };
}
/** 타겟 자동 확장을 켜면 최소 연령은 18~25 만 허용(문서 확인) */
export const ADVANTAGE_AGE_MIN_RANGE: [number, number] = [18, 25];
/** 한국 v1 — 국가는 이것 하나 */
export const TARGET_COUNTRY = "KR";

/** 특별 광고 카테고리 중 타겟 제한이 걸리는 넷(정치는 제한 없음 — 확인) */
export const RESTRICTED_SPECIAL_CATEGORIES: readonly SpecialAdCategory[] = [
  "EMPLOYMENT",
  "HOUSING",
  "CREDIT",
  "FINANCIAL_PRODUCTS_SERVICES",
];

export function hasRestrictedCategory(categories: readonly string[]): boolean {
  return categories.some((c) => (RESTRICTED_SPECIAL_CATEGORIES as readonly string[]).includes(c));
}

/* ── 검증(화면=서버) ───────────────────────────────────────────── */

export function validateAdSetInput(
  input: AdSetInput,
  ctx: { specialCategories: readonly string[]; now?: number },
): string | null {
  const now = ctx.now ?? Math.floor(Date.now() / 1000);
  if (!input.name.trim()) return "광고 세트 이름을 입력해 주세요.";
  if (input.name.length > ADSET_NAME_MAX) return `광고 세트 이름은 ${ADSET_NAME_MAX}자 이내로 입력해 주세요.`;

  if (!Number.isInteger(input.ageMin) || !Number.isInteger(input.ageMax)) return "연령을 다시 골라 주세요.";
  if (input.ageMin < AGE_MIN_FLOOR || input.ageMax > AGE_MAX_CEIL || input.ageMin > input.ageMax) {
    return `연령은 ${AGE_MIN_FLOOR}~${AGE_MAX_CEIL}+ 사이에서 골라 주세요.`;
  }

  const restricted = hasRestrictedCategory(ctx.specialCategories);
  if (restricted) {
    /* 고용·주택·금융 — 연령 18~65+, 성별 전체, 관심사 없음(v1 제품 결정 — 문서는 승인 목록 내 포함 허용) */
    if (input.ageMin !== 18 || input.ageMax !== AGE_MAX_CEIL) return "특별 광고 카테고리 캠페인은 연령을 18~65+로 두어야 해요.";
    if (input.gender !== "all") return "특별 광고 카테고리 캠페인은 성별을 나눌 수 없어요.";
    if (input.interests.length > 0) return "특별 광고 카테고리 캠페인은 관심사 타겟을 쓸 수 없어요.";
  }

  const includesMinors = input.ageMin < 18;
  if (includesMinors) {
    /* 청소년 포함 — 성별·상세 타겟 불가, 자동 확장은 18 미만과 함께 못 쓴다 */
    if (input.gender !== "all") return "18세 미만을 포함하면 성별을 나눌 수 없어요.";
    if (input.interests.length > 0) return "18세 미만을 포함하면 관심사 타겟을 쓸 수 없어요.";
    if (input.advantageAudience) return "18세 미만을 포함하면 타겟 자동 확장을 켤 수 없어요.";
  }

  if (input.advantageAudience) {
    const [lo, hi] = ADVANTAGE_AGE_MIN_RANGE;
    if (input.ageMin < lo || input.ageMin > hi) return `타겟 자동 확장을 켜면 최소 연령은 ${lo}~${hi}세 사이여야 해요.`;
  }

  if (input.geo.mode === "regions") {
    if (input.geo.regions.length === 0) return "지역을 하나 이상 골라 주세요.";
    if (input.geo.regions.some((r) => !r.key.trim())) return "지역 정보를 다시 골라 주세요.";
  }
  if (input.interests.some((i) => !/^\d{1,30}$/.test(i.id))) return "관심사 정보를 다시 골라 주세요.";

  if (!Number.isFinite(input.startTime) || input.startTime <= 0) return "시작 시각을 골라 주세요.";
  if (input.endTime !== null) {
    if (!Number.isFinite(input.endTime) || input.endTime <= 0) return "종료 시각을 다시 골라 주세요.";
    if (input.endTime <= input.startTime) return "종료 시각은 시작 시각보다 뒤여야 해요.";
    if (input.endTime <= now) return "종료 시각이 이미 지났어요. 종료일을 다시 골라 주세요.";
  }
  return null;
}

/* ── 직렬화(§2.3) — 여기 출력이 곧 Meta 로 나가는 값이다 ─────────── */

export interface AdSetTargetingJson {
  geo_locations: { countries?: string[]; regions?: { key: string }[] };
  age_min: number;
  age_max?: number;
  genders?: number[];
  flexible_spec?: { interests: { id: string; name: string }[] }[];
  publisher_platforms?: string[];
  targeting_automation: { advantage_audience: 0 | 1 };
}

export function buildTargeting(input: TargetingInput): AdSetTargetingJson {
  const t: AdSetTargetingJson = {
    /* «전국» = countries:["KR"]. 시·도를 골랐을 때 countries 를 함께 보내면 합집합(추정 — 광고 관리자 동작에서 유추)이
       되어 전국이 되므로 regions 만 보낸다. «국가 1개 필수» 규칙과 충돌하는지는 §11-15(validate_only 로 확인). */
    geo_locations:
      input.geo.mode === "country"
        ? { countries: [TARGET_COUNTRY] }
        : { regions: input.geo.regions.map((r) => ({ key: r.key })) },
    age_min: input.ageMin,
    /* ⚠️ 항상 명시 — v23+ 신규 광고 세트에 필수(HEC-F 아닌 경우도) */
    targeting_automation: { advantage_audience: input.advantageAudience ? 1 : 0 },
  };
  /* 자동 확장 켬이면 age_max 를 보내지 않는다(문서 확인) */
  if (!input.advantageAudience) t.age_max = input.ageMax;
  if (input.gender === "male") t.genders = [1];
  else if (input.gender === "female") t.genders = [2];
  if (input.interests.length > 0) {
    t.flexible_spec = [{ interests: input.interests.map((i) => ({ id: i.id, name: i.name })) }];
  }
  /* «자동» = 위치 키를 하나도 안 보낸다(= Advantage+ 노출 위치). «인스타만» = 플랫폼만, positions 생략 */
  if (input.placement === "instagram") t.publisher_platforms = ["instagram"];
  return t;
}

export interface AdSetParamsCtx {
  campaignId: string;
  spec: AdSetObjectiveSpec;
  /** promotedObject === "page" 일 때 필요 */
  pageId: string | null;
  validateOnly?: boolean;
}

/**
 * POST /act_{id}/adsets 파라미터. 예산 필드는 **없다**(CBO — 캠페인이 갖는다, 1885621).
 * status 는 PAUSED 상수 — 이 모듈에는 다른 값을 만드는 경로가 없다.
 */
export function buildAdSetParams(input: AdSetInput, ctx: AdSetParamsCtx): Record<string, string> {
  const params: Record<string, string> = {
    name: input.name,
    campaign_id: ctx.campaignId,
    status: "PAUSED",
    optimization_goal: ctx.spec.optimizationGoal,
    billing_event: ctx.spec.billingEvent,
    targeting: JSON.stringify(buildTargeting(input)),
    /* 생략 시 기본값이 문서에 없다 — 항상 보낸다 */
    start_time: String(input.startTime),
    /* «종료 없음» = 0 명시(광고 세트 레퍼런스 원문). 생략하지 않는다(§13-11) */
    end_time: input.endTime === null ? "0" : String(input.endTime),
  };
  if (ctx.spec.destinationType) params.destination_type = ctx.spec.destinationType;
  if (ctx.spec.promotedObject === "page" && ctx.pageId) {
    params.promoted_object = JSON.stringify({ page_id: ctx.pageId });
  }
  if (ctx.validateOnly) params.execution_options = JSON.stringify(["validate_only"]);
  return params;
}

/** 자동 이름 — «{캠페인} 광고 세트 {n}». 사용자가 접힌 입력에서 바꿀 수 있다 */
export function adsetAutoName(campaignName: string, n: number): string {
  const base = `${campaignName} 광고 세트 ${n}`;
  return base.length > ADSET_NAME_MAX ? base.slice(0, ADSET_NAME_MAX) : base;
}

/** 요약 한 줄(마법사 ③·감사 로그) */
export function describeTargeting(input: AdSetInput): string {
  const parts: string[] = [];
  parts.push(input.geo.mode === "country" ? "전국" : input.geo.regions.map((r) => r.name).join("·"));
  parts.push(`${input.ageMin}~${input.advantageAudience || input.ageMax >= AGE_MAX_CEIL ? "65+" : input.ageMax}세`);
  parts.push(input.gender === "all" ? "전체" : input.gender === "male" ? "남성" : "여성");
  if (input.interests.length > 0) parts.push(`관심사 ${input.interests.length}개`);
  parts.push(input.placement === "auto" ? "자동 노출 위치" : "Instagram만");
  if (input.advantageAudience) parts.push("타겟 자동 확장");
  return parts.join(" · ");
}
