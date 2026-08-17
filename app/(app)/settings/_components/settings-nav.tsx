"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/*
  설정 서브탭 — 칩 스타일 (PART 7.6 rounded-chip).

  순서는 "내 것 → 연결한 것 → 돈 → 운영"이다. 앞서는 「계정 연동」이 첫 탭이라
  설정에 들어오면 **내가 누구인지 보기 전에** 남의 플랫폼 연동부터 보였다.
  프로필(내 정보·로그인 방식·테마)이 먼저다.

  회원탈퇴는 여기 없다 — 탭이 아니라 프로필 화면 맨 아래 작은 링크다(사장님 지시).
  평생 한 번, 되돌릴 수 없는 동작을 다른 설정과 같은 오클릭 거리에 두지 않는다.
*/
const TABS = [
  { href: "/settings/profile", label: "프로필" },
  { href: "/settings", label: "채널 연동" },
  { href: "/settings/team", label: "팀" },
  { href: "/settings/billing", label: "요금제·결제" },
  { href: "/settings/notifications", label: "알림" },
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
              // 모바일은 py-2.5로 약 44px 터치 타깃 확보, 데스크톱(sm 이상)은 기존 칩 높이 유지
              "rounded-chip px-3.5 py-2.5 sm:py-1.5 text-[14px] font-semibold trans-state",
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
