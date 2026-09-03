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
  /* 옛 분류 — 조회 표시용으로만 남는다(아래 FORM 목록에서 뺐다) */
  CREDIT: "신용 (대출·카드)",
  ISSUES_ELECTIONS_POLITICS: "사회 이슈·선거·정치",
  ONLINE_GAMBLING_AND_GAMING: "온라인 도박·게이밍",
  FINANCIAL_PRODUCTS_SERVICES: "금융 상품·서비스 (대출·카드·보험 포함)",
};

/**
 * 생성 폼에 노출하는 카테고리 — `CREDIT` 은 뺀다. 2025-01-14 부로 `FINANCIAL_PRODUCTS_SERVICES` 가
 * 대체했다(특별 광고 카테고리 문서). 같은 뜻의 선택지가 둘이면 사용자가 무엇을 골라야 할지 모르고,
 * CREDIT 전송이 거절되거나 조용히 매핑될 수 있다(2026-09-03 설계 검토). enum 은 기존 캠페인 조회용으로 유지.
 */
export const FORM_SPECIAL_AD_CATEGORIES: readonly SpecialAdCategory[] = SPECIAL_AD_CATEGORIES.filter(
  (c) => c !== "CREDIT",
);

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
  /* ── 2026-09-03 설계 검토 · 2단계(광고 세트·소재·광고)에서 쓰는 코드 — 스펙 §8.2·§13 ── */
  /** 전송 실패 뒤 GET 재확인도 실패 — 적용 여부를 모른다. «실패»라고 말하지 않는다 */
  status_unverified: "게재 상태를 확인하지 못했어요. 목록에서 상태를 확인해 주세요.",
  budget_too_low: "캠페인 일 예산이 광고 세트 수에 비해 적어요. 캠페인 예산을 올린 뒤 다시 시도해 주세요.",
  bid_mismatch: "입찰 설정이 캠페인과 맞지 않아요. 메타 광고 관리자에서 캠페인 입찰 전략을 확인해 주세요.",
  end_time_past: "종료 시각이 이미 지났어요. 종료일을 다시 골라 주세요.",
  link_required: "이 캠페인 목표에는 웹사이트 주소가 필요해요.",
  special_category_targeting: "특별 광고 카테고리 캠페인은 연령·성별·관심사 타겟을 제한해요. 타겟을 넓혀 주세요.",
  verification_required: "이 광고에는 메타 광고주 인증이 필요해요. 메타 광고 관리자에서 인증을 완료해 주세요.",
  targeting_deprecated: "선택한 관심사 중 더 이상 쓸 수 없는 항목이 있어요. 다시 골라 주세요.",
  account_blocked: "광고 계정이 잠시 차단된 상태예요. 메타 광고 관리자에서 확인해 주세요.",
  creative_not_ready: "광고 소재 만들기는 아직 준비 중이에요.",
  scope_missing_pages: "이 연결에는 페이지 조회 권한이 없어요. 설정에서 다시 연결해 주세요.",
  page_required: "광고를 게시할 Facebook 페이지를 먼저 선택해 주세요.",
  page_owner_only: "광고 페이지 선택은 워크스페이스 소유자만 할 수 있어요. 소유자에게 요청해 주세요.",
  page_role_required: "이 페이지에는 편집자 이상 역할이 필요해요. 페이지 설정에서 역할을 확인해 주세요.",
  pages_unverified: "페이지 목록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  instagram_required:
    "선택한 페이지에 연결된 Instagram 계정이 없어요. Meta Business Suite 에서 연결한 뒤 다시 시도해 주세요.",
  instagram_unverified: "Instagram 계정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  campaign_objective_unsupported: "이 캠페인 목표는 아직 핀치에서 광고를 만들 수 없어요.",
  campaign_bid_cap:
    "이 캠페인은 입찰가 상한이 설정돼 있어 핀치에서 광고 세트를 만들 수 없어요. 메타 광고 관리자에서 만들어 주세요.",
  campaign_mixed_goals: "이 캠페인의 기존 광고 세트와 최적화 방식이 달라 추가할 수 없어요.",
  adset_limit: "이 캠페인에는 더 이상 광고 세트를 만들 수 없어요.",
  sales_pixel_required:
    "이 판매 캠페인은 픽셀이 필요해요. 픽셀 없이 진행하려면 트래픽 목표 캠페인에서 광고를 만들어 주세요.",
  media_invalid: "이미지 형식이나 크기가 맞지 않아요. JPG·PNG, 짧은 변 600px 이상, 1:1 또는 4:5 비율이 좋아요.",
  media_upload_failed: "이미지를 광고 계정에 올리지 못했어요. 잠시 후 다시 시도해 주세요.",
  preview_failed: "미리보기를 불러오지 못했어요. 광고는 그대로 만들 수 있어요.",
  object_not_yours: "이 광고는 현재 선택된 광고 계정의 것이 아니에요.",
  object_unverified: "광고 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  partial_created: "광고 세트는 만들어졌지만 광고는 만들지 못했어요. 캠페인 화면에서 확인한 뒤 다시 만들어 주세요.",
  children_disapproved: "거부된 광고만 있어 게재를 시작할 수 없어요. 소재를 고친 뒤 다시 시도해 주세요.",
  bad_input_ad: "입력값을 광고 계정이 받지 않았어요. 문구·링크·이미지를 확인해 주세요.",
} as const;
export type AdsWriteFailCode = keyof typeof ADS_WRITE_MESSAGES;

/**
 * Meta 7자리 검증 오류 → 사유 코드. 문서 오류 레퍼런스에서 확인한 것만(스펙 §8.2).
 * ⚠️ 코드로만 판별한다 — 메시지 문자열은 바뀐다(«Description string is subject to change»).
 * 판별 위치는 code/error_subcode 둘 다 볼 것(ads-write.ts writeErrorCode).
 */
export const AD_ERROR_CODE_MAP: Record<number, AdsWriteFailCode> = {
  1885272: "budget_too_low",
  2238055: "budget_too_low",
  1885650: "budget_too_low",
  1885204: "bid_mismatch",
  1487033: "end_time_past",
  2446383: "link_required",
  2909035: "special_category_targeting",
  2859024: "verification_required",
  2708008: "verification_required",
  1487694: "targeting_deprecated",
  2446394: "targeting_deprecated",
  1404078: "account_blocked",
  /* 개발 모드 앱이 만든 object_story_spec 소재로는 광고를 못 만든다 — 앱 Live 전환 전 */
  1885183: "creative_not_ready",
};

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
