import { XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingsShell } from "../../../_components/settings-shell";

/* 빌링 인증 실패/취소 콜백 */
export default async function SubscribeFailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const message = typeof sp.message === "string" ? sp.message : "카드 등록이 취소되었거나 처리되지 않았어요.";

  return (
    <SettingsShell title="구독 등록">
      <Card className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 p-8 text-center">
        <XCircle className="size-12 text-negative" aria-hidden />
        <div>
          <p className="text-[17px] font-semibold">카드 등록이 완료되지 않았어요</p>
          <p className="mt-1 break-keep text-[15px] text-fg-sub">{message}</p>
        </div>
        <ButtonLink href="/settings/billing" variant="primary" size="md">
          플랜 관리로 돌아가기
        </ButtonLink>
      </Card>
    </SettingsShell>
  );
}
