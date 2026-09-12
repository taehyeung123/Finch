import type { Metadata } from "next";
import { RefundPolicy } from "@/components/legal/refund-policy";
import { LegalDocShell } from "../_components/legal-doc-shell";

export const metadata: Metadata = {
  title: "환불정책",
  robots: { index: false, follow: false },
};

/* 앱 안 환불정책 — /terms/refund 와 같은 구성(이용약관 제22~29조 + 요약·계산 예시) */
export default function RefundInAppPage() {
  return (
    <LegalDocShell title="환불정책" description="이용약관의 요금·청약철회·환불 조항을 모았어요." publicHref="/terms/refund">
      <RefundPolicy variant="app" />
    </LegalDocShell>
  );
}
