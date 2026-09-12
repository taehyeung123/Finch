import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { OPERATION_DOC } from "@/lib/legal/documents";
import { LegalDocShell } from "../_components/legal-doc-shell";

export const metadata: Metadata = {
  title: "운영정책",
  robots: { index: false, follow: false },
};

/* 앱 안 운영정책 — 본문은 /terms/operation 과 같은 lib/legal/documents.ts */
export default function OperationInAppPage() {
  return (
    <LegalDocShell
      title="운영정책"
      description="게시물 기준, 신고·조치 절차, 이용 제한 기준이에요. 이용약관의 일부예요."
      publicHref="/terms/operation"
    >
      <LegalDocument doc={OPERATION_DOC} variant="app" />
    </LegalDocShell>
  );
}
