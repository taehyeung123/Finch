import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_SECTIONS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description:
    "핀치(Finch)의 개인정보처리방침입니다. 수집하는 개인정보 항목과 이용 목적, 인스타그램·메타 등 연동 데이터의 처리와 삭제, 보관 기간, 이용자 권리를 안내합니다.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/*
  개인정보처리방침 — 메타(Instagram) 앱 심사 필수 요건 + 개인정보보호법 필수 기재사항을 담은 초안.
  본문은 lib/legal/documents.ts 가 정본이다(앱 안 /settings/legal/privacy 와 같은 문서).
  사업자 정보·보호책임자는 lib/legal/business.ts 에서 읽는다 — 등록되면 한 곳만 채우면 된다.
*/
export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">개인정보처리방침</h1>
      <LegalDocument sections={PRIVACY_SECTIONS} className="mt-4" />
    </section>
  );
}
