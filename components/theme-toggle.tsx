"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { toggleTheme, useTheme } from "@/lib/theme";

/** 라이트/다크 전환 버튼 — 상단바·마케팅 헤더 공용 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={cn(
        "flex size-9 items-center justify-center rounded-card text-fg-sub transition-colors hover:bg-overlay hover:text-fg",
        className,
      )}
    >
      {isDark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
