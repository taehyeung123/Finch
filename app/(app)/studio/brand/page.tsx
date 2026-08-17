import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/section-header";
import { BrandPanels } from "./_components/brand-panels";

export const metadata: Metadata = {
  title: "브랜드",
  robots: { index: false, follow: false },
};

/*
  브랜드 — 2026-08-15 IA 개편으로 스튜디오에서 분리.

  브랜드 톤(0014_brand_profiles)과 브랜드 킷(0015_brand_kits)은 **한 번 정하고 계속 쓰는
  정체성 설정**이지 생성할 때마다 만지는 입력이 아니다. 그런데 스튜디오 카드뉴스 탭의
  첫 두 블록을 차지하고 있어서, 만들러 들어올 때마다 준비 도구부터 지나가야 했다.
  스튜디오에는 "내 브랜드 톤이 적용됨" 한 줄만 남기고 실제 설정은 여기로 옮긴다.
*/
export default function BrandPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="브랜드"
        description="여기서 정한 톤과 색이 AI 생성 결과에 자동으로 반영됩니다."
      />
      <BrandPanels />
    </div>
  );
}
