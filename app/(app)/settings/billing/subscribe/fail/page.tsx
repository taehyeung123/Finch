import Link from "next/link";
import { XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

/* 빌링 인증 실패/취소 콜백 */
export default async function SubscribeFailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const message = typeof sp.message === "string" ? sp.message : "카드 등록이 취소되었거나 처리되지 않았어요.";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="구독 등록" description="정기결제 등록 처리 결과입니다." />
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <XCircle className="size-12 text-negative" aria-hidden />
        <div>
          <p className="text-lg font-bold">카드 등록이 완료되지 않았어요</p>
          <p className="mt-1 text-[14px] text-fg-sub">{message}</p>
        </div>
        <Link href="/settings/billing" className={buttonClasses("primary", "md")}>
          요금제로 돌아가기
        </Link>
      </Card>
    </div>
  );
}
