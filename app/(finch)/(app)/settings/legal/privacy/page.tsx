import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_DOC } from "@/lib/legal/documents";
import { LegalDocShell } from "../_components/legal-doc-shell";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  robots: { index: false, follow: false },
};

/* 앱 안 방침 — 본문은 /privacy 와 같은 lib/legal/documents.ts */
export default function PrivacyInAppPage() {
  return (
    <LegalDocShell title="개인정보처리방침" description="핀치가 개인정보를 어떻게 처리하는지 알려 드려요." publicHref="/privacy">
      <LegalDocument doc={PRIVACY_DOC} variant="app" />
    </LegalDocShell>
  );
}
