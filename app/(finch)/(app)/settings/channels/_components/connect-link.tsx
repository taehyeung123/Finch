"use client";

import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { FinchLoader } from "@/components/ui/finch-loader";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/cn";
import { euroRo } from "@/lib/josa";

/*
  연결하기 / 다시 연결 — OAuth 시작은 **전체 페이지 이동**이다(외부 인가 화면으로 나간다).
  그 사이 서버는 세션 확인 → 동의 확인 → 쿠키 → 리다이렉트를 거치고, 그다음 플랫폼 화면이 뜬다 — 합쳐서 1~3초.
  맨 <a> 였을 때는 그동안 화면에 아무 반응이 없어 「눌렀는데 왜 아무 일도 없지」로 읽혔다(2026-09-10 사장님 신고).

  누르는 즉시 **모달**을 띄운다 — 버튼 글자만 「이동 중…」으로 바꾸는 건 작아서 아무도 못 본다(같은 날 지시).
  화면 한가운데 로더 + «어디로 가는지» 한 문장. 닫을 수 없다(busy) — 이미 떠나는 중이라 닫아 봐야 의미가 없다.
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
        onClick={() => setBusy(true)}
        aria-busy={busy}
        aria-disabled={busy}
        className={cn(buttonClasses(variant, "sm"), busy && "pointer-events-none opacity-60")}
      >
        {children}
      </a>
      {busy ? (
        <ModalShell label={`${label} 연결 화면으로 이동 중`} size="sm" busy onClose={() => {}}>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <FinchLoader />
            <div className="space-y-1">
              <p className="break-keep text-[17px] font-semibold leading-snug">{euroRo(label)} 이동하고 있어요</p>
              <p className="break-keep text-[15px] leading-relaxed text-fg-sub">
                {label} 로그인·권한 확인 화면이 열려요. 잠시만 기다려 주세요.
              </p>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
