import type { Metadata } from "next";
import { LegalBlocks } from "@/components/legal/legal-document";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { PRIVACY_NOTICE } from "@/lib/legal/notices";
import { koDate } from "@/lib/legal/versions";

export const metadata: Metadata = {
  title: "개인정보처리방침 개정 안내",
  description: "핀치(Finch) 개인정보처리방침의 변경 전후 비교와 개정 내용을 안내합니다.",
  alternates: { canonical: "/privacy/changes" },
  robots: { index: false, follow: true },
};

/* 방침 제22조의 «변경 전후 비교»가 가리키는 곳 */
export default function PrivacyChangesPage() {
  return (
    <MarketingLegalPage title="개인정보처리방침 개정 안내">
      <p className="text-[15px] text-fg-sub">
        {PRIVACY_NOTICE.title} · 게시 {koDate(PRIVACY_NOTICE.postedAt)}
      </p>
      <LegalBlocks blocks={PRIVACY_NOTICE.blocks} className="mt-6" />
    </MarketingLegalPage>
  );
}
