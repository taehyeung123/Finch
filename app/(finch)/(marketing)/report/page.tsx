import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS } from "@/lib/legal/business";
import { ReportForm } from "./report-form";

/* 신고 접수 — 공개 프로필 페이지 하단 «신고» 링크의 목적지(2026-08-28).
   검색에 잡힐 이유가 없는 절차 화면이라 noindex. */
export const metadata: Metadata = {
  /* 레이아웃 템플릿이 «| 핀치 (Finch)» 를 붙인다 — 브랜드를 직접 쓰면 이중 표기 */
  title: "페이지 신고",
  description: "문제가 있는 프로필 링크 페이지를 알려 주세요. 확인 후 필요한 조치를 합니다.",
  robots: { index: false },
};

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const { slug } = await searchParams;
  const prefill = typeof slug === "string" ? slug.slice(0, 120) : "";
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12 md:py-16">
      <h1 className="text-[20px] font-bold">페이지 신고</h1>
      <p className="mt-2 text-[14px] leading-[1.7] text-fg-sub">
        사칭·사기·불법 콘텐츠 등 문제가 있는 페이지를 알려 주세요. 확인 후{" "}
        <Link href="/terms/operation" className="underline underline-offset-2 hover:text-fg">
          운영정책
        </Link>
        에 따라 조치하며, 신고 내용은 페이지 주인에게 전달되지 않습니다.
      </p>
      {/* 권리침해 삭제 요청(정보통신망법 §44의2)·저작권 침해(저작권법 §103)는 법이 정한 소명 자료가 필요하다 — 운영정책 제5조② */}
      <p className="mt-2 break-keep text-[14px] leading-[1.7] text-fg-sub">
        명예훼손·사생활 침해 등 권리침해로 삭제를 요청하거나 저작권 침해를 신고하려면, 요청하는 분의 이름·연락처, 대상 주소와
        문제가 되는 내용, 침해된 권리와 권리자임을 보여 주는 자료를 {BUSINESS.contactEmail ?? BUSINESS.privacyEmail}로 보내 주세요.
      </p>
      <ReportForm prefill={prefill} />
    </main>
  );
}
