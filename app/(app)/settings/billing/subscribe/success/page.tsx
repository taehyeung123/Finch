import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
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
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="구독 등록" description="정기결제 등록 처리 결과입니다." />
      {authKey && customerKey ? (
        <IssueClient authKey={authKey} customerKey={customerKey} />
      ) : (
        <Card className="p-8 text-center">
          <p className="text-[14px] text-fg-sub">등록 정보가 올바르지 않아요. 처음부터 다시 시도해 주세요.</p>
          <Link href="/settings/billing" className={`${buttonClasses("primary", "md")} mt-4`}>
            요금제로 돌아가기
          </Link>
        </Card>
      )}
    </div>
  );
}
