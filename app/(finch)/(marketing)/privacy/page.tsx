import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { PRIVACY_DOC } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description:
    "핀치(Finch)의 개인정보처리방침입니다. 처리하는 개인정보 항목과 목적, 보유 기간, 위탁과 국외 이전, 인스타그램·메타 등 연동 데이터의 처리와 삭제, 쿠키, 정보주체의 권리를 안내합니다.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/*
  개인정보처리방침 — 메타(Instagram) 앱 심사 필수 요건 + 개인정보보호법 §30 기재사항.
  본문은 lib/legal/documents.ts 가 정본이다(앱 안 /settings/legal/privacy 와 같은 문서).
  사업자 정보·보호책임자는 lib/legal/business.ts 에서 읽는다.
*/
export default function PrivacyPage() {
  return (
    <MarketingLegalPage title="개인정보처리방침" current="privacy">
      <LegalDocument doc={PRIVACY_DOC} />
    </MarketingLegalPage>
  );
}
