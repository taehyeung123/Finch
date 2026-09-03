import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_EFFECTIVE, PRIVACY_SECTIONS } from "@/lib/legal/documents";
import { formatDate } from "@/lib/format";
import { SettingsShell } from "../../_components/settings-shell";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  robots: { index: false, follow: false },
};

/* 앱 안 방침 — 본문은 /privacy 와 같은 lib/legal/documents.ts */
export default function PrivacyInAppPage() {
  return (
    <SettingsShell
      title="개인정보처리방침"
      description={`시행일 ${formatDate(PRIVACY_EFFECTIVE)} · 초안`}
      action={
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="trans-state relative inline-flex items-center gap-1 py-2 text-[14px] font-medium text-fg-sub underline underline-offset-2 after:absolute after:-inset-x-2 after:inset-y-0 after:content-[''] hover:text-fg"
        >
          새 창에서 열기 <ExternalLink className="size-3.5" aria-hidden />
        </a>
      }
    >
      <Card className="p-4">
        <LegalDocument sections={PRIVACY_SECTIONS} variant="app" />
      </Card>
    </SettingsShell>
  );
}
