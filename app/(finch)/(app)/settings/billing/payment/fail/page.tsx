import Link from "next/link";
import { XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

/* 카드 변경 — 빌링 인증 실패/취소 콜백. 이전 카드는 그대로다 */
export default async function CardChangeFailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const message = typeof sp.message === "string" ? sp.message : "카드 등록이 취소되었거나 처리되지 않았어요.";

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <PageHeader title="결제 카드 변경" description="새 카드 등록 처리 결과입니다." />
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <XCircle className="size-12 text-negative" aria-hidden />
        <div>
          <p className="text-[17px] font-bold">카드를 바꾸지 못했어요</p>
          <p className="mt-1 text-[15px] text-fg-sub">{message} 이전 카드는 그대로 유지돼요.</p>
        </div>
        <Link href="/settings/billing/payment" className={buttonClasses("primary", "md")}>
          결제수단으로 돌아가기
        </Link>
      </Card>
    </div>
  );
}
