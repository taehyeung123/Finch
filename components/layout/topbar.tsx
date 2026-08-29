"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Search, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { FinchMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { useChannel } from "./channel-context";
import { ChannelIndicator, ChannelSwitcher, getChannelScope } from "./channel-switcher";
import { NAV_FOOTER_ITEMS, NAV_GROUPS, NAV_HOME } from "./sidebar";

/*
  현재 화면 이름 — 채널 표시가 없는 페이지에서 상단바 왼쪽이 **통째로 비어 있었다**
  (2026-08-29 모바일 실측: 아이콘 셋만 오른쪽에 떠 있는 빈 바). 모바일에는 사이드바가
  없어 «지금 어디인지»를 말해 주는 곳이 여기뿐이다. 이름표는 sidebar.ts 목록에서 가져온다 —
  IA 를 두 벌로 두지 않는다.
*/
const NAV_TITLES: ReadonlyArray<{ href: string; label: string }> = [
  { href: NAV_HOME.href, label: NAV_HOME.label },
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ href: i.href as string, label: i.label as string }))),
  ...NAV_FOOTER_ITEMS.map((i) => ({ href: i.href, label: i.label })),
  /* 사이드바에 없는 화면 — 알림은 메뉴에서 빼고 이 벨이 유일한 진입점이라 목록에 없다.
     그래도 이름은 있어야 상단바가 비지 않는다. */
  { href: "/notifications", label: "알림" },
];

function screenTitle(pathname: string): string | null {
  /* 더 구체적인 경로가 이기게 — /studio 와 /studio/brand 가 함께 걸린다 */
  const hit = [...NAV_TITLES]
    .sort((x, y) => y.href.length - x.href.length)
    .find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  return hit ? hit.label : null;
}

const menuItem =
  "flex w-full items-center gap-2 rounded-card px-2.5 py-2 text-left text-[15px] text-fg-sub trans-state hover:bg-tint-hover hover:text-fg";

/** 상단바 — 채널 스위처 / 전역 검색 / 알림 벨 / 계정 드롭다운 (PART 6.2) */
export function Topbar({ unread = 0 }: { unread?: number }) {
  const { channel, setChannel } = useChannel();
  const pathname = usePathname();
  const scope = getChannelScope(pathname);
  /*
    ⚠️ 미읽음 수는 **서버가 센 값을 받는다.** 예전엔 여기서 정적 모듈 상수(@/lib/data 의 notifications)를
    세고 있었는데, /notifications 화면은 DB 를 실조회한다(lib/data/internal.ts) — 두 화면이 **다른 소스**를
    봤다. 그래서 실제 모드에서는 알림이 아무리 쌓여도 벨이 영원히 0 이었고, 데모에서는 「모두 읽음」을
    눌러 목록이 다 회색이 된 뒤에도 벨이 «2» 를 달고 있었다(실측). 레이아웃이 같은 조회로 세어 내려준다.
  */

  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 로그인 사용자 조회 — 데모 모드면 호출하지 않는다. Supabase 다운 시에도 조용히 무시.
  useEffect(() => {
    if (isDemoMode()) return;
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setEmail(data.user?.email ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 외부 클릭·Escape로 드롭다운 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  /* 계정 메뉴가 열려 있는 동안만 z 를 올린다(2026-08-26 사장님 지적 — 링크 편집기의
     고정 바에 메뉴가 덮여 안 보였다). 상단바는 sticky+z-30 으로 자기 쌓임 맥락을 만들기
     때문에, 안의 메뉴에 z 를 아무리 줘도 DOM 상 뒤에 오는 같은 층(편집기 바 z-30,
     탐색 헤더 z-40)이 이긴다 — 맥락 전체를 올리는 것만이 답이다.
     상시 z-50 으로 두지 않는 이유: 탐색의 필터 스크림(z-30, DOM 나중)이 상단바를 함께
     가라앉히는 연출이 z-30 전제를 딛고 서 있다(search-console.tsx 주석). */
  return (
    <header className={cn("sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-body/90 px-4 backdrop-blur md:px-6", menuOpen && "z-50")}>
      {/* 브랜드 마크 — 모바일에는 사이드바가 없어 **화면 어디에도 로고가 없었다**
          (2026-08-29 사장님 지적). 데스크톱은 사이드바가 로고를 지므로 여기선 감춘다. */}
      <Link href="/dashboard" aria-label="핀치 홈" className="-my-1 flex shrink-0 items-center py-1 md:hidden">
        <FinchMark className="size-6 text-primary" aria-hidden />
      </Link>

      {/* 페이지 성격별 채널 영역 — 스위처(필터 동작) / 전용 표시 / 숨김 (channel-switcher.tsx) */}
      {scope.mode === "switch" ? (
        <ChannelSwitcher value={channel} onChange={setChannel} />
      ) : scope.mode === "indicator" ? (
        <ChannelIndicator scope={scope} />
      ) : (
        <p className="truncate text-[15px] font-semibold text-fg">{screenTitle(pathname) ?? ""}</p>
      )}

      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
          <input
            type="search"
            placeholder="계정·콘텐츠 검색"
            className="h-8 w-48 rounded-card border border-line bg-body pl-9 pr-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none lg:w-56"
          />
        </label>
      </div>

      {/* 검색이 숨는 모바일에서는 토글이 오른쪽 정렬을 맡는다 */}
      <ThemeToggle className="ml-auto shrink-0 sm:ml-0" />

      <Link
        href="/notifications"
        aria-label={`알림 ${unread}건`}
        className="relative shrink-0 rounded-card p-2 text-fg-sub hover:bg-tint-hover hover:text-fg"
      >
        <Bell className="size-[18px]" aria-hidden />
        {/* 알림이 사이드바에서 빠져 이 벨이 유일한 상시 진입점 — 점 대신 미읽음 개수를 노출한다 */}
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 min-w-4 rounded-chip bg-primary px-1 text-[11px] font-bold leading-4 text-on-primary tnum">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          aria-label="계정 메뉴"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-8 items-center justify-center rounded-chip bg-primary-weak text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          {email ? email[0].toUpperCase() : "핀"}
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="shadow-pop absolute right-0 top-full mt-2 w-56 rounded-card border border-line bg-overlay p-1.5"
          >
            {email ? (
              <>
                <p className="truncate px-2.5 py-2 text-[14px] text-fg-sub" title={email}>
                  {email}
                </p>
                <div className="mx-2.5 my-1 h-px bg-line" aria-hidden />
                <Link href="/settings" role="menuitem" className={menuItem} onClick={() => setMenuOpen(false)}>
                  <Settings className="size-4" aria-hidden />
                  설정
                </Link>
                <form action="/auth/signout" method="post">
                  <button type="submit" role="menuitem" className={menuItem}>
                    <LogOut className="size-4" aria-hidden />
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="px-2.5 py-2">
                  <Badge>데모 모드</Badge>
                </div>
                <div className="mx-2.5 my-1 h-px bg-line" aria-hidden />
                <Link href="/login" role="menuitem" className={menuItem} onClick={() => setMenuOpen(false)}>
                  로그인
                </Link>
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
