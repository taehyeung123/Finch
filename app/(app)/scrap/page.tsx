import type { Metadata } from "next";
import { Bookmark } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "스크랩",
  robots: { index: false, follow: false },
};

/*
  스크랩 — 2026-08-15 IA 개편으로 메뉴에 신설.
  백엔드는 이미 있다 — 0029_personal_saves 의 saved_creatives·boards·saved_brands.
  화면만 없어서 "저장은 되는데 다시 볼 곳이 없는" 상태였다(저장할수록 손해).
  목록·보드·메모 연결은 개편 3단계에서 붙인다.
*/
export default function Page() {
  return (
    <div className="space-y-5">
      <PageHeader title="스크랩" description="탐색에서 스크랩한 콘텐츠를 모아 봅니다." />
      <Card>
        <CardBody>
          <EmptyState
            icon={Bookmark}
            title="아직 스크랩한 콘텐츠가 없어요"
            description="탐색에서 마음에 드는 레퍼런스를 스크랩하면 여기에 모입니다."
            action={<ButtonLink href="/library">탐색으로 가기</ButtonLink>}
          />
        </CardBody>
      </Card>
    </div>
  );
}
