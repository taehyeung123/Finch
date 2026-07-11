"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, LogOut, Search, Settings } from "lucide-react";
import { CHANNEL_FILTERS } from "@/lib/channels";
import { notifications } from "@/lib/mock/data";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Badge } from "@/components/ui/badge";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { useChannel } from "./channel-context";

const menuItem =
  "flex w-full items-center gap-2 rounded-card px-2.5 py-2 text-left text-[14px] text-fg-sub transition-colors hover:bg-body hover:text-fg";

/** 상단바 — 채널 스위처 / 전역 검색 / 알림 벨 / 계정 드롭다운 (PART 6.2) */
export function Topbar() {
  const { channel, setChannel } = useChannel();
  const unread = notifications.filter((n) => !n.read).length;

  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 로그인 사용자 조회 — 미설정(데모 모드)이면 호출하지 않는다
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setEmail(data.user?.email ?? null);
      });
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6">
      <ChipFilter options={[...CHANNEL_FILTERS]} value={channel} onChange={setChannel} />

      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
          <input
            type="search"
            placeholder="계정·콘텐츠 검색"
            className="h-9 w-52 rounded-card border border-line bg-body pl-9 pr-3 text-[15px] placeholder:text-fg-faint focus:border-primary focus:outline-none lg:w-64"
          />
        </label>
      </div>

      <Link
        href="/notifications"
        aria-label={`알림 ${unread}건`}
        className="relative rounded-card p-2 text-fg-sub hover:bg-overlay hover:text-fg"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden />
        ) : null}
      </Link>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-label="계정 메뉴"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-9 items-center justify-center rounded-chip bg-primary-weak text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        >
          {email ? email[0].toUpperCase() : "핀"}
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-56 rounded-card border border-line bg-overlay p-1.5"
          >
            {email ? (
              <>
                <p className="truncate px-2.5 py-2 text-[13px] text-fg-faint" title={email}>
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
