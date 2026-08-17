import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "내 콘텐츠",
  robots: { index: false, follow: false },
};

/*
  내 콘텐츠 — 2026-08-15 IA 개편으로 메뉴에 신설.
  크레딧을 써서 만든 자산이 어디에도 남지 않던 문제를 막는 자리다.
  "보관함"이라는 이름은 레퍼런스 스크랩과 헷갈려 쓰지 않는다 —
  남이 만든 것은 스크랩, 내가 만든 것은 내 콘텐츠.
*/
export default function Page() {
  return (
    <div className="space-y-5">
      <PageHeader title="내 콘텐츠" description="AI로 만든 결과물을 모아 보고 다시 씁니다." />
      <Card>
        <CardBody>
          <EmptyState
            icon={Sparkles}
            title="아직 만든 콘텐츠가 없어요"
            description="스튜디오에서 카드뉴스를 만들면 여기에 쌓입니다."
            action={<ButtonLink href="/studio">만들기</ButtonLink>}
          />
        </CardBody>
      </Card>
    </div>
  );
}
