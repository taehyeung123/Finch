"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/*
  모바일 하단 고정 CTA (2026-08-29 사장님 지시 — 벤치마크 대조).

  왜 필요한가: 랜딩이 9000px 이 넘는다. 히어로의 「무료로 시작하기」를 지나치면
  맨 아래 CTA 까지 가입 버튼이 **한 번도 안 보인다** — 설득이 되는 순간에 누를 것이 없다.
  좋은 이벤트/제품 랜딩은 예외 없이 하단에 버튼을 붙여 둔다.

  히어로 안에서는 뜨지 않는다(같은 버튼이 화면에 둘이면 소음이다).
  맨 아래 CTA 섹션에 닿으면 다시 숨는다 — 그 자리엔 이미 큰 버튼이 있다.
*/
export function StickyCta({ label = "무료로 시작하기", href = "/signup" }: { label?: string; href?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const bottomZone = document.body.scrollHeight - window.innerHeight - 900;
      setShow(y > 560 && y < bottomZone);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      /* 안전영역(홈 인디케이터)까지 밀어 준다 — 아이폰에서 버튼이 바 밑으로 깔린다 */
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-body/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur transition-[transform,opacity] duration-300 ease-out md:hidden ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
      aria-hidden={!show}
    >
      <Link
        href={href}
        tabIndex={show ? undefined : -1}
        className="flex h-12 w-full items-center justify-center rounded-card bg-primary text-[16px] font-bold text-on-primary"
      >
        {label}
      </Link>
    </div>
  );
}
