"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { trapFocus } from "@/components/ui/trap-focus";

/*
  모달 껍데기 — 스크림 · 카드 · 포커스 트랩 · Escape · 닫힌 뒤 포커스 복원.
  프로필 링크 편집기의 블록 카탈로그·페이지 설정 모달이 쓴다(링크팜·리틀리 모두 "목록을 대체"가 아니라 "모달"이다).
  `busy` 동안은 어떤 경로로도 닫지 않는다 — 닫힌 줄 알았던 작업이 뒤에서 계속 돌면 안 된다.
*/
export function ModalShell({
  label,
  title,
  description,
  onClose,
  busy = false,
  size = "md",
  children,
  footer,
}: {
  label: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        /* 중첩 모달(예약 공개 안 날짜 픽커 등) — Esc 한 번에 둘 다 닫히면 바깥 모달의
           입력이 증발한다. DOM 상 마지막 dialog(=맨 위)만 닫는다(2026-08-27). */
        const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
        if (dialogs.length > 1 && dialogs[dialogs.length - 1] !== boxRef.current?.parentElement) return;
        /* X·스크림 클릭과 달리 Esc 는 blur 없이 언마운트돼 onBlur 커밋(설정 텍스트 등)이
           증발한다 — 닫기 전에 포커스를 떼어 같은 경로를 태운다(감사4) */
        (document.activeElement as HTMLElement | null)?.blur?.();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        onKeyDown={(e) => trapFocus(boxRef.current, e)}
        className={cn(
          "modal-card-in shadow-pop flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-card border border-line bg-overlay outline-none sm:max-h-[calc(100dvh-4rem)]",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-4xl",
        )}
      >
        {title ? (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h3 className="text-[17px] font-semibold">{title}</h3>
              {description ? <p className="mt-0.5 text-[14px] text-fg-sub">{description}</p> : null}
            </div>
            <button
              type="button"
              aria-label="닫기"
              disabled={busy}
              onClick={onClose}
              className="trans-state -mr-1.5 -mt-1 rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
