/**
 * 캠페인 쓰기 규칙 — 화면(폼)과 서버 액션이 **같은 값**을 본다 (lib/publish-rules.ts 와 같은 원칙).
 *
 * ⚠️ lib/ads/meta-labels.ts 의 구 체계 목표(BRAND_AWARENESS·REACH 등)는 **조회용 라벨**이다 —
 * v21.0(2024-10)부터 구 목표로 «새로» 만들 수만 없을 뿐 기존 캠페인은 계속 돈다.
 * 생성 가능 목록(여기)과 표시 라벨 맵(meta-labels)은 다른 집합이다. 합치지 말 것.
 */

/** 생성 가능한 목표(ODAX 체계 6종) — Meta 가 신규 생성에 받는 유일한 집합 */
export const CREATABLE_OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_APP_PROMOTION",
  "OUTCOME_SALES",
] as const;
export type CreatableObjective = (typeof CREATABLE_OBJECTIVES)[number];

/**
 * v1 폼에 노출하는 목표 4종 — 잠재고객(페이지 필요)·앱 홍보(앱 필요)는
 * 지금 만들 수 있는 하위 계층이 없어 목록에서 뺀다(고르게 해 놓고 못 만들면 더 나쁘다).
 */
export const FORM_OBJECTIVES: { value: CreatableObjective; label: string; description: string }[] = [
  { value: "OUTCOME_SALES", label: "판매", description: "구매·전환을 늘려요" },
  { value: "OUTCOME_TRAFFIC", label: "트래픽", description: "웹사이트·프로필 방문을 늘려요" },
  { value: "OUTCOME_AWARENESS", label: "인지도", description: "더 많은 사람에게 알려요" },
  { value: "OUTCOME_ENGAGEMENT", label: "참여", description: "좋아요·댓글·팔로우를 늘려요" },
];

/**
 * 특별 광고 카테고리 — 생성 필수 파라미터다.
 * ⚠️ 기본값을 조용히 [] 로 보내지 말 것: 신용·주택·고용·선거 광고를 카테고리 없이
 * 집행하면 계정 제재 사유다. 사용자가 «해당 없음»을 명시적으로 고르게 한다.
 */
export const SPECIAL_AD_CATEGORIES = [
  "EMPLOYMENT",
  "HOUSING",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
  "ONLINE_GAMBLING_AND_GAMING",
  "FINANCIAL_PRODUCTS_SERVICES",
] as const;
export type SpecialAdCategory = (typeof SPECIAL_AD_CATEGORIES)[number];

export const SPECIAL_AD_CATEGORY_LABELS: Record<SpecialAdCategory, string> = {
  EMPLOYMENT: "고용 (채용·구인)",
  HOUSING: "주택 (부동산·임대)",
  CREDIT: "신용 (대출·카드)",
  ISSUES_ELECTIONS_POLITICS: "사회 이슈·선거·정치",
  ONLINE_GAMBLING_AND_GAMING: "온라인 도박·게이밍",
  FINANCIAL_PRODUCTS_SERVICES: "금융 상품·서비스",
};

/**
 * 캠페인 이름 상한 — Meta 문서에서 캠페인 것을 확정하지 못했다(광고 세트는 400자).
 * 보수적으로 잡고, 서버는 초과 시 Meta 오류를 그대로 전달한다.
 */
export const CAMPAIGN_NAME_MAX = 200;

export interface CampaignInput {
  name: string;
  objective: CreatableObjective;
  /** 주 단위 금액(화면 입력값 그대로) — 최소 단위 변환은 어댑터 직전에 toMinor 로 */
  dailyBudget: number;
  /** «해당 없음» 확인이 곧 빈 배열이다 — 확인 없이 빈 배열을 만들지 않는다 */
  specialCategories: SpecialAdCategory[];
}

/** 폼·서버가 공유하는 검증 — 통과해도 어댑터가 validate_only 로 Meta 검증을 한 번 더 받는다 */
export function validateCampaignInput(input: {
  name: string;
  objective: string;
  dailyBudget: number;
  /** AdAccount.min_daily_budget (주 단위 환산값). null = 조회 실패(«모름») — 검증을 건너뛴다 */
  minDailyBudget: number | null;
}): string | null {
  if (!input.name.trim()) return "캠페인 이름을 입력해 주세요.";
  if (input.name.length > CAMPAIGN_NAME_MAX) return `캠페인 이름은 ${CAMPAIGN_NAME_MAX}자 이내로 입력해 주세요.`;
  if (!(CREATABLE_OBJECTIVES as readonly string[]).includes(input.objective)) {
    return "캠페인 목표를 선택해 주세요.";
  }
  if (!Number.isFinite(input.dailyBudget) || input.dailyBudget <= 0) {
    return "일 예산을 입력해 주세요.";
  }
  /* 최소 예산은 계정에서 읽은 값으로만 검증한다 — 원화 상수(5000원)를 박으면 USD 계정에서 무의미하다.
     모르면(null) 여기서 막지 않고 Meta 가 거절하게 둔다. */
  if (input.minDailyBudget !== null && input.dailyBudget < input.minDailyBudget) {
    return `이 광고 계정의 최소 일 예산보다 적어요.`;
  }
  return null;
}
