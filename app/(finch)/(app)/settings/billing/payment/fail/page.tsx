import type { Metadata } from "next";
import { XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsShell } from "../../../_components/settings-shell";

export const metadata: Metadata = {
  title: "결제 카드 변경",
  robots: { index: false, follow: false },
};

/* 카드 변경 — 빌링 인증 실패/취소 콜백. 이전 카드는 그대로다 */
export default async function CardChangeFailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const message = typeof sp.message === "string" ? sp.message : "카드 등록이 취소되었거나 처리되지 않았어요.";

  return (
    <SettingsShell title="결제 카드 변경">
      <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-4 text-center">
        <XCircle className="size-12 text-negative" aria-hidden />
        <div>
          <p className="text-[17px] font-semibold">카드를 바꾸지 못했어요</p>
          <p className="mt-1 break-keep text-[15px] text-fg-sub">{message} 이전 카드는 그대로 유지돼요.</p>
        </div>
        <ButtonLink href="/settings/billing/payment" variant="primary" size="md">
          결제수단으로 돌아가기
        </ButtonLink>
      </Card>
    </SettingsShell>
  );
}
