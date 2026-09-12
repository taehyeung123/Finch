import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_DOC } from "@/lib/legal/documents";
import { LegalDocShell } from "../_components/legal-doc-shell";

export const metadata: Metadata = {
  title: "이용약관",
  robots: { index: false, follow: false },
};

/* 앱 안 약관 — 본문은 /terms 와 같은 lib/legal/documents.ts */
export default function TermsInAppPage() {
  return (
    <LegalDocShell title="이용약관" description="회사와 회원의 권리·의무, 유료 서비스와 환불 기준을 정한 문서예요." publicHref="/terms">
      <LegalDocument doc={TERMS_DOC} variant="app" />
    </LegalDocShell>
  );
}
