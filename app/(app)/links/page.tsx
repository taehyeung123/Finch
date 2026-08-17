import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "프로필 링크",
  robots: { index: false, follow: false },
};

/*
  프로필 링크 — 2026-08-15 IA 개편으로 메뉴에 신설.
  사장님 도입 확정(2026-08-15). 에디터·템플릿·공개 렌더링·방문자 통계는
  개편 6단계에서 붙인다. 지금은 메뉴 자리와 진입점만 잡는다.
*/
export default function Page() {
  return (
    <div className="space-y-5">
      <PageHeader title="프로필 링크" description="SNS 프로필에 거는 링크 페이지를 만들고 방문 성과를 봅니다." />
      <Card>
        <CardBody>
          <EmptyState
            icon={Link2}
            title="아직 만든 프로필 링크가 없어요"
            description="곧 템플릿에서 골라 바로 만들 수 있게 됩니다."
            action={<ButtonLink href="/studio">스튜디오에서 콘텐츠 만들기</ButtonLink>}
          />
        </CardBody>
      </Card>
    </div>
  );
}
