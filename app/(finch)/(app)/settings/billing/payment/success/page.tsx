import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsShell } from "../../../_components/settings-shell";
import { CardIssueClient } from "./_components/card-issue-client";

export const metadata: Metadata = {
  title: "결제 카드 변경",
  robots: { index: false, follow: false },
};

/* 카드 변경 — 빌링 인증 성공 콜백(successUrl?authKey=&customerKey=). 서버 교체는 클라이언트가 1회 호출 */
export default async function CardChangeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const authKey = typeof sp.authKey === "string" ? sp.authKey : null;
  const customerKey = typeof sp.customerKey === "string" ? sp.customerKey : null;

  return (
    <SettingsShell title="결제 카드 변경">
      <div className="mx-auto w-full max-w-lg">
        {authKey && customerKey ? (
          <CardIssueClient authKey={authKey} customerKey={customerKey} />
        ) : (
          <Card className="flex flex-col items-center gap-4 p-4 text-center">
            <p className="text-[15px] text-fg-sub">등록 정보가 올바르지 않아요. 처음부터 다시 시도해 주세요.</p>
            <ButtonLink href="/settings/billing/payment" variant="primary" size="md">
              결제수단으로 돌아가기
            </ButtonLink>
          </Card>
        )}
      </div>
    </SettingsShell>
  );
}
