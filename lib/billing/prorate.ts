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
 */

const DAY = 86_400_000;

export interface ProratedRemaining {
  /** 이번 이용기간의 날 수(다음 결제일 − 1개월 ~ 다음 결제일) */
  cycleDays: number;
  /** 지금부터 다음 결제일까지 남은 온전한 날 수 */
  remainingDays: number;
  /** 돌려줄 금액(원) */
  refund: number;
}

export function proratedRemaining(amount: number, periodEnd: Date, now: Date = new Date()): ProratedRemaining {
  const start = new Date(periodEnd.getTime());
  start.setUTCMonth(start.getUTCMonth() - 1);
  const cycleDays = Math.max(1, Math.round((periodEnd.getTime() - start.getTime()) / DAY));
  const remainingDays = Math.min(cycleDays, Math.max(0, Math.floor((periodEnd.getTime() - now.getTime()) / DAY)));
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  return { cycleDays, remainingDays, refund: Math.floor((safeAmount * remainingDays) / cycleDays) };
}
