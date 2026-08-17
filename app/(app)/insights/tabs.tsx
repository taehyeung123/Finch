import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * 성과 분석 하위 탭 — 2026-08-15 IA 개편으로 흩어져 있던 분석 3개를 하나로 묶었다.
 *  · 개요       ← 구 /audience (팔로워 분석)
 *  · 내 게시물  ← 구 /growth   (성장 진단)
 *  · 링크 분석  ← 구 /analyze  (콘텐츠 분석)
 * 셋 다 "내 계정 최근 성과"를 다른 축으로 자른 것이라 사용자에게 3개일 이유가 없었다.
 * 구 경로는 리다이렉트 스텁으로 남아 있다.
 */
const TABS = [
  { key: "overview", href: "/insights", label: "개요" },
  { key: "posts", href: "/insights/posts", label: "내 게시물" },
  { key: "link", href: "/insights/link", label: "링크 분석" },
] as const;

export function InsightsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="성과 분석 하위 메뉴" className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-chip px-3.5 py-1.5 text-[14px] font-semibold trans-state",
              active
                ? "bg-primary text-on-primary"
                : "border border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
