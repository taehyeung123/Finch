"use client";

import { useEffect, useRef, useState } from "react";
import { FinchMark } from "@/components/logo";
import { channelLabel } from "@/lib/publish-rules";
import { iGa } from "@/lib/josa";

/*
  발행·저장 중 덮개 — 작성 카드 전체를 덮는다(2026-09-12 사장님 지시 «발행 눌렀을 때 로딩 화면 없이 버튼 글자만 바뀐다 —
  멈춘 줄 안다, 당장 고쳐»). 예전엔 버튼 글자만 «발행 중…»으로 바뀌고 그 아래 12px 한 줄이 전부였다.
  메타가 게시물을 받는 데 10~30초, 캐러셀·영상은 1분 가까이 걸리는데 그동안 화면에서 움직이는 것이 하나도 없었다.

  - 모양은 앱의 «기다리는 중» 표준(.collect-orbit — 로고 둘레를 도는 빛, components/ui/page-loading.tsx)과 같다.
  - «반응 기준» ②: .busy-veil-in 이 0.2초 뒤에 나타난다(그 전에 끝나면 안 뜬다). 발행은 늘 그보다 길다.
  - 살아 있다는 신호: 지난 초를 센다. 단계 문구는 **시간으로만** 바꾼다 — 서버가 진행률을 주지 않으므로
    «몇 % 됐다»처럼 모르는 것을 말하지 않고, 기다리는 사람이 할 법한 질문(«아직이야?»)에 답하는 말만 한다.
  - 닫기·Esc 는 작성기가 이미 막는다(requestClose 가 saving 이면 무시).
*/
export function PublishingVeil({
  channel,
  mode,
  hasMedia,
  hasVideo,
  layout = "card",
}: {
  channel: string;
  mode: "now" | "schedule" | "draft";
  hasMedia: boolean;
  hasVideo: boolean;
  /** card = 작성 카드 안을 덮는다(부모가 relative) · screen = 화면 가운데 창(목록의 「지금 발행」) */
  layout?: "card" | "screen";
}) {
  const [sec, setSec] = useState(0);
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setSec(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  /* 화면 덮개는 마우스뿐 아니라 **키보드도** 막아야 한다 — 포커스를 덮개로 옮기고 Tab 을 붙잡는다.
     안 그러면 Tab 으로 덮개 뒤 버튼(«새 게시물 포스팅» 등)에 닿아, 발행이 도는 중에 다른 작업을 시작할 수 있었다(소넷 점검).
     끝나면 원래 자리로 포커스를 돌려준다. */
  useEffect(() => {
    if (layout !== "screen") return;
    const prev = document.activeElement as HTMLElement | null;
    screenRef.current?.focus();
    return () => prev?.focus?.();
  }, [layout]);

  const label = channelLabel(channel);
  const title =
    mode === "now" ? `${label}에 올리고 있어요` : mode === "schedule" ? "예약하고 있어요" : "초안을 저장하고 있어요";

  let stage: string;
  if (mode !== "now") {
    stage = "잠시만 기다려 주세요.";
  } else if (sec < 6) {
    stage = hasMedia ? "사진·영상을 보내는 중이에요." : "글을 보내는 중이에요.";
  } else if (sec < 25) {
    stage = `${iGa(label)} 게시물을 확인하고 있어요.`;
  } else if (hasVideo) {
    stage = "영상은 처리가 길어질 수 있어요. 오래 걸리면 자동으로 이어서 올리고 알려 드려요.";
  } else {
    stage = "거의 다 됐어요. 조금만 더 기다려 주세요.";
  }

  const body = (
    <>
      <div className="collect-orbit" aria-hidden>
        <FinchMark className="size-9 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[17px] font-semibold">{title}</p>
        <p className="text-[14px] text-fg-sub">{stage}</p>
      </div>
      {mode === "now" ? (
        <p className="tnum text-[12px] text-fg-sub">
          {sec}초 지남 · 이 창을 닫지 말고 기다려 주세요
        </p>
      ) : null}
    </>
  );

  if (layout === "screen") {
    return (
      <div
        ref={screenRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        onKeyDown={(e) => {
          if (e.key === "Tab") e.preventDefault();
        }}
        className="busy-veil-in fixed inset-0 z-50 m-0! flex items-center justify-center bg-black/40 p-4 outline-none"
      >
        <div className="shadow-pop flex w-full max-w-sm flex-col items-center gap-5 rounded-card border border-line bg-overlay px-6 py-8 text-center">
          {body}
        </div>
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="busy-veil-in absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-body/90 px-6 text-center backdrop-blur-sm"
    >
      {body}
    </div>
  );
}
