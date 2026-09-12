import type { Metadata } from "next";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { RefundPolicy } from "@/components/legal/refund-policy";

export const metadata: Metadata = {
  title: "환불정책",
  description:
    "핀치(Finch) 유료 요금제의 자동 갱신 해지, 청약철회(결제 후 7일), 이용분 공제 계산식과 예시, 환불 사유와 처리 기한을 안내합니다.",
  alternates: { canonical: "/terms/refund" },
  robots: { index: true, follow: true },
};

/* 환불정책 — 이용약관 제22~29조를 모아 보여 주는 페이지(전자상거래법 §13② 거래조건 고지·PG 심사용 링크) */
export default function RefundPolicyPage() {
  return (
    <MarketingLegalPage title="환불정책" current="refund">
      <RefundPolicy />
    </MarketingLegalPage>
  );
}
