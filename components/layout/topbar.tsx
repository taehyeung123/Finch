"use client";

import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { CHANNEL_FILTERS } from "@/lib/channels";
import { notifications } from "@/lib/mock/data";
import { ChipFilter } from "@/components/ui/chip-filter";
import { useChannel } from "./channel-context";

/** 상단바 — 채널 스위처 / 전역 검색 / 알림 벨 / 프로필 (PART 6.2) */
export function Topbar() {
  const { channel, setChannel } = useChannel();
  const unread = notifications.filter((n) => !n.read).length;

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

      <Link
        href="/settings"
        aria-label="내 계정 설정"
        className="flex size-9 items-center justify-center rounded-chip bg-primary-weak text-sm font-bold text-primary"
      >
        핀
      </Link>
    </header>
  );
}
