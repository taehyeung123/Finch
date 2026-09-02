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

/**
 * 쓰기 차단·실패 사유 코드와 문구 — **단일 출처**.
 * getAdsWriteContext(서버)·서버 액션·상태 배너(페이지)가 전부 이 표를 본다.
 *
 * 왜 코드로 나르나: 상태 전환 실패를 URL 로 알리는데, 문구를 URL 에 실으면
 * 누구나 링크로 임의 문구를 신뢰된 배너에 주입할 수 있다(피싱 카피 — 감사 적발).
 * 코드만 나르고 문구는 이 표에서 찾는다 — 모르는 코드는 generic 으로 떨어진다.
 */
export const ADS_WRITE_MESSAGES = {
  demo_mode: "지금은 예시 데이터를 보고 계셔서 캠페인을 만들 수 없어요.",
  unconfigured: "광고 연동이 아직 열리지 않았어요.",
  login_required: "로그인이 필요해요.",
  consent_required: "서비스 이용 동의가 필요해요. 화면을 새로고침해 주세요.",
  role_denied: "캠페인을 변경할 권한이 없어요. 워크스페이스 소유자에게 요청해 주세요.",
  connection_missing: "광고 계정이 연결돼 있지 않아요. 설정에서 연결해 주세요.",
  connection_expired: "광고 계정 연결이 만료됐어요. 설정에서 다시 연결해 주세요.",
  connection_unreadable: "연결 정보를 읽지 못했어요. 설정에서 다시 연결해 주세요.",
  no_ad_account: "이 계정으로 볼 수 있는 광고 계정이 없어요.",
  no_currency: "광고 계정 통화를 확인하지 못했어요. 설정에서 다시 연결해 주세요.",
  scope_missing: "이 연결에는 캠페인 관리 권한이 없어요. 설정에서 다시 연결해 주세요.",
  account_issue: "광고 계정 상태 때문에 지금은 변경할 수 없어요. 메타 광고 관리자에서 계정을 확인해 주세요.",
  invalid_request: "요청이 올바르지 않아요.",
  campaign_not_yours: "이 캠페인은 현재 선택된 광고 계정의 것이 아니에요.",
  campaign_unverified: "캠페인 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  busy: "이미 처리 중인 요청이 있어요. 잠시 후 다시 시도해 주세요.",
  cooldown: "요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.",
  not_ready: "게재 시작은 아직 준비 중이에요.",
  rate_limited: "요청이 잠시 몰렸어요. 몇 분 뒤 다시 시도해 주세요.",
  token_expired: "광고 계정 연결이 만료됐어요. 설정에서 다시 연결해 주세요.",
  write_denied: "이 광고 계정에 쓰기 권한이 없어요. 다시 연결해 주세요.",
  bad_input: "입력값을 광고 계정이 받지 않았어요. 예산과 이름을 확인해 주세요.",
  failed: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
} as const;
export type AdsWriteFailCode = keyof typeof ADS_WRITE_MESSAGES;

export function adsWriteMessage(code: string | undefined | null): string {
  if (code && code in ADS_WRITE_MESSAGES) return ADS_WRITE_MESSAGES[code as AdsWriteFailCode];
  return ADS_WRITE_MESSAGES.failed;
}

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
