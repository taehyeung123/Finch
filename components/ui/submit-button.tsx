"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/*
  서버 액션 폼 전용 제출 버튼 — 제출 중 disabled + 진행 라벨 (2026-08-14 설정 감사 반영).
  설정·결제의 <form action={serverAction}> 버튼들이 pending 표시 없이 활성 상태로 남아
  이중 제출(결제는 이중 청구) 여지가 있던 문제의 공용 해법. <form> 내부에서만 동작한다.
*/
export function SubmitButton({
  pendingLabel,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} disabled={disabled || pending} aria-busy={pending}>
      {pending ? (pendingLabel ?? "처리 중…") : children}
    </Button>
  );
}
