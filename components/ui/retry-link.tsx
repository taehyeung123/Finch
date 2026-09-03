"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/*
  «새로고침» 텍스트 링크 — 조회 실패 안내 띠(NoticeBar)의 오른쪽에 붙는다.
  전체 페이지 이동(<a href>)이 아니라 router.refresh() 로 서버 컴포넌트만 다시 읽는다 —
  스크롤·입력 상태를 잃지 않고, next/link 린트(no-html-link-for-pages)에도 걸리지 않는다.
*/
export function RetryLink({ children = "새로고침", className }: { children?: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className={cn(
        "relative cursor-pointer rounded-card font-semibold underline underline-offset-2 after:absolute after:-inset-2 after:content-[''] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        className,
      )}
    >
      {children}
    </button>
  );
}
