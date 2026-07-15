"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  Eye,
  FileSearch,
  FileText,
  LayoutDashboard,
  Megaphone,
  MessageSquareReply,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { usageStats } from "@/lib/data";
import { FinchLogo, FinchMark } from "@/components/logo";
import { UsageGauge } from "@/components/ui/charts";
import { ButtonLink } from "@/components/ui/button";

/** PART 5 사이트맵 순서 그대로 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "홈", icon: LayoutDashboard },
  { href: "/analyze", label: "콘텐츠 분석", icon: FileSearch },
  { href: "/audience", label: "팔로워 분석", icon: Eye },
  { href: "/discover", label: "트렌드 탐색", icon: Compass },
  { href: "/competitors", label: "경쟁사 비교", icon: Users },
  { href: "/ads", label: "광고 관리", icon: Megaphone },
  { href: "/auto-dm", label: "자동 DM", icon: MessageSquareReply },
  { href: "/studio", label: "AI 스튜디오", icon: Sparkles },
  { href: "/reports", label: "리포트", icon: FileText },
  { href: "/notifications", label: "알림", icon: Bell },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

/** 좌측 사이드바 — 고정폭 240px, 접으면 72px 아이콘바 (PART 6.2) */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-body md:flex",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-line", collapsed ? "justify-center" : "justify-between pl-5 pr-3")}>
        <Link href="/dashboard" aria-label="핀치 홈">
          {collapsed ? <FinchMark className="text-primary" /> : <FinchLogo />}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="사이드바 접기"
            className="rounded-card p-1.5 text-fg-faint hover:bg-overlay hover:text-fg"
          >
            <ChevronsLeft className="size-4" />
          </button>
        ) : null}
      </div>

      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-3" : "px-3")} aria-label="주 메뉴">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="사이드바 펼치기"
            className="mb-2 flex w-full items-center justify-center rounded-card p-2.5 text-fg-faint hover:bg-overlay hover:text-fg"
          >
            <ChevronsRight className="size-4" />
          </button>
        ) : null}
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-card px-3 py-2.5 text-[15px] font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    active ? "bg-primary-weak text-primary" : "text-fg-sub hover:bg-overlay hover:text-fg",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  {!collapsed ? label : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!collapsed ? (
        <div className="border-t border-line p-4">
          {/* 사용량 게이지 미니 위젯 + 업그레이드 (PART 6.2) */}
          <div className="space-y-3">
            {usageStats.slice(0, 2).map((u) => (
              <UsageGauge key={u.label} {...u} compact />
            ))}
          </div>
          <ButtonLink href="/settings/billing" size="sm" className="mt-4 w-full">
            플랜 업그레이드
          </ButtonLink>
        </div>
      ) : null}
    </aside>
  );
}
