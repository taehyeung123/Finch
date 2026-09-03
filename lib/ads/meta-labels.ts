/**
 * 메타 광고 원문 코드 → 한국어 표기.
 *
 * ⚠️ **모르는 코드를 «알 수 없음»으로 뭉개지 않는다.** 메타는 목표·상태 코드를 계속 늘리는데,
 * 목록에 없다고 캠페인 이름 옆에 «알 수 없음»이 뜨면 사용자는 자기 캠페인이 망가진 줄 안다.
 * 못 찾으면 원문을 사람이 읽을 수 있게 다듬어 그대로 보여준다(OUTCOME_TRAFFIC → Outcome traffic).
 */

const OBJECTIVE: Record<string, string> = {
  OUTCOME_AWARENESS: "인지도",
  OUTCOME_TRAFFIC: "트래픽",
  OUTCOME_ENGAGEMENT: "참여",
  OUTCOME_LEADS: "잠재 고객",
  OUTCOME_APP_PROMOTION: "앱 홍보",
  OUTCOME_SALES: "판매",
  // 구 체계(2023년 이전 생성 캠페인에 아직 남아 있다)
  BRAND_AWARENESS: "인지도",
  REACH: "도달",
  LINK_CLICKS: "트래픽",
  POST_ENGAGEMENT: "참여",
  PAGE_LIKES: "페이지 좋아요",
  VIDEO_VIEWS: "동영상 조회",
  LEAD_GENERATION: "잠재 고객",
  MESSAGES: "메시지",
  CONVERSIONS: "전환",
  CATALOG_SALES: "카탈로그 판매",
  STORE_VISITS: "매장 방문",
  APP_INSTALLS: "앱 설치",
};

/** 코드를 사람이 읽을 수 있게 — OUTCOME_TRAFFIC → Outcome traffic */
function humanize(code: string): string {
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function objectiveLabel(code: string | null): string {
  if (!code) return "—";
  return OBJECTIVE[code] ?? humanize(code);
}

export type StatusTone = "positive" | "warning" | "negative" | "neutral";

/**
 * 게재 상태 — status(사용자가 설정한 값)가 아니라 **effective_status**(실제 게재 여부)를 쓴다.
 * 둘은 자주 갈린다: 사용자가 ACTIVE 로 둬도 심사 중이거나 거부됐거나 결제가 막히면 안 나간다.
 * status 만 보여주면 «집행 중인데 왜 노출이 0이냐»가 된다.
 */
const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "게재 중", tone: "positive" },
  PAUSED: { label: "일시중지", tone: "neutral" },
  DELETED: { label: "삭제됨", tone: "neutral" },
  ARCHIVED: { label: "보관됨", tone: "neutral" },
  CAMPAIGN_PAUSED: { label: "캠페인 중지", tone: "neutral" },
  ADSET_PAUSED: { label: "광고 세트 중지", tone: "neutral" },
  IN_PROCESS: { label: "처리 중", tone: "warning" },
  PENDING_REVIEW: { label: "심사 중", tone: "warning" },
  PENDING_BILLING_INFO: { label: "결제 정보 필요", tone: "warning" },
  WITH_ISSUES: { label: "문제 있음", tone: "warning" },
  PREAPPROVED: { label: "사전 승인", tone: "warning" },
  DISAPPROVED: { label: "거부됨", tone: "negative" },
};

export function statusLabel(
  effectiveStatus: string | null,
  status: string | null,
): { label: string; tone: StatusTone } {
  const code = effectiveStatus ?? status;
  if (!code) return { label: "—", tone: "neutral" };
  return STATUS[code] ?? { label: humanize(code), tone: "neutral" };
}

/* ── 광고 세트 필드 라벨(2단계 슬라이스 1) — 모르는 코드는 humanize 로 ── */

