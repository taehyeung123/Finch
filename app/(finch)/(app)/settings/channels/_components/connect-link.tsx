"use client";

import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/*
  연결하기 / 다시 연결 — OAuth 시작은 **전체 페이지 이동**이다(외부 인가 화면으로 나간다).
  그 사이 서버는 세션 확인 → 동의 확인 → 쿠키 → 리다이렉트를 거치고, 그다음 플랫폼 화면이 뜬다 — 합쳐서 1~3초.
  맨 <a> 였을 때는 그동안 화면에 아무 반응이 없어 「눌렀는데 왜 아무 일도 없지」로 읽혔다(2026-09-10 사장님 신고).
  누르는 즉시 「이동 중…」으로 바꾸고 두 번 눌리지 않게 한다. 뒤로가기(bfcache)로 돌아오면 원래대로.
*/
export function ConnectLink({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    /* 인가 화면에서 뒤로가기로 돌아오면 페이지가 캐시에서 복원돼 busy 가 남는다 — pageshow 에서 푼다 */
    const reset = () => setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <a
      href={href}
      onClick={() => setBusy(true)}
      aria-busy={busy}
      aria-disabled={busy}
      className={cn(buttonClasses(variant, "sm"), busy && "pointer-events-none opacity-60")}
    >
      {busy ? "이동 중…" : children}
    </a>
  );
}
