import type { Metadata } from "next";
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
        사칭·사기·불법 콘텐츠 등 문제가 있는 페이지를 알려 주세요. 확인 후 이용약관에 따라
        조치하며, 신고 내용은 페이지 주인에게 전달되지 않습니다.
      </p>
      <ReportForm prefill={prefill} />
    </main>
  );
}
