"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

/*
  파괴적·금전 액션용 확인 모달 + 폼 제출 (2026-08-14 설정 감사 반영).
  '연동 해제·팀원 제거·구독 해지·즉시 결제'가 전부 원클릭 즉시 실행되던 문제의 공용 해법:
  1차 클릭은 모달만 열고, 결과를 문구로 명시한 뒤 모달 안의 확인 버튼이 실제 폼을 제출한다.
  hidden input으로 서버 액션 인자를 전달한다. 모션·토큰은 디자인 시스템 그대로.
*/
export function ConfirmSubmit({
  action,
  hiddenFields,
  title,
  description,
  confirmLabel,
  confirmVariant = "danger",
  pendingLabel,
  trigger,
  triggerVariant = "danger",
  triggerSize = "sm",
  triggerClassName,
}: {
  /** 확인 시 제출할 서버 액션 */
  action: (formData: FormData) => void | Promise<void>;
  /** 서버 액션에 넘길 hidden 필드들 */
  hiddenFields?: Record<string, string>;
  title: string;
  /** 실행 결과를 명시하는 설명 — "무엇이 일어나는지"를 반드시 담을 것 */
  description: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "primary";
  pendingLabel?: string;
  trigger: React.ReactNode;
  triggerVariant?: "danger" | "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md" | "lg";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.isComposing) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>

      {open ? (
        <div
          /* m-0! — ModalShell 과 같은 이유(세로 간격 유틸 안에 놓이면 inset-0 스크림이 위에서 모자라게 깔린다) */
          className="modal-scrim-in fixed inset-0 z-50 m-0! flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="modal-card-in shadow-pop w-full max-w-sm rounded-card border border-line bg-overlay p-5 outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[17px] font-bold leading-snug">{title}</h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-sub">{description}</p>
            {/* 무슨 일이 있어도 모달을 닫는다 — **finally 여야 한다.**
                `redirect()` 로 끝나는 서버 액션은 프라미스가 **reject 된다**(next/dist/client/components/
                router-reducer/reducers/server-action-reducer.js 의 `reject(redirectError)`). 그래서 예전의
                «await 다음 줄에서 닫기»는 그런 액션에서 **한 번도 실행되지 않았다**. 모달이 닫히는 유일한 경로가
                «에러 경계가 트리를 리마운트하는 부작용»에 얹혀 있었고, 리다이렉트 목적지가 **같은 주소**면
                (실패 → `?connect=error`, `?planError=…`, `?write=error`) 행이 그대로라 리마운트가 일어나지 않아
                모달이 「처리 중…」인 채로 굳고 오류 안내는 스크림 뒤에 숨었다(2026-09-09 사장님 신고, 12곳 공통).
                에러를 삼키지는 않는다 — 다시 던져야 리다이렉트가 프레임워크 경로 그대로 처리된다. */}
            <form
              action={async (formData) => {
                try {
                  await action(formData);
                } finally {
                  setOpen(false);
                }
              }}
              className="mt-5 flex justify-end gap-2"
            >
              {Object.entries(hiddenFields ?? {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                취소
              </Button>
              <SubmitButton
                variant={confirmVariant}
                size="sm"
                pendingLabel={pendingLabel ?? "처리 중…"}
                className={cn(confirmVariant === "danger" ? "" : undefined)}
              >
                {confirmLabel}
              </SubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