const OPTIMIZATION_GOAL: Record<string, string> = {
  LINK_CLICKS: "링크 클릭",
  LANDING_PAGE_VIEWS: "랜딩 페이지 조회",
  IMPRESSIONS: "노출",
  REACH: "도달",
  POST_ENGAGEMENT: "게시물 참여",
  PAGE_LIKES: "페이지 좋아요",
  OFFSITE_CONVERSIONS: "전환",
  VALUE: "전환 가치",
  THRUPLAY: "동영상 재생",
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "2초 이상 조회",
  CONVERSATIONS: "대화",
  LEAD_GENERATION: "잠재 고객",
  QUALITY_LEAD: "양질의 잠재 고객",
  APP_INSTALLS: "앱 설치",
  AD_RECALL_LIFT: "광고 상기도",
  VISIT_INSTAGRAM_PROFILE: "프로필 방문",
};

const BILLING_EVENT: Record<string, string> = {
  IMPRESSIONS: "노출당 청구",
  LINK_CLICKS: "링크 클릭당 청구",
  THRUPLAY: "재생당 청구",
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "2초 조회당 청구",
  POST_ENGAGEMENT: "참여당 청구",
  PAGE_LIKES: "좋아요당 청구",
  APP_INSTALLS: "설치당 청구",
};

const DESTINATION_TYPE: Record<string, string> = {
  WEBSITE: "웹사이트",
  ON_AD: "광고 안에서",
  ON_POST: "게시물",
  ON_PAGE: "페이지",
  MESSENGER: "Messenger",
  INSTAGRAM_DIRECT: "Instagram DM",
  INSTAGRAM_PROFILE: "Instagram 프로필",
  WHATSAPP: "WhatsApp",
  APP: "앱",
  SHOP_AUTOMATIC: "샵",
  PHONE_CALL: "전화",
  UNDEFINED: "—",
};

export function optimizationGoalLabel(code: string | null): string {
  if (!code) return "—";
  return OPTIMIZATION_GOAL[code] ?? humanize(code);
}
export function billingEventLabel(code: string | null): string {
  if (!code) return "—";
  return BILLING_EVENT[code] ?? humanize(code);
}
export function destinationTypeLabel(code: string | null): string {
  if (!code) return "—";
  return DESTINATION_TYPE[code] ?? humanize(code);
}
const BID_STRATEGY: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: "자동 입찰 (최저 비용)",
  LOWEST_COST_WITH_BID_CAP: "입찰가 상한",
  COST_CAP: "비용 상한",
  LOWEST_COST_WITH_MIN_ROAS: "최소 ROAS",
};
export function bidStrategyLabel(code: string | null): string {
  if (!code) return "—";
  return BID_STRATEGY[code] ?? humanize(code);
}

/** 1=남성 · 2=여성 · 비어 있음=전체 */
export function genderLabel(genders: number[]): string {
  if (genders.length === 0 || genders.length === 2) return "전체";
  return genders[0] === 1 ? "남성" : genders[0] === 2 ? "여성" : "전체";
}

/**
 * 광고 계정 상태 — 결제가 막혀 있으면 «게재 중»인 캠페인도 실제로는 안 나간다.
 * 문제가 있을 때만 문구를 돌려준다(정상이면 null — 아무 말도 안 하는 게 맞다).
 */
export function accountStatusWarning(status: number | null): string | null {
  switch (status) {
    case 1:
      return null; // 활성
    case 2:
      return "이 광고 계정은 비활성 상태예요. 메타 광고 관리자에서 상태를 확인해 주세요.";
    case 3:
      return "이 광고 계정은 미결제 상태예요. 결제 수단을 확인하기 전까지 광고가 게재되지 않아요.";
    case 7:
      return "이 광고 계정은 검토가 진행 중이에요.";
    case 9:
      return "이 광고 계정은 결제 유예 기간이에요. 결제 수단을 확인해 주세요.";
    case 101:
      return "이 광고 계정은 닫힌 상태예요.";
    default:
      return null;
  }
}
