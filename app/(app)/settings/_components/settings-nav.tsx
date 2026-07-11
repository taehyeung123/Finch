"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** 설정 서브탭 내비 — 칩 스타일 (PART 7.6 rounded-chip) */
const TABS = [
  { href: "/settings", label: "계정 연동" },
  { href: "/settings/team", label: "팀" },
  { href: "/settings/billing", label: "요금제·결제" },
  { href: "/settings/notifications", label: "알림 설정" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="설정 메뉴" className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-chip px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              active
                ? "bg-primary text-on-primary"
                : "bg-overlay text-fg-sub border border-line hover:border-line-strong hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
