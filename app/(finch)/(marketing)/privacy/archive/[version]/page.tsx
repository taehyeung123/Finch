import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchivedLegalDocument } from "@/components/legal/archived-document";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { ARCHIVED_DOCS, findArchivedDoc } from "@/lib/legal/archive";

/* 이전 개인정보처리방침 — 방침 제22조의 «이전 방침 보기». 목록(lib/legal/archive.ts)에 없는 버전은 404 */
export const dynamicParams = false;

export function generateStaticParams() {
  return ARCHIVED_DOCS.filter((d) => d.kind === "privacy").map((d) => ({ version: d.version }));
}

export const metadata: Metadata = {
  title: "이전 개인정보처리방침",
  robots: { index: false, follow: true },
};

export default async function ArchivedPrivacyPage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const doc = findArchivedDoc("privacy", version);
  if (!doc) notFound();
  return (
    <MarketingLegalPage title="이전 개인정보처리방침">
      <ArchivedLegalDocument doc={doc} currentHref="/privacy" />
    </MarketingLegalPage>
  );
}
