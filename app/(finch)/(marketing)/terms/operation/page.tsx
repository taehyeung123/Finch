import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { OPERATION_DOC } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "운영정책",
  description:
    "핀치(Finch) 운영정책입니다. 프로필 링크·방명록·자동 DM 등에서 금지되는 게시물, 페이지 주소 정책, 신고·임시조치·저작권 게시 중단 절차와 이용 제한 기준을 안내합니다.",
  alternates: { canonical: "/terms/operation" },
  robots: { index: true, follow: true },
};

/* 운영정책 — 이용약관 제4조에 따라 약관의 일부. 본문은 lib/legal/documents.ts(OPERATION_DOC) */
export default function OperationPolicyPage() {
  return (
    <MarketingLegalPage title="운영정책" current="operation">
      <LegalDocument doc={OPERATION_DOC} />
    </MarketingLegalPage>
  );
}
