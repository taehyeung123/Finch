/**
 * 남은 이용기간의 일할 금액 — **순수 모듈**(검증 스크립트 scripts/test-legal.ts 가 직접 불러온다).
 *
 * 약관이 «남은 이용기간에 해당하는 요금을 일할 계산하여 환불»을 약속하는 곳이 셋이다:
 *  · 제3조⑤·부칙 제2조 — 바뀐 약관에 동의하지 않고 탈퇴(동의 화면의 회원 탈퇴)
 *  · 제24조① — 상위 요금제로 변경
 *  · 제16·17조 등 서비스 종료·주요 기능 중단
 * 환불정책 페이지의 계산 예시(lib/legal/refund.ts «10일째 → 남은 20일분»)와 같은 식이다:
 * 이용기간은 결제일부터 1개월(다음 결제일 전날까지), 남은 일수는 «지금부터 다음 결제일까지의 온전한 날 수»(버림),
 * 금액은 요금 × 남은 일수 ÷ 그 달의 이용일수(원 단위 미만 버림).
 *
 * 이용기간의 시작(=결제일)을 다음 결제일에서 «한 달 빼기»로만 되짚으면 틀린다(2026-09-12 소넷 점검).
 * 다음 결제일은 JS setMonth(+1)로 만드는데, 1월 31일 + 1개월은 2월이 짧아 **3월 3일**로 넘어간다.
 * 거꾸로 3월 3일 − 1개월은 2월 3일이라 이용기간을 31일이 아니라 28일로 세고, 환불액이 약 11% 부풀었다.
 * 그래서 실제 결제 시각(payment_orders.approved_at)을 함께 받는다. 두 추정은 모두 참 이용기간보다 **길지 않다**
 * (결제 시각은 갱신 크론 지연만큼 늦을 수 있고, 한 달 빼기는 넘김이 있었으면 늦게 떨어진다) — 그래서 **긴 쪽**을 쓴다.
 * 결제 시각이 이번 기간 것이 아니면(31일보다 앞 — 지난 주기의 주문) 버리고 한 달 빼기만 쓴다.
 */

const DAY = 86_400_000;
/** 한 이용기간의 최대 길이 — setMonth 넘김(1/31 → 3/3 등)을 포함해도 31일을 넘지 않는다 */
const MAX_CYCLE_DAYS = 31;

export interface ProratedRemaining {
  /** 이번 이용기간의 날 수(결제일 ~ 다음 결제일) */
  cycleDays: number;
  /** 지금부터 다음 결제일까지 남은 온전한 날 수 */
  remainingDays: number;
  /** 돌려줄 금액(원) */
  refund: number;
}

/**
 * @param paidAt 이번 이용기간을 연 결제의 승인 시각(payment_orders.approved_at) — 없거나 이번 기간 것이 아니면 무시한다
 */
export function proratedRemaining(
  amount: number,
  periodEnd: Date,
  now: Date = new Date(),
  paidAt?: Date | null,
): ProratedRemaining {
  const start = new Date(periodEnd.getTime());
  start.setUTCMonth(start.getUTCMonth() - 1);
  let cycleDays = Math.max(1, Math.round((periodEnd.getTime() - start.getTime()) / DAY));
  if (paidAt && Number.isFinite(paidAt.getTime())) {
    const fromPaid = Math.round((periodEnd.getTime() - paidAt.getTime()) / DAY);
    if (fromPaid >= 1 && fromPaid <= MAX_CYCLE_DAYS) cycleDays = Math.max(cycleDays, fromPaid);
  }
  const remainingDays = Math.min(cycleDays, Math.max(0, Math.floor((periodEnd.getTime() - now.getTime()) / DAY)));
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  return { cycleDays, remainingDays, refund: Math.floor((safeAmount * remainingDays) / cycleDays) };
}
