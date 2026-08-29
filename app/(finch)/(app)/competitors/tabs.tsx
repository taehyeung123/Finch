import Link from "next/link";
import { cn } from "@/lib/cn";

/** 경쟁사 분석 하위 탭 — 계정 분석·비교(/competitors)와 광고 모니터링(/competitors/ads) 공용 */
const TABS = [
  { key: "accounts", href: "/competitors", label: "계정 분석·비교" },
  { key: "ads", href: "/competitors/ads", label: "광고 모니터링" },
] as const;

export function CompetitorTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="경쟁사 분석 하위 메뉴" className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-chip px-3.5 text-[14px] font-semibold trans-state",
              active
                ? "bg-primary text-on-primary"
                : "border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
