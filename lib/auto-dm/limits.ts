/**
 * 자동 DM 플랜 게이팅 — 2026-08-14 개편: "발송 건수"가 아니라 "자동화 콘텐츠 개수"로 관리.
 *
 * 배경: DM 발송은 AI를 쓰지 않고 Meta Graph API도 발송비가 없어 원가가 0원이다.
 * 그래서 월 발송량 한도(구 PLAN_DM_LIMITS, 무료 0건)를 폐지하고 — 무료 사용자도
 * 발송은 무제한 — 대신 자동화를 걸 수 있는 게시물(콘텐츠) 개수를 플랜별로 제한한다
 * (리틀리 방식). 스팸 방지는 규칙별 하루 상한(daily_cap, 기본 300)이 그대로 담당한다.
 *
 * 무료 1개는 사장님 확정(2026-08-14), 유료 단계는 원가와 무관한 상품 차별화 값이라
 * 필요 시 이 표만 고치면 된다.
 */
export const PLAN_DM_CONTENT_LIMITS: Record<string, number> = {
  free: 1,
  creator: 5,
  pro: 20,
  agency: 100,
  enterprise: 1000000, // 실질 무제한
};

export function dmContentLimitFor(plan: string | null | undefined): number {
  return PLAN_DM_CONTENT_LIMITS[plan ?? "free"] ?? PLAN_DM_CONTENT_LIMITS.free;
}
