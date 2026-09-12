import type { Metadata } from "next";
import { LegalBlocks } from "@/components/legal/legal-document";
import { MarketingLegalPage } from "@/components/legal/legal-page";
import { TERMS_NOTICE } from "@/lib/legal/notices";
import { koDate } from "@/lib/legal/versions";

export const metadata: Metadata = {
  title: "이용약관 개정 안내",
  description: "핀치(Finch) 이용약관 개정과 운영정책 제정의 주요 내용, 시행일, 동의 방법을 안내합니다.",
  alternates: { canonical: "/terms/changes" },
  /* 한시적인 공지다 — 검색에는 약관 본문(/terms)이 나가게 한다 */
  robots: { index: false, follow: true },
};

/* 약관 제3조③(개정 내용·사유 공지)과 동의 화면의 «변경 내용 보기»가 가리키는 곳 */
export default function TermsChangesPage() {
  return (
    <MarketingLegalPage title="이용약관 개정 안내">
      <p className="text-[15px] text-fg-sub">
        {TERMS_NOTICE.title} · 게시 {koDate(TERMS_NOTICE.postedAt)}
      </p>
      <LegalBlocks blocks={TERMS_NOTICE.blocks} className="mt-6" />
    </MarketingLegalPage>
  );
}
