"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Search, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { useChannel } from "./channel-context";
import { ChannelIndicator, ChannelSwitcher, getChannelScope } from "./channel-switcher";

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

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-body/90 px-4 backdrop-blur md:px-6">
      {/* 페이지 성격별 채널 영역 — 스위처(필터 동작) / 전용 표시 / 숨김 (channel-switcher.tsx) */}
      {scope.mode === "switch" ? (
        <ChannelSwitcher value={channel} onChange={setChannel} />
      ) : scope.mode === "indicator" ? (
        <ChannelIndicator scope={scope} />
      ) : (
        <div aria-hidden />
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
      <ThemeToggle className="ml-auto sm:ml-0" />

      <Link
        href="/notifications"
        aria-label={`알림 ${unread}건`}
        className="relative rounded-card p-2 text-fg-sub hover:bg-tint-hover hover:text-fg"
      >
        <Bell className="size-[18px]" aria-hidden />
        {/* 알림이 사이드바에서 빠져 이 벨이 유일한 상시 진입점 — 점 대신 미읽음 개수를 노출한다 */}
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 min-w-4 rounded-chip bg-primary px-1 text-[11px] font-bold leading-4 text-on-primary tnum">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>

      <div ref={menuRef} className="relative">
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
