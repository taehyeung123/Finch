"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  ChevronsLeft,
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { usageStats } from "@/lib/data";
import { FinchMark } from "@/components/logo";
import { UsageGauge } from "@/components/ui/charts";
import { ButtonLink } from "@/components/ui/button";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** 홈은 어느 그룹에도 속하지 않는 단독 진입점 */
export const NAV_HOME: NavItem = { href: "/dashboard", label: "홈", icon: LayoutDashboard };

/** 목적별 3그룹 — 내 채널(분석) / 시장 조사(외부) / 제작·집행(액션) */
export const NAV_GROUPS = [
  {
    key: "mine",
    label: "내 채널",
    items: [
      { href: "/analyze", label: "콘텐츠 분석", icon: FileSearch },
      { href: "/audience", label: "팔로워 분석", icon: Eye },
      { href: "/growth", label: "성장 진단", icon: Rocket },
      { href: "/reports", label: "리포트", icon: FileText },
    ],
  },
  {
    key: "market",
    label: "시장 조사",
    items: [
      { href: "/library", label: "탐색·레퍼런스", icon: Library },
      { href: "/competitors", label: "경쟁사 비교", icon: Users },
    ],
  },
  {
    key: "make",
    label: "제작·집행",
    items: [
      { href: "/studio", label: "AI 스튜디오", icon: Sparkles },
      { href: "/ads", label: "광고 관리", icon: Megaphone },
      { href: "/auto-dm", label: "자동 DM", icon: MessageSquareReply },
    ],
  },
] as const satisfies readonly { key: string; label: string; items: readonly NavItem[] }[];

/** 하단 고정 — 목적 그룹과 층위가 다른 상시 메뉴 */
export const NAV_FOOTER_ITEMS: readonly NavItem[] = [
  { href: "/settings", label: "설정", icon: Settings },
  { href: "/support", label: "고객센터", icon: MessageCircleQuestion },
];

type GroupKey = (typeof NAV_GROUPS)[number]["key"];
type GroupState = Record<GroupKey, boolean>;

/** 사용자가 접어둔 그룹 — 첫 페인트(서버 스냅샷)는 항상 전부 펼침 */
const GROUPS_STORAGE_KEY = "finch:sidebar:groups";
const GROUPS_ALL_OPEN: GroupState = { mine: true, market: true, make: true };

/*
  localStorage 기반 외부 스토어 — useSyncExternalStore로 구독한다.
  effect 안에서 setState로 끌어오면 하이드레이션 직후 캐스케이딩 렌더가 나므로
  (react-hooks/set-state-in-effect), 이 레포의 다른 localStorage 상태와 같은 관례를 쓴다.
  서버 스냅샷은 항상 GROUPS_ALL_OPEN이라 SSR/CSR 마크업이 어긋나지 않는다.
*/
let groupsCache: GroupState | null = null;
const groupsListeners = new Set<() => void>();

function getGroupsSnapshot(): GroupState {
  if (groupsCache === null) {
    let next: GroupState = GROUPS_ALL_OPEN;
    try {
      const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      if (saved && typeof saved === "object") {
        const merged = { ...GROUPS_ALL_OPEN };
        for (const group of NAV_GROUPS) {
          if (typeof saved[group.key] === "boolean") merged[group.key] = saved[group.key] as boolean;
        }
        next = merged;
      }
    } catch {
      /* 저장값 손상·접근 차단(프라이빗 모드) 시엔 기본값(전부 펼침) 유지 */
    }
    groupsCache = next;
  }
  return groupsCache;
}

function subscribeGroups(onChange: () => void) {
  groupsListeners.add(onChange);
  return () => groupsListeners.delete(onChange);
}

function writeGroups(next: GroupState) {
  groupsCache = next;
  try {
    window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패해도 이번 세션 동작은 유지 */
  }
  groupsListeners.forEach((listener) => listener());
}

/** 좌측 사이드바 — 고정폭 240px, 접으면 72px 아이콘바 (PART 6.2) */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const groupOpen = useSyncExternalStore(subscribeGroups, getGroupsSnapshot, () => GROUPS_ALL_OPEN);

  function setGroupState(key: GroupKey, value: boolean) {
    writeGroups({ ...groupOpen, [key]: value });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  /* 접기·펼치기 공용 이징 — 랜딩 진입 애니메이션(globals.css .anim-fade-up/.reveal)과 같은
     커브를 써서 앱 전체 모션 리듬을 통일한다. 폭은 레이아웃 속성이라 GPU 가속 대상이 아니지만
     사이드바 접기는 본질적으로 형제 요소(본문)의 리플로우를 동반하는 레이아웃 동작이라
     transform으로 대체할 수 없다 — duration을 300ms로 짧게 잡아 버벅임 체감을 줄인다. */
  const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

  /** 항목 하나 — 그룹 소속이면 접힘 폭 툴팁에 그룹명을 앞에 붙인다 */
  function renderItem({ href, label, icon: Icon }: NavItem, groupLabel?: string) {
    const active = isActive(href);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          title={collapsed ? (groupLabel ? `${groupLabel} · ${label}` : label) : undefined}
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
  }

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
        <ul className="space-y-0.5">{renderItem(NAV_HOME)}</ul>

        <div className="mt-3">
          {NAV_GROUPS.map((group) => {
            const hasActive = group.items.some((item) => isActive(item.href));
            /* 상태를 덮어쓰지 않고 렌더 시점에만 계산한다 — 접힘 폭에서 강제로 펼쳐도
               사용자가 접어둔 선택은 그대로 남아 있다가 다시 펼치면 복원된다.
               현재 경로가 든 그룹은 저장값과 무관하게 항상 펼침(활성 항목이 숨지 않도록). */
            const open = collapsed || hasActive || groupOpen[group.key] !== false;
            return (
              <div key={group.key}>
                {/* 그룹 구분선 — 헤더 라벨이 사라지는 접힘 폭에서만 보인다.
                    펼침에선 투명하게 자리만 지켜 접을 때 레이아웃이 튀지 않는다. */}
                <div
                  className={cn(
                    "mx-2 my-2 h-px bg-line transition-opacity duration-300",
                    collapsed ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />

                {/* 그룹 헤더 — 접힘 폭에선 사용량 게이지와 같은 grid 0fr↔1fr 트릭으로 높이를 접는다 */}
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300",
                    EASE,
                    collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                  )}
                  aria-hidden={collapsed ? true : undefined}
                >
                  <div className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setGroupState(group.key, !open)}
                      aria-expanded={open}
                      aria-controls={`navgroup-${group.key}`}
                      tabIndex={collapsed ? -1 : undefined}
                      className="flex w-full items-center justify-between gap-2 rounded-card px-3 py-1.5 text-[12px] font-semibold tracking-wide text-fg-faint transition-colors hover:text-fg-sub"
                    >
                      {group.label}
                      <ChevronDown
                        className={cn("size-3.5 shrink-0 transition-transform duration-200", !open && "-rotate-90")}
                        aria-hidden
                      />
                    </button>
                  </div>
                </div>

                <ul id={`navgroup-${group.key}`} className={cn("space-y-0.5", !open && "hidden")}>
                  {group.items.map((item) => renderItem(item, group.label))}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>

      {/* 하단 고정 메뉴 — 목적 그룹과 층위가 달라 스크롤 영역 밖에 둔다 */}
      <nav className="border-t border-line px-3 py-3" aria-label="보조 메뉴">
        <ul className="space-y-0.5">{NAV_FOOTER_ITEMS.map((item) => renderItem(item))}</ul>
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
