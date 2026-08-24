import { FinchMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <FinchMark className="size-12 text-primary" />
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="max-w-sm text-[15px] text-fg-sub">
        주소가 바뀌었거나 삭제된 페이지예요. 홈으로 돌아가 다시 시도해주세요.
      </p>
      <div className="mt-2 flex gap-2">
        <ButtonLink href="/">홈으로</ButtonLink>
        <ButtonLink href="/dashboard" variant="secondary">
          대시보드
        </ButtonLink>
      </div>
    </div>
  );
}
