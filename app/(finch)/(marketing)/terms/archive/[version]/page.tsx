import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchivedLegalDocument } from "@/components/legal/archived-document";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { ARCHIVED_DOCS, findArchivedDoc } from "@/lib/legal/archive";

/* 종전 이용약관 — 약관 부칙 제3조가 가리키는 사본. 목록(lib/legal/archive.ts)에 없는 버전은 404 */
export const dynamicParams = false;

export function generateStaticParams() {
  return ARCHIVED_DOCS.filter((d) => d.kind === "terms").map((d) => ({ version: d.version }));
}

export const metadata: Metadata = {
  title: "종전 이용약관",
  /* 옛 문서가 검색에서 현행 약관 대신 잡히면 안 된다 */
  robots: { index: false, follow: true },
};

export default async function ArchivedTermsPage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const doc = findArchivedDoc("terms", version);
  if (!doc) notFound();
  return (
    <MarketingLegalPage title="종전 이용약관">
      <ArchivedLegalDocument doc={doc} currentHref="/terms" />
    </MarketingLegalPage>
  );
}
