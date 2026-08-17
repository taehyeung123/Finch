"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CalendarClock, LayoutDashboard, Search, Sparkles, MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_FOOTER_ITEMS, NAV_GROUPS, isNavActive, type NavItem } from "./sidebar";

/** 모바일: 사이드바 대신 하단 탭바 — 핵심 4개 + 더보기 (PART 6.2 반응형 기준) */
const TABS: readonly NavItem[] = [
  { href: "/dashboard", label: "홈", icon: LayoutDashboard },
  { href: "/publish", label: "발행", icon: CalendarClock },
  { href: "/library", label: "탐색", icon: Search },
  { href: "/studio", label: "만들기", icon: Sparkles },
];

const TAB_HREFS = new Set(TABS.map((tab) => tab.href));

/** 그룹에 속하지 않지만 모바일에서 갈 곳이 필요한 항목 — 알림은 데스크톱에선 상단바 벨이 맡는다 */
const SHEET_EXTRA_ITEMS: readonly NavItem[] = [
  { href: "/notifications", label: "알림", icon: Bell },
  ...NAV_FOOTER_ITEMS,
];

/** 탭바에 이미 있는 목적지는 더보기에서 뺀다 — 더보기는 "나머지 전부"를 맡는 자리 */
const SHEET_GROUPS = NAV_GROUPS.map((group) => ({
  key: group.key,
  label: group.label,
  items: group.items.filter((item) => !TAB_HREFS.has(item.href)),
})).filter((group) => group.items.length > 0);

export function MobileTabbar() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  const isActive = (href: string) => isNavActive(pathname, href);

  function renderSheetItem({ href, label, icon: Icon }: NavItem) {
    const active = isActive(href);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          onClick={() => setSheetOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-card px-3 py-2.5 text-[15px] font-medium transition-colors",
            active ? "bg-primary-weak text-primary" : "text-fg-sub hover:bg-body hover:text-fg",
          )}
        >
          <Icon className="size-[18px] shrink-0" aria-hidden />
          {label}
        </Link>
      </li>
    );
  }

  return (
    <>
      {sheetOpen ? (
        <>
          <div
            className="modal-scrim-in fixed inset-0 z-50 bg-black/40 md:hidden"
            aria-hidden
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="전체 메뉴"
            className="sheet-in-up shadow-pop fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-card border-t border-line-strong bg-overlay md:hidden"
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
              <p className="text-[13px] font-semibold text-fg-faint">전체 메뉴</p>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setSheetOpen(false)}
                className="rounded-card p-1.5 text-fg-faint transition-colors hover:bg-body hover:text-fg"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
              {SHEET_GROUPS.map((group) => (
                <section key={group.key} className="pt-2">
                  <h2 className="px-3 py-1.5 text-[12px] font-semibold tracking-wide text-fg-faint">{group.label}</h2>
                  <ul className="space-y-0.5">{group.items.map(renderSheetItem)}</ul>
                </section>
              ))}
              <ul className="mt-3 space-y-0.5 border-t border-line pt-3">
                {SHEET_EXTRA_ITEMS.map(renderSheetItem)}
              </ul>
            </div>
          </div>
        </>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-body pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="모바일 메뉴"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => setSheetOpen(false)}
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

        {/* 더보기는 페이지가 아니라 시트 토글 — Link로 두면 설정으로 직행해 나머지 메뉴가 사라진다 */}
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          aria-expanded={sheetOpen}
          aria-haspopup="dialog"
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
            sheetOpen ? "text-primary" : "text-fg-faint",
          )}
        >
          <MoreHorizontal className="size-5" aria-hidden />
          더보기
        </button>
      </nav>
    </>
  );
}
