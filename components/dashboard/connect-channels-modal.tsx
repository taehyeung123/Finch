"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { trapFocus } from "@/components/ui/trap-focus";
import { AppIconTile } from "@/components/icons/brand";
import { Button } from "@/components/ui/button";
import { ConnectLink } from "@/components/ui/connect-link";
import { CHANNEL_LABEL } from "@/lib/channels";
import type { Channel } from "@/lib/types";

/**
 * 채널 연동 가이드 모달 — 채널이 하나도 연동 안 된 실 모드 사용자에게 대시보드에서 1회 안내.
 *
 * 온보딩 마법사에서 연동 단계를 뺀 자리다(2026-09-02 사장님 지시):
 * 가입 절차 안에서 외부 OAuth 로 나가는 것보다, 로그인된 상태에서
 * «무엇이 필요한지» 가이드와 함께 여는 편이 맞다.
 *
 * 노출 규칙: 서버가 «실 모드 + 연동 0개»일 때만 렌더를 지시하고,
 * «다음에 할게요»는 localStorage 에 영구 저장 — 같은 안내가 매 방문 뜨면 잔소리다.
 * 대시보드 상단의 미연동 배너가 상시 리마인더로 남아 있으므로 잃는 것이 없다.
 * localStorage 는 OpeningNotice 와 같은 useSyncExternalStore 패턴(hydration 안전).
 */

const STORAGE_KEY = "finch-connect-guide-dismissed";

let listeners: Array<() => void> = [];
function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}
function dismissForever() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* 저장 못 해도 이번 세션 닫힘은 상태로 처리된다 */
  }
  listeners.forEach((l) => l());
}

/** 채널별 연동 시작 라우트 + 시작 전에 알아야 하는 것 */
const GUIDES: { channel: Channel; startHref: string; note: string }[] = [
  {
    channel: "instagram",
    startHref: "/api/auth/instagram/start",
    note: "비즈니스·크리에이터 계정만 연동돼요. 개인 계정은 인스타그램 앱 > 설정 > 계정 유형 및 도구에서 전환한 뒤 진행해 주세요.",
  },
  {
    channel: "threads",
    startHref: "/api/auth/threads/start",
    note: "인스타그램과 연결된 스레드 프로필로 로그인하면 바로 연동돼요.",
  },
  {
    channel: "tiktok",
    startHref: "/api/auth/tiktok/start",
    note: "틱톡 계정으로 로그인하면 팔로워·좋아요 등 기본 지표를 볼 수 있어요.",
  },
];

/**
 * openChannels — 지금 실제로 연결을 받을 수 있는 채널(서버가 판정해 내려준다, lib/channel-availability.ts).
 * 이 목록에 없는 채널은 여기서도 권하지 않는다 — 설정 화면은 「준비 중」인데 이 모달만 「연동하기」를 권하면
 * 고객이 플랫폼 화면까지 갔다가 막힌다(2026-09-06 적발: 이 모달만 준비 상태를 안 보고 있었다).
 */
export function ConnectChannelsModal({ openChannels }: { openChannels: Channel[] }) {
  const notDismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const [closedThisSession, setClosedThisSession] = useState(false);
  const guides = GUIDES.filter((g) => openChannels.includes(g.channel));
  /* 권할 채널이 하나도 없으면 모달 자체를 띄우지 않는다 — 아무것도 못 하는 창을 닫게 만들 이유가 없다 */
  const open = notDismissed && !closedThisSession && guides.length > 0;
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosedThisSession(true);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="채널 연동 안내"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setClosedThisSession(true);
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        onKeyDown={(e) => trapFocus(boxRef.current, e)}
        className="modal-card-in shadow-pop w-full max-w-md rounded-card border border-line bg-overlay outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[17px] font-bold">채널을 연동해 볼까요?</h2>
            <p className="mt-0.5 text-[14px] text-fg-sub">
              연동하면 지표가 실제 데이터로 채워져요 — 언제든 설정에서 해제할 수 있어요.
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setClosedThisSession(true)}
            className="relative rounded-card p-1.5 text-fg-faint after:absolute after:-inset-1 after:content-[''] hover:bg-tint-hover hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {guides.map(({ channel, startHref, note }) => (
            <div key={channel} className="rounded-card border border-line p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <AppIconTile app={channel} size={34} />
                  <span className="text-[15px] font-semibold">{CHANNEL_LABEL[channel]}</span>
                </div>
                {/* API 라우트다 — 서버가 OAuth 로 302 를 쏜다. next/link 는 리다이렉트를 삼킨다.
                    설정 화면과 같은 ConnectLink — 누르는 즉시 「○○으로 이동하고 있어요」 모달(맨 <a> 는 1~3초 무반응이었다). */}
                <ConnectLink href={startHref} variant="secondary" label={CHANNEL_LABEL[channel]}>
                  연동하기
                </ConnectLink>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-fg-sub">{note}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={dismissForever}
            className="cursor-pointer text-[14px] text-fg-sub underline-offset-2 hover:underline"
          >
            다음에 할게요
          </button>
          <Button variant="primary" size="sm" onClick={() => setClosedThisSession(true)}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
