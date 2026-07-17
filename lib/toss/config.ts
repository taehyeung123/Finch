/**
 * Toss Payments 공통 설정 — 클라이언트 키(공개)·요금제 금액.
 * 실 스펙: docs/REAL_API_SPEC.md 4절.
 *
 * 클라이언트 키(NEXT_PUBLIC_TOSS_CLIENT_KEY, test_ck_...)는 공개 키라 클라이언트 노출 허용.
 * 시크릿 키(TOSS_SECRET_KEY, test_sk_...)는 lib/toss/server에서만 쓰고 절대 노출하지 않는다.
 */

export type PaidPlan = "creator" | "pro" | "agency";

/**
 * 요금제별 금액(KRW). TODO(비즈니스): 정식 가격 미정 — 아래는 테스트용 잠정값이다.
 * 가격 확정 시 이 표와 마케팅 pricing 페이지를 함께 갱신한다.
 */
export const PLAN_PRICES: Record<PaidPlan, number> = {
  creator: 9_900,
  pro: 29_000,
  agency: 99_000,
};

export const PLAN_NAMES: Record<PaidPlan, string> = {
  creator: "Creator",
  pro: "Pro",
  agency: "Agency",
};

export function isPaidPlan(v: string): v is PaidPlan {
  return v === "creator" || v === "pro" || v === "agency";
}

/** 결제위젯 클라이언트 키 (공개). 미설정이면 결제 UI를 비활성 안내로 폴백. */
export function getTossClientKey(): string | null {
  return process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || null;
}

export function isTossConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY && process.env.TOSS_SECRET_KEY);
}
