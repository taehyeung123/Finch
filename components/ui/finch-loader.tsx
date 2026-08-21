import { FinchMark } from "@/components/logo";
import { cn } from "@/lib/cn";

/**
 * 핀치 로더 — 로고 주위로 빛이 도는 로딩 표시(2026-08-20 지시).
 * 범용 스피너 대신 이걸 쓴다: 기다리는 동안에도 핀치 화면이라는 감각이 유지된다.
 * 링은 conic 그라데이션 두 겹(안쪽 선명·바깥 흐림)을 회전시킨다 — 색은 브랜드 토큰.
 */
export function FinchLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative size-20">
        {/* 바깥 흐린 빛 — 링보다 조금 크게 번진다 */}
        <span
          aria-hidden
          className="absolute -inset-1 animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0%,var(--color-primary)_30%,transparent_55%)] opacity-70 blur-[9px]"
          style={{ animationDuration: "1.4s" }}
        />
        <span
          aria-hidden
          className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0%,var(--color-primary)_35%,transparent_60%)]"
          style={{ animationDuration: "1.4s" }}
        />
        <span className="absolute inset-[3px] flex items-center justify-center rounded-full bg-body">
          <FinchMark className="size-10 text-primary" />
        </span>
      </div>
      {label ? <p className="text-[14px] text-fg-sub">{label}</p> : <span className="sr-only">불러오는 중</span>}
    </div>
  );
}
