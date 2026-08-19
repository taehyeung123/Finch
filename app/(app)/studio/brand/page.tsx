import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/section-header";
import { getBrandKit } from "../brand-kit-actions";
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
export default async function BrandPage() {
  /* 저장된 킷을 **서버에서** 읽어 넘긴다. 앞서는 클라이언트가 kit 을 null 로만
     초기화하고 getBrandKit 을 아무 데서도 안 불러서, 이미 저장한 사람도 버튼이
     "만들기"로 뜨고 색이 기본값으로 보였다 — 그대로 저장하면 덮어썼다. */
  const kit = await getBrandKit();
  return (
    <div className="space-y-5">
      <PageHeader
        title="브랜드"
        description="여기서 정한 톤과 색이 AI 생성 결과에 자동으로 반영됩니다."
      />
      <BrandPanels initialKit={kit} />
    </div>
  );
}
