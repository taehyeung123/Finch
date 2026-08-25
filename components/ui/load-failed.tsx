"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Button } from "./button";

/*
  «불러오지 못했어요» — 조회가 **실패**했을 때의 화면.

  EmptyState 와 생김새는 같지만 뜻이 정반대다. 빈 상태는 "아직 만든 게 없다"는 사실이고,
  이건 "있는지 없는지 우리가 모른다"는 고백이다. 예전엔 조회 실패도 빈 상태로 그려서,
  결제한 고객이 「결제 내역이 없습니다」를, 리포트를 만든 사람이 「리포트가 없습니다」를 봤다.
  실패는 서버 로그에만 남고 화면은 거짓말을 했다.

  서버 컴포넌트에서 쓰려고 클라이언트로 분리해 둔다 — 「다시 시도」가 router.refresh() 를 쓴다.
  (links 편집기가 쓰던 같은 모양을 컴포넌트로 뽑은 것이다.)
*/
export function LoadFailed({
  title,
  description = "서버와 잠시 연결이 끊겼어요. 자료는 그대로 있으니 다시 시도해 주세요.",
}: {
  title: string;
  description?: string;
}) {
  const router = useRouter();
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={description}
      action={
        <Button variant="secondary" onClick={() => router.refresh()}>
          다시 시도
        </Button>
      }
    />
  );
}
