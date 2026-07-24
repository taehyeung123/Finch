import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { FinchLogo } from "@/components/logo";

/*
  Threads 데이터 삭제 요청 상태 확인 페이지 (공개, 로그인 불필요).
  app/api/auth/threads/data-deletion/route.ts가 반환하는 confirmation url이 여기로 연결된다.
  Meta가 요구하는 "사용자가 삭제 상태를 확인할 수 있는 공개 페이지" 요건 — 삭제는 콜백 처리
  시점에 이미 동기로 끝나므로, 이 페이지는 확인 코드와 함께 완료 상태만 보여준다.
*/

export const metadata: Metadata = {
  title: "데이터 삭제 처리 확인 — 핀치",
  robots: { index: false, follow: false },
};

export default async function ThreadsDataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <FinchLogo />
      <CheckCircle2 className="size-10 text-positive" aria-hidden />
      <h1 className="text-xl font-bold">데이터 삭제가 완료되었어요</h1>
      <p className="text-[14px] leading-relaxed text-fg-sub">
        Threads 연동 해제에 따라 핀치에 저장돼 있던 관련 계정 정보(액세스 토큰 포함)가 삭제되었습니다.
      </p>
      {id ? <p className="text-[12px] text-fg-faint">확인 코드: {id}</p> : null}
    </div>
  );
}
