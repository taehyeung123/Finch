"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

/*
  테마 설정 — 상단 바 토글은 "지금 바꾸기"고, 여기는 "내 기본값이 무엇인가"다.
  둘 다 같은 lib/theme 을 쓰므로 상태가 갈리지 않는다(useSyncExternalStore).

  "시스템 설정 따름"은 넣지 않았다. lib/theme 이 <html data-theme> 유무로 라이트/다크
  두 상태만 관리하고 globals.css 에 prefers-color-scheme 분기가 없다 — 여기에 3번째
  선택지를 그리면 고를 수는 있는데 아무 일도 안 일어난다. 그건 지금까지 걷어낸
  허위 표기와 같은 종류다. 시스템 연동은 CSS 분기를 먼저 넣고 열 것.
*/
const OPTIONS: Array<{ key: Theme; label: string; icon: typeof Sun; hint: string }> = [
  { key: "light", label: "라이트", icon: Sun, hint: "밝은 화면" },
  { key: "dark", label: "다크", icon: Moon, hint: "어두운 화면" },
];

export function ThemeChoice() {
  const theme = useTheme();

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="테마">
        {OPTIONS.map((o) => {
          const on = theme === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTheme(o.key)}
              className={cn(
                "trans-state flex min-w-[8.5rem] items-center gap-2.5 rounded-card border px-3.5 py-2.5 text-left",
                on ? "border-primary bg-primary-weak" : "border-line hover:bg-tint-hover",
              )}
            >
              <o.icon className={cn("size-4 shrink-0", on ? "text-primary-ink" : "text-fg-sub")} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{o.label}</span>
                <span className="block text-[12px] text-fg-sub">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-fg-sub">
        <Monitor className="size-3.5 shrink-0" aria-hidden />
        이 브라우저에만 저장돼요. 다른 기기에서는 따로 설정해 주세요.
      </p>
    </div>
  );
}
