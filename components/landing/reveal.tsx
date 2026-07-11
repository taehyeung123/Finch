"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/*
  스크롤 리빌 래퍼 — globals.css의 .reveal / .in-view 유틸과 짝을 이룬다.
  뷰포트에 15% 이상 들어오면 한 번만 .in-view를 붙이고 관찰을 해제한다.
  delay(초)는 --reveal-delay CSS 변수로 전달해 스태거 연출에 쓴다.
*/
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in-view");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={{ "--reveal-delay": `${delay}s` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
