import type { Metadata } from "next";
import { XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsShell } from "../../_components/settings-shell";

export const metadata: Metadata = {
  title: "결제 결과",
  robots: { index: false, follow: false },
};

/*
  결제 실패 콜백 — failUrl?code&message&orderId. 사용자 취소 포함.
  2026-09-03: 1회성 결제(checkout) 경로는 정기결제(subscribe)로 대체돼 링크가 없지만 콜백 URL 로는 살아 있어
  결과 페이지 틀만 다른 결과 화면(SettingsShell·p-4)과 맞췄다.
*/
export default async function BillingFailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const message = typeof sp.message === "string" ? sp.message : "결제가 취소되었거나 처리되지 않았어요.";

  return (
    <SettingsShell title="결제 결과">
      <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-4 text-center">
        <XCircle className="size-12 text-negative" aria-hidden />
        <div>
          <p className="text-[17px] font-bold">결제가 완료되지 않았어요</p>
          <p className="mt-1 break-keep text-[15px] text-fg-sub">{message}</p>
        </div>
        <ButtonLink href="/settings/billing" variant="primary" size="md">
          플랜 관리로 돌아가기
        </ButtonLink>
      </Card>
    </SettingsShell>
  );
}
