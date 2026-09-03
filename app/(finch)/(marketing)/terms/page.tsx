import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_SECTIONS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "핀치(Finch) 서비스 이용약관입니다. 서비스 이용 조건, 이용자의 의무, 인스타그램 등 외부 플랫폼 연동 및 자동 DM 기능 이용 시 준수사항, 책임의 한계를 안내합니다.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

/*
  이용약관 — 메타 앱 심사에 필요한 공개 약관 URL + 자동 DM 기능의 이용자 책임 고지(정보통신망법·플랫폼 정책).
  본문은 lib/legal/documents.ts 가 정본이다(앱 안 /settings/legal/terms 와 같은 문서).
*/
export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">이용약관</h1>
      <LegalDocument sections={TERMS_SECTIONS} className="mt-4" />
    </section>
  );
}
