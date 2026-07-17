import Link from "next/link";
import { XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

/*
  결제 실패 콜백 — failUrl?code&message&orderId. 사용자 취소 포함.
*/
export default async function BillingFailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const message = typeof sp.message === "string" ? sp.message : "결제가 취소되었거나 처리되지 않았어요.";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="결제 결과" description="요금제 결제 처리 결과입니다." />
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <XCircle className="size-12 text-negative" aria-hidden />
        <div>
          <p className="text-lg font-bold">결제가 완료되지 않았어요</p>
          <p className="mt-1 text-[14px] text-fg-sub">{message}</p>
        </div>
        <Link href="/settings/billing" className={buttonClasses("primary", "md")}>
          요금제로 돌아가기
        </Link>
      </Card>
    </div>
  );
}
