"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  ChevronsLeft,
  Compass,
  Eye,
  FileSearch,
  FileText,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageCircleQuestion,
  MessageSquareReply,
  Rocket,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { usageStats } from "@/lib/data";
import { FinchMark } from "@/components/logo";
import { UsageGauge } from "@/components/ui/charts";
import { ButtonLink } from "@/components/ui/button";

/** PART 5 사이트맵 순서 그대로 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "홈", icon: LayoutDashboard },
  { href: "/analyze", label: "콘텐츠 분석", icon: FileSearch },
  { href: "/audience", label: "팔로워 분석", icon: Eye },
  { href: "/discover", label: "트렌드 탐색", icon: Compass },
  { href: "/library", label: "레퍼런스", icon: Library },
  { href: "/competitors", label: "경쟁사 비교", icon: Users },
  { href: "/ads", label: "광고 관리", icon: Megaphone },
  { href: "/auto-dm", label: "자동 DM", icon: MessageSquareReply },
  { href: "/growth", label: "성장 진단", icon: Rocket },
  { href: "/studio", label: "AI 스튜디오", icon: Sparkles },
  { href: "/reports", label: "리포트", icon: FileText },
  { href: "/notifications", label: "알림", icon: Bell },
  { href: "/settings", label: "설정", icon: Settings },
  { href: "/support", label: "문의하기", icon: MessageCircleQuestion },
] as const;

/** 좌측 사이드바 — 고정폭 240px, 접으면 72px 아이콘바 (PART 6.2) */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  /* 접기·펼치기 공용 이징 — 랜딩 진입 애니메이션(globals.css .anim-fade-up/.reveal)과 같은
     커브를 써서 앱 전체 모션 리듬을 통일한다. 폭은 레이아웃 속성이라 GPU 가속 대상이 아니지만
     사이드바 접기는 본질적으로 형제 요소(본문)의 리플로우를 동반하는 레이아웃 동작이라
     transform으로 대체할 수 없다 — duration을 300ms로 짧게 잡아 버벅임 체감을 줄인다. */
  const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-line bg-body transition-[width] duration-300 md:flex",
        EASE,
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      {/* 헤더 — 접힘 폭(72px)에선 로고 하나만으로도 여유가 빠듯해 토글 버튼을 여기 두면
          겹친다. 토글은 하단에 고정 위치로 따로 둔다(아래 footer 참고). */}
      <div className="flex h-16 items-center gap-2 border-b border-line pl-5 pr-3">
        <Link href="/dashboard" aria-label="핀치 홈" className="flex min-w-0 items-center gap-2">
          <FinchMark className="shrink-0 text-primary" />
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap text-lg font-bold tracking-tight text-fg transition-all duration-300",
              EASE,
              collapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[100px] translate-x-0 opacity-100",
            )}
          >
            핀치
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="주 메뉴">
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
                    active ? "bg-primary-weak text-primary" : "text-fg-sub hover:bg-overlay hover:text-fg",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  <span
                    className={cn(
                      "overflow-hidden whitespace-nowrap transition-all duration-300",
                      EASE,
                      collapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[160px] translate-x-0 opacity-100",
                    )}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 사용량 게이지 미니 위젯 + 업그레이드 (PART 6.2) — grid-rows 0fr↔1fr 트릭으로 높이를
          부드럽게 접는다. 항상 DOM에 남겨 접힘 중에도 순간적으로 사라지지 않게 한다. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300",
          EASE,
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] border-t border-line opacity-100",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 p-4">
            {usageStats.slice(0, 2).map((u) => (
              <UsageGauge key={u.label} {...u} compact />
            ))}
            <ButtonLink href="/settings/billing" size="sm" className="mt-4 w-full">
              플랜 업그레이드
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* 접기·펼치기 — 상태와 무관하게 항상 같은 자리(맨 아래)에 고정 */}
      <div className="border-t border-line p-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className="flex w-full items-center justify-center rounded-card p-2 text-fg-faint transition-colors hover:bg-overlay hover:text-fg"
        >
          <ChevronsLeft className={cn("size-4 transition-transform duration-300", EASE, collapsed && "rotate-180")} />
        </button>
      </div>
    </aside>
  );
}
