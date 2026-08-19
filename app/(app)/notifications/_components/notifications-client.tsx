"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BellOff,
  CheckCheck,
  CreditCard,
  KeyRound,
  Megaphone,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatAgo } from "@/lib/format";
import type { AppNotification, NotificationType } from "@/lib/types";
import { markAllNotificationsRead, markNotificationRead } from "../actions";

type FilterValue = "all" | "competitor_ad" | "trend" | "account" | "system";

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "competitor_ad", label: "경쟁사 광고" },
  { value: "trend", label: "트렌드" },
  { value: "account", label: "내 계정" },
  { value: "system", label: "시스템" },
];

const TYPE_TO_FILTER: Record<NotificationType, FilterValue> = {
  competitor_ad: "competitor_ad",
  trend: "trend",
  account_spike: "account",
  account_drop: "account",
  token_expiry: "system",
  budget: "system",
  billing: "system",
  studio: "system",
};

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  competitor_ad: Megaphone,
  trend: TrendingUp,
  account_spike: ArrowUpRight,
  account_drop: ArrowDownRight,
  token_expiry: KeyRound,
  budget: Wallet,
  billing: CreditCard,
  studio: Sparkles,
};

/* 상승=초록/하락=빨강 (PART 7.4), 나머지는 중립 */
const TYPE_ICON_TONE: Partial<Record<NotificationType, string>> = {
  account_spike: "text-positive",
  account_drop: "text-negative",
};

/* 알림 목록은 읽기 대상이라 **목록에만** 폭을 제한한다 — 1600px 한 줄이면 제목은
   왼쪽 끝, 시각은 오른쪽 끝으로 갈라져 시선이 매 행 화면을 가로지른다.
   페이지 전체를 묶는 것과는 다르다(그건 좌우 빈 여백을 만든다). */
export function NotificationsClient({ initial }: { initial: AppNotification[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<FilterValue>("all");

  const unreadCount = items.filter((n) => !n.read).length;
  const visible = filter === "all" ? items : items.filter((n) => TYPE_TO_FILTER[n.type] === filter);

  // 낙관적 로컬 갱신 + 서버 액션으로 영속화 (실패해도 화면은 유지 — 다음 로드에서 서버 상태로 수렴)
  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsRead();
  }

  function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    void markNotificationRead(id);
  }

  return (
    <div className="space-y-6 [&_ul]:max-w-[64rem]">
      <PageHeader
        title="알림"
        description={
          unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개가 있습니다.` : "모든 알림을 확인했습니다."
        }
        action={
          <>
            <Button variant="secondary" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="size-4" aria-hidden />
              모두 읽음
            </Button>
            <ButtonLink href="/settings/notifications" variant="ghost" size="sm">
              <Settings className="size-4" aria-hidden />
              알림 설정
            </ButtonLink>
          </>
        }
      />

      {/* 유형 필터 (PART 4.12) */}
      <ChipFilter options={FILTER_OPTIONS} value={filter} onChange={setFilter} />

      {/* 알림 목록 (PART 4.12) — 읽지 않은 항목은 코랄 점 + 배경 틴트 */}
      {visible.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {visible.map((n) => {
              const Icon = TYPE_ICON[n.type];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={cn(
                      "flex w-full items-start gap-3 p-4 text-left trans-state",
                      n.read ? "hover:bg-overlay" : "bg-primary-weak hover:bg-overlay",
                    )}
                    aria-label={n.read ? n.title : `읽지 않음: ${n.title}`}
                  >
                    <span
                      className={cn(
                        "mt-3 size-2 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-card border border-line bg-plate",
                        TYPE_ICON_TONE[n.type] ?? "text-fg-sub",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className={cn("text-[15px]", n.read ? "font-medium" : "font-semibold")}>
                          {n.title}
                        </span>
                        <span className="tnum shrink-0 text-xs text-fg-faint">{formatAgo(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-[14px] text-fg-sub">{n.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={BellOff}
          title="알림이 없습니다"
          description="새로운 경쟁사 광고·트렌드·계정 변화가 감지되면 여기에 표시됩니다."
        />
      )}
    </div>
  );
}
