"use client";

import { useEffect, useState } from "react";
import { FinchMark } from "@/components/logo";

/*
  저장·발행 시작 중 덮개 — 작성 카드 전체를 덮는다(2026-09-12 사장님 지시 «발행 눌렀을 때 로딩 화면 없이 버튼 글자만 바뀐다 —
  멈춘 줄 안다, 당장 고쳐»). 예전엔 버튼 글자만 «발행 중…»으로 바뀌고 그 아래 12px 한 줄이 전부였다.

  2026-09-12 비동기 「지금 발행」 뒤로 이 덮개가 가리는 일은 **짧다** — 글을 만들고(업로드 확인·저장) 선점하는 데까지만이다.
  메타에 올리는 일(10초~몇 분)은 서버가 응답 뒤에 이어서 하고, 작성기는 곧바로 닫혀 목록 한 줄이 «올리는 중»을 그린다.
  그래서 예전의 «N초 지남 · 이 창을 닫지 말고 기다려 주세요»와 시간별 단계 문구는 걷었다(더는 사실이 아니다).
  목록의 「지금 발행」은 덮개를 쓰지 않는다 — 누른 줄이 그 자리에서 «올리는 중»으로 바뀐다(publish-list.tsx).

  - 모양은 앱의 «기다리는 중» 표준(.collect-orbit — 로고 둘레를 도는 빛, components/ui/page-loading.tsx)과 같다.
  - «반응 기준» ②: .busy-veil-in 이 0.2초 뒤에 나타난다(그 전에 끝나면 안 뜬다).
  - 오래 걸리면(느린 회선·서버가 깨어나는 중) 8초 뒤 한 줄로 달랜다 — 모르는 진행률을 말하지 않는다.
  - 닫기·Esc 는 작성기가 이미 막는다(requestClose 가 saving 이면 무시).
*/
const SLOW_AFTER_S = 8;

export function PublishingVeil({ mode }: { mode: "now" | "schedule" | "draft" }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), SLOW_AFTER_S * 1000);
    return () => window.clearTimeout(id);
  }, []);

  const title = mode === "now" ? "발행을 시작하고 있어요" : mode === "schedule" ? "예약하고 있어요" : "초안을 저장하고 있어요";
  const stage = slow
    ? "연결이 느려요 — 조금만 더 기다려 주세요."
    : mode === "now"
      ? "곧 이 창이 닫히고, 목록에서 올라가는 모습을 볼 수 있어요."
      : "잠시만 기다려 주세요.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="busy-veil-in absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-body/90 px-6 text-center backdrop-blur-sm"
    >
      <div className="collect-orbit" aria-hidden>
        <FinchMark className="size-9 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[17px] font-semibold">{title}</p>
        <p className="break-keep text-[14px] text-fg-sub">{stage}</p>
      </div>
    </div>
  );
}
