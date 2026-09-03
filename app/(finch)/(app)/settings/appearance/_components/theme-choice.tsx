"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { ChoiceTile } from "@/components/ui/choice-tile";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

/*
  테마 설정 — 상단 바 토글은 "지금 바꾸기"고, 여기는 "내 기본값이 무엇인가"다. 둘 다 lib/theme 을 쓴다(useSyncExternalStore).
  "시스템 설정 따름"은 넣지 않았다 — lib/theme 이 두 상태만 관리하고 globals.css 에 prefers-color-scheme 분기가 없다.
  고를 수는 있는데 아무 일도 안 일어나는 선택지는 허위 표기다. 시스템 연동은 CSS 분기를 먼저 넣고 열 것.
  2026-09-03: 선택 타일(ChoiceTile, 네이티브 라디오)로 — 화살표 이동·그룹당 탭 1회가 공짜다.
*/
const OPTIONS: Array<{ key: Theme; label: string; icon: typeof Sun; hint: string }> = [
  { key: "light", label: "라이트", icon: Sun, hint: "밝은 화면 — 낮에 또렷해요" },
  { key: "dark", label: "다크", icon: Moon, hint: "어두운 화면 — 밤에 눈이 편해요" },
];

export function ThemeChoice() {
  const theme = useTheme();
  return (
    <div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">화면 테마</legend>
        {OPTIONS.map((o) => (
          <ChoiceTile key={o.key} name="theme" value={o.key} checked={theme === o.key} onChange={() => setTheme(o.key)} title={o.label} hint={o.hint} icon={o.icon} />
        ))}
      </fieldset>
      <p className="mt-3 flex items-start gap-1.5 text-[14px] text-fg-sub">
        <Monitor className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>이 브라우저에만 저장돼요. 다른 기기나 브라우저에서는 따로 골라 주세요.</span>
      </p>
    </div>
  );
}
