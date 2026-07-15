"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, FileSearch, LayoutDashboard, Megaphone, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/** 모바일: 사이드바 대신 하단 탭바 — 핵심 5개 메뉴 (PART 6.2 반응형 기준) */
const TABS = [
  { href: "/dashboard", label: "홈", icon: LayoutDashboard },
  { href: "/analyze", label: "분석", icon: FileSearch },
  { href: "/discover", label: "트렌드", icon: Compass },
  { href: "/ads", label: "광고", icon: Megaphone },
  { href: "/settings", label: "더보기", icon: MoreHorizontal },
] as const;

export function MobileTabbar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-body pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="모바일 메뉴"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
              active ? "text-primary" : "text-fg-faint",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
