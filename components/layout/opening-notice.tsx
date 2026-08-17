"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { FinchMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * 임시오픈 안내 모달 — 로그인 영역 전체 공통, 하루 1회 노출.
 *
 * "오늘 하루 종일 보지 않기"는 KST 기준 오늘 날짜를 localStorage에 저장한다(자정에 초기화).
 * localStorage 읽기는 서버에 없는 값이라 promo-banner.tsx와 같은 방식으로
 * useSyncExternalStore로 구독한다 — effect 내 setState 없이 hydration이 안전하다.
 * "닫기"는 저장하지 않는 세션 한정 닫힘이다 — (app) 레이아웃은 클라이언트 네비게이션 사이엔
 * 리마운트되지 않으므로 같은 방문 내에선 다시 뜨지 않고, 다음 방문(새로고침)엔 다시 노출된다.
 */

const STORAGE_KEY = "finch-opening-notice-dismissed-date";

function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) !== todayKST();
}

function dismissToday() {
  localStorage.setItem(STORAGE_KEY, todayKST());
  listeners.forEach((l) => l());
}

export function OpeningNotice() {
  const notDismissedToday = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const [closedThisSession, setClosedThisSession] = useState(false);

  if (!notDismissedToday || closedThisSession) return null;

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="임시오픈 안내"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setClosedThisSession(true);
      }}
    >
      <div className="modal-card-in shadow-pop w-full max-w-md rounded-card border border-line bg-overlay">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <span className="inline-flex items-center gap-2 font-bold">
            <FinchMark className="size-5 text-primary" />
            핀치
            <span className="rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary">
              임시오픈
            </span>
          </span>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setClosedThisSession(true)}
            className="rounded-card p-1.5 text-fg-faint hover:bg-body hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-5">
          <h2 className="text-[17px] font-bold">지금은 임시오픈 기간입니다</h2>
          <p className="text-[15px] leading-relaxed text-fg-sub">
            핀치 SNS 통합관리 플랫폼은 현재 임시오픈 상태이며, 정식 런칭은 9월 중으로 예정되어 있습니다. 그
            전까지 일부 기능은 계속 다듬어질 수 있습니다. 먼저 가입해 주셔서 감사합니다 — 정식 런칭 소식은
            가장 먼저 안내드리겠습니다.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={dismissToday}
            className="text-[14px] text-fg-sub underline-offset-2 hover:text-fg-sub hover:underline"
          >
            오늘 하루 종일 보지 않기
          </button>
          <Button variant="primary" size="sm" onClick={() => setClosedThisSession(true)}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
