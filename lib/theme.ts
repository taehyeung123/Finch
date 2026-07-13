"use client";

import { useSyncExternalStore } from "react";

/*
  테마 전환 — 화이트(라이트)가 기본, 다크는 토글.
  실제 색 값은 globals.css의 :root / :root[data-theme="dark"]가 담당하고,
  여기서는 <html data-theme> 속성과 localStorage만 관리한다.
  FOUC 방지 초기화는 app/layout.tsx의 inline script가 렌더 전에 처리한다.
*/

export type Theme = "light" | "dark";
const STORAGE_KEY = "finch-theme";

let listeners: Array<() => void> = [];

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 프라이빗 모드 등에서 localStorage 접근 실패해도 전환 자체는 동작 */
  }
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** 현재 테마 구독 — 서버 스냅숏은 항상 "light"(기본)라 hydration 안전 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}
