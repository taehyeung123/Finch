"use client";

import { useEffect, useEffectEvent } from "react";
import { X } from "lucide-react";
import { NOTICE_ICON, NOTICE_ICON_COLOR, type NoticeTone } from "@/components/ui/notice-bar";
import { cn } from "@/lib/cn";

/*
  토스트 — 화면을 막지 않는 짧은 알림 (2026-09-12 발행 화면에서 공용으로 꺼냄).

  모양은 이 저장소에 이미 있는 토스트(레퍼런스 라이브러리·프로필 링크 편집기)와 같다 — .toast-pop(globals.css)으로
  나타나고(--dur-2, 모션 축소면 이동 없이), 흐름 밖(fixed)이라 목록을 밀지 않는다. 톤 ↔ 아이콘·잉크는 결과 모달과 같은 한 벌
  (notice-bar.tsx NOTICE_ICON)을 읽는다.

  결과 모달(result-modal.tsx)과 나눠 쓰는 기준:
   · 모달 — 누른 사람이 **지금 확인해야 하는** 결과(연동·해제, 저장이 막힘, 누른 조작이 거절됨).
   · 토스트 — 일이 **뒤에서 이어지는** 동안의 안내(«올리기 시작했어요»)와, 화면에 있는 동안 뒤에서 끝난 일의 짧은 소식.
     목록 한 줄이 이미 결과(«발행 완료»·실패 이유)를 그리고 있고 알림도 따로 간다 — 가운데를 막을 이유가 없다.

  · 성공·안내는 autoHideMs 뒤 스스로 내려간다. 실패(negative)는 사람이 닫을 때까지 남는다(읽기 전에 사라지면 안 된다).
  · 모바일은 하단 탭바(z-40, 약 58px + safe-area) 위로 띄운다. z-[60] — 모달(z-50) 스크림 뒤에 숨지 않는다.
    대신 **모달이 떠 있는 동안은 부모가 toast 를 null 로 넘겨 미룬다** — 바닥에 붙는 모바일 모달의 버튼을 가리지 않게(발행 목록이 그렇게 쓴다).
  · 알림 영역(aria-live)은 늘 그려 둔다 — 내용이 들어올 때 읽히려면 영역이 먼저 있어야 한다.
*/
export interface ToastContent {
  tone: NoticeTone;
  /** 한 문장 — 마침표 없이 */
  title: string;
  description?: string | null;
}

export function Toast({
  toast,
  onClose,
  autoHideMs = 6000,
}: {
  toast: ToastContent | null;
  onClose: () => void;
  /** 성공·안내가 스스로 내려가는 시간. 실패는 스스로 내려가지 않는다 */
  autoHideMs?: number;
}) {
  /* 새 내용이 들어올 때만 타이머를 다시 돈다(같은 객체면 그대로). onClose 는 부모가 렌더마다 새로 만들 수 있어 의존성에 넣지 않는다 —
     넣으면 부모가 몇 초마다 다시 그려질 때(발행 목록의 진행 상황 조회) 타이머가 계속 처음부터 돌아 영영 안 내려간다 */
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!toast || toast.tone === "negative") return;
    const t = window.setTimeout(() => close(), autoHideMs);
    return () => window.clearTimeout(t);
  }, [toast, autoHideMs]);

  const Icon = toast ? NOTICE_ICON[toast.tone] : null;
  return (
    <div
      aria-live={toast?.tone === "negative" ? "assertive" : "polite"}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] m-0! flex justify-center px-4 md:bottom-6"
    >
      <div
        data-open={toast ? "true" : "false"}
        role={toast?.tone === "negative" ? "alert" : "status"}
        className={cn(
          "toast-pop shadow-pop pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-card border bg-overlay py-3 pl-4 pr-2",
          toast?.tone === "negative" ? "border-negative/40" : toast?.tone === "warning" ? "border-warning/40" : "border-line-strong",
        )}
      >
        {toast && Icon ? (
          <>
            <Icon className={cn("mt-0.5 size-4 shrink-0", NOTICE_ICON_COLOR[toast.tone])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="break-keep text-[14px] font-semibold leading-snug text-fg">{toast.title}</p>
              {toast.description ? <p className="mt-0.5 break-keep text-[14px] leading-relaxed text-fg-sub">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="알림 닫기"
              title="닫기"
              className="trans-state relative -my-1 flex size-8 shrink-0 items-center justify-center rounded-card text-fg-sub after:absolute after:-inset-0.5 after:content-[''] hover:bg-tint-hover hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
