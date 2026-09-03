import Link from "next/link";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { CardIssueClient } from "./_components/card-issue-client";

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
    <div className="mx-auto w-full max-w-lg space-y-6">
      <PageHeader title="결제 카드 변경" description="새 카드 등록 처리 결과입니다." />
      {authKey && customerKey ? (
        <CardIssueClient authKey={authKey} customerKey={customerKey} />
      ) : (
        <Card className="p-8 text-center">
          <p className="text-[15px] text-fg-sub">등록 정보가 올바르지 않아요. 처음부터 다시 시도해 주세요.</p>
          <Link href="/settings/billing/payment" className={`${buttonClasses("primary", "md")} mt-4`}>
            결제수단으로 돌아가기
          </Link>
        </Card>
      )}
    </div>
  );
}
