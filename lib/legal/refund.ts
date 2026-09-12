import { PLAN_NAMES, PLAN_PRICES } from "@/lib/toss/config";
import { PLAN_CREDIT_ALLOWANCE } from "@/lib/pricing/credit-config";
import { BUSINESS } from "./business";
import type { LegalBlock } from "./doc-types";
import { pickTermsSections } from "./documents";

/*
  환불정책 페이지(/terms/refund · /settings/legal/refund) — **별도 본문을 쓰지 않는다.**

  전자상거래법 §13② 은 결제 전에 거래조건(청약철회·환불 포함)을 알리게 하고, PG 심사도 환불정책 링크를 요구한다.
  그런데 본문을 두 벌로 두면 반드시 어긋난다(이 저장소가 가장 자주 겪은 회귀가 «두 벌»이다).
  그래서 이 페이지는 ① 요약 표 ② 계산 예시 ③ 이용약관 제22~29조 원문을 그대로 모아 보여 준다.

  계산 예시의 숫자는 요금표 상수(PLAN_PRICES·PLAN_CREDIT_ALLOWANCE)에서 계산한다 — 가격이 바뀌면 예시도 따라 바뀐다.
  (lib/toss/config.ts 는 server-only 다 — 이 모듈은 서버 컴포넌트에서만 쓴다.)
*/

const MAIL = BUSINESS.contactEmail ?? BUSINESS.privacyEmail;

/** 환불정책이 모아 보여 주는 약관 조항 — 제22조 ~ 제29조 */
export const REFUND_TERM_IDS = ["terms-22", "terms-23", "terms-24", "terms-25", "terms-26", "terms-27", "terms-28", "terms-29"] as const;

export function refundTermSections() {
  return pickTermsSections(REFUND_TERM_IDS);
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export const REFUND_HEAD: readonly LegalBlock[] = [
  { note: "이 페이지는 이용약관의 요금·환불 조항(제22조~제29조)을 모은 것입니다. 내용이 다르면 이용약관이 우선합니다." },
  {
    table: {
      head: ["경우", "환불"],
      rows: [
        ["결제 후 7일 안, 크레딧·유료 기능 이용 기록 없음", "전액"],
        ["결제 후 7일 안, 이용 기록 있음", "결제 금액에서 «이용일수 금액»과 «사용 크레딧 금액» 중 큰 금액을 뺀 나머지"],
        ["결제 후 7일이 지남", "남은 기간은 환불하지 않음. 자동 갱신을 해지하면 다음 결제부터 청구하지 않음"],
        ["서비스가 안내·계약과 다르게 제공됨", "받은 날부터 3개월(안 날부터 30일) 안에 철회, 전액 환불"],
        ["상위 요금제로 변경", "이전 요금제의 남은 기간 요금을 일할 환불"],
        ["회사 귀책 장애, 서비스 종료, 잘못된 결제, 미성년자 계약 취소 등", "기간과 관계없이 환불(약관 제29조 제2항)"],
      ],
    },
  },
  {
    list: [
      `신청: 계정 및 설정 > 플랜 관리, 서비스 안의 고객센터, 또는 ${MAIL}`,
      "처리: 청약철회를 한 날부터 3영업일 안에 결제한 수단으로 돌려드립니다. 늦어지면 연 15%의 지연배상금을 함께 드립니다.",
    ],
  },
];

/**
 * 계산 예시 — 약관 제28조③의 식을 그대로 코드로 옮겼다(빼는 금액의 원 단위 미만은 버린다).
 * 예시 기준: 첫 결제(크레딧이 0에서 월 지급량까지 채워진 경우), 이용기간 30일.
 */
export function refundExamples(): readonly LegalBlock[] {
  const DAYS = 30;
  const pro = PLAN_PRICES.pro;
  const proCredits = PLAN_CREDIT_ALLOWANCE.pro;
  const creator = PLAN_PRICES.creator;

  /** 제28조③ — 큰 금액을 빼고 남은 금액 */
  function withdraw(day: number, usedCredits: number) {
    const byDays = Math.floor((pro * day) / DAYS);
    const byCredits = Math.floor((pro * Math.min(usedCredits, proCredits)) / proCredits);
    const deduct = Math.min(pro, Math.max(byDays, byCredits));
    return { byDays, byCredits, deduct, refund: pro - deduct };
  }

  const e2 = withdraw(2, 40);
  const e3 = withdraw(5, 630);
  const upgradeRefund = Math.floor((creator * 20) / DAYS);

  return [
    {
      note: `기준: ${PLAN_NAMES.pro} 월 ${won(pro)}, 월 크레딧 ${proCredits.toLocaleString("ko-KR")}, 이용기간이 30일인 달의 첫 결제(크레딧이 지급량까지 채워진 경우)`,
    },
    {
      list: [
        `결제 당일 철회, 이용 없음 → ${won(pro)} 환불`,
        {
          text: "결제 2일째 철회, 크레딧 40 사용",
          sub: [
            `이용일수 금액: ${pro.toLocaleString("ko-KR")}×2÷30 = ${won(e2.byDays)}`,
            `크레딧 금액: ${pro.toLocaleString("ko-KR")}×40÷${proCredits.toLocaleString("ko-KR")} = ${won(e2.byCredits)}`,
            `큰 금액 ${won(e2.deduct)}을 빼고 ${won(e2.refund)} 환불`,
          ],
        },
        {
          text: "결제 5일째 철회, 크레딧 630 사용",
          sub: [
            `이용일수 금액: ${won(e3.byDays)}`,
            `크레딧 금액: ${won(e3.byCredits)}`,
            `큰 금액 ${won(e3.deduct)}을 빼고 ${won(e3.refund)} 환불`,
          ],
        },
        "결제 10일째 해지 → 환불 없음. 이용기간 끝까지 쓰고 무료 요금제로 전환",
        `${PLAN_NAMES.creator}(월 ${won(creator)}) 이용 10일째에 ${PLAN_NAMES.pro}로 변경 → ${PLAN_NAMES.pro} ${won(pro)} 결제, ${PLAN_NAMES.creator} 남은 20일분 ${won(upgradeRefund)}(${creator.toLocaleString("ko-KR")}×20÷30) 환불`,
      ],
      ordered: true,
    },
  ];
}
