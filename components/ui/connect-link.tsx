"use client";

import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { FinchLoader } from "@/components/ui/finch-loader";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/cn";
import { euroRo } from "@/lib/josa";

/*
  밖으로 나가는 이동 중 화면 한가운데 세우는 모달 — 채널 연결(ConnectLink)·로그인 계정 연결·로그아웃이 같이 쓴다.
  껍데기를 새로 짜지 않는다(CLAUDE.md) — ModalShell 위에 로더 + «어디로 가는지» 한 문장만 얹는다.
  닫을 수 없다(busy) — 이미 떠나는 중이라 닫아 봐야 의미가 없다. 그래서 **부르는 쪽이 원복을 책임진다**:
  뒤로가기(bfcache) 복귀는 pageshow 에서, 이동이 실패하면 실패를 알리기 **전에** 이 모달부터 내린다
  (위에 남으면 busy 스크림이 결과 모달의 확인 버튼을 가린다).

  ⚠️ 포털은 여기 넣지 않는다 — ConnectLink 는 z-[60] 연동 모달(connect-channels-modal.tsx) 안에서도 쓰이는데,
  ModalShell 은 z-50 이라 body 로 빼면 그 모달 **아래로** 깔린다. 포털이 필요한 곳(쌓임 맥락 안 — 상단바·설정 행)은
  부르는 쪽이 createPortal 로 감싼다.
*/
export function LeavingModal({
  label,
  title,
  description,
}: {
  /** 접근성 이름 — «Google 연결 화면으로 이동 중» */
  label: string;
  /** 화면에 보이는 한 문장 — «Google로 이동하고 있어요» */
  title: string;
  description?: string;
}) {
  return (
    <ModalShell label={label} size="sm" busy onClose={() => {}}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <FinchLoader />
        <div className="space-y-1">
          <p className="break-keep text-[17px] font-semibold leading-snug">{title}</p>
          {description ? <p className="break-keep text-[15px] leading-relaxed text-fg-sub">{description}</p> : null}
        </div>
      </div>
    </ModalShell>
  );
}

/*
  연결하기 / 다시 연결 — OAuth 시작은 **전체 페이지 이동**이다(외부 인가 화면으로 나간다).
  그 사이 서버는 세션 확인 → 동의 확인 → 쿠키 → 리다이렉트를 거치고, 그다음 플랫폼 화면이 뜬다 — 합쳐서 1~3초.
  맨 <a> 였을 때는 그동안 화면에 아무 반응이 없어 「눌렀는데 왜 아무 일도 없지」로 읽혔다(2026-09-10 사장님 신고).

  누르는 즉시 **모달**을 띄운다 — 버튼 글자만 「이동 중…」으로 바꾸는 건 작아서 아무도 못 본다(같은 날 지시).
  뒤로가기(bfcache)로 돌아오면 pageshow 에서 원복한다.
*/
export function ConnectLink({
  href,
  variant,
  label,
  children,
}: {
  href: string;
  variant: "primary" | "secondary";
  /** 어디로 가는지 — «인스타그램», «Meta 광고» */
  label: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <>
      <a
        href={href}
        onClick={(e) => {
          /* 새 탭·새 창·다운로드로 열리는 클릭(⌘/Ctrl/Shift/Alt, target≠_self)은 **이 탭이 이동하지 않는다** —
             모달을 세우면 닫을 수 없는 busy 스크림에 원래 탭이 갇힌다(pageshow 도 안 온다). 기본 동작(새 탭)은
             그대로 둔다 — preventDefault 하지 않는다. 판정식은 next/link 의 isModifiedEvent 와 같다
             (node_modules/next/dist/client/link.js) — `button` 이 아니라 `which === 2` 를 보는 것도 그대로 따른다.
             시간이 지나면 모달을 스스로 걷는 안전판은 두지 않는다 — 되살아난 버튼을 다시 누르면 OAuth state 쿠키가
             덮여 먼저 열린 인가 화면의 콜백이 실패한다. */
          const target = e.currentTarget.getAttribute("target");
          if ((target && target !== "_self") || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.nativeEvent.which === 2) return;
          setBusy(true);
        }}
        aria-busy={busy}
        aria-disabled={busy}
        className={cn(buttonClasses(variant, "sm"), busy && "pointer-events-none opacity-60")}
      >
        {children}
      </a>
      {busy ? (
        <LeavingModal
          label={`${label} 연결 화면으로 이동 중`}
          title={`${euroRo(label)} 이동하고 있어요`}
          description={`${label} 로그인·권한 확인 화면이 열려요. 잠시만 기다려 주세요.`}
        />
      ) : null}
    </>
  );
}
