import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsShell } from "../../../_components/settings-shell";
import { IssueClient } from "./_components/issue-client";

/* 빌링 인증 성공 콜백 — successUrl?authKey=&customerKey= → 서버 활성화는 클라이언트가 1회 호출 */
export default async function SubscribeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const authKey = typeof sp.authKey === "string" ? sp.authKey : null;
  const customerKey = typeof sp.customerKey === "string" ? sp.customerKey : null;

  return (
    <SettingsShell title="구독 등록">
      <div className="mx-auto w-full max-w-lg">
        {authKey && customerKey ? (
          <IssueClient authKey={authKey} customerKey={customerKey} />
        ) : (
          <Card className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-[15px] text-fg-sub">등록 정보가 올바르지 않아요. 처음부터 다시 시도해 주세요.</p>
            <ButtonLink href="/settings/billing" variant="primary" size="md">
              플랜 관리로 돌아가기
            </ButtonLink>
          </Card>
        )}
      </div>
    </SettingsShell>
  );
}
