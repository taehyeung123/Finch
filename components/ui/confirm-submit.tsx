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
          className="modal-scrim-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
            <form action={action} className="mt-5 flex justify-end gap-2">
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
