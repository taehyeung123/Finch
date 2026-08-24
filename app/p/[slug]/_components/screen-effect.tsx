"use client";

import { useEffect, useRef } from "react";

/*
  화면 효과 — 리틀리 「화면 효과(confetti)」 카피(디자인 탭 보완). 캔버스 하나에 가벼운 입자.
  · confetti: 들어올 때 한 번 2.8초
  · snow / sparkle: 계속(입자 수 적게, 탭이 숨겨지면 멈춤)
  pointer-events:none — 어떤 버튼도 가리지 않는다. prefers-reduced-motion 이면 아무것도 안 그린다.
*/
export function ScreenEffect({ kind, light = false }: { kind: "confetti" | "snow" | "sparkle"; light?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let alive = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    const colors = ["#FF6B4A", "#FFD84C", "#4881F7", "#2DC26B", "#F368E0", "#FFFFFF"];
    const n = kind === "confetti" ? 120 : kind === "snow" ? 60 : 40;
    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; a: number; t: number; rot: number; vr: number };
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const spawn = (initial: boolean): P => ({
      x: rnd(0, canvas.width),
      y: kind === "confetti" ? rnd(-canvas.height * 0.3, 0) : initial ? rnd(0, canvas.height) : -10 * dpr,
      vx: kind === "confetti" ? rnd(-0.6, 0.6) * dpr : rnd(-0.25, 0.25) * dpr,
      vy: kind === "confetti" ? rnd(2.2, 4.2) * dpr : kind === "snow" ? rnd(0.4, 1.1) * dpr : 0,
      r: (kind === "confetti" ? rnd(3, 6) : kind === "snow" ? rnd(1.5, 3.5) : rnd(1, 2.5)) * dpr,
      /* 눈은 배경 밝기에 따라 색을 고른다 — 순백 고정이면 밝은 프리셋 15종에서 사실상 투명이었다(감사4) */
      c: kind === "snow" ? (light ? "#64748B" : "#FFFFFF") : colors[Math.floor(Math.random() * colors.length)],
      a: kind === "sparkle" ? rnd(0, Math.PI * 2) : 1,
      t: rnd(0, 1000),
      rot: rnd(0, Math.PI),
      vr: rnd(-0.08, 0.08),
    });
    let ps: P[] = Array.from({ length: n }, () => spawn(true));
    const start = performance.now();
    const tick = (now: number) => {
      if (!alive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const elapsed = now - start;
      if (kind === "confetti" && elapsed > 2800) {
        ps = ps.filter((p) => p.y < canvas.height + 20);
        if (ps.length === 0) return;
      }
      for (const p of ps) {
        p.x += p.vx + (kind === "snow" ? Math.sin((now + p.t) / 900) * 0.3 * dpr : 0);
        p.y += p.vy;
        p.rot += p.vr;
        if (kind !== "confetti" && p.y > canvas.height + 10) Object.assign(p, spawn(false));
        if (kind === "sparkle") {
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(now / 600 + p.a));
          ctx.globalAlpha = tw;
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * tw, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (kind === "snow") {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [kind, light]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-30 h-full w-full" />;
}
