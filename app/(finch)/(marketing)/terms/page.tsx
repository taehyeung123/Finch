import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { TERMS_DOC } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "핀치(Finch) 서비스 이용약관입니다. 이용계약과 탈퇴, 예약 발행·자동 DM·메타 광고·AI 기능·프로필 링크의 이용 기준, 유료 서비스의 자동 갱신·청약철회·환불, 책임과 분쟁 해결을 안내합니다.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

/*
  이용약관 — 메타 앱 심사·PG 심사에 필요한 공개 약관 URL.
  본문은 lib/legal/documents.ts 가 정본이다(앱 안 /settings/legal/terms 와 같은 문서).
*/
export default function TermsPage() {
  return (
    <MarketingLegalPage title="이용약관" current="terms">
      <LegalDocument doc={TERMS_DOC} />
    </MarketingLegalPage>
  );
}
