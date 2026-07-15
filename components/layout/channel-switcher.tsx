"use client";

import { cn } from "@/lib/cn";
import type { ChannelFilter } from "@/lib/types";
import { InstagramGlyph, MetaGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { InfoTip } from "@/components/ui/info-tip";

/*
  상단바 채널 영역 — 페이지 성격에 따라 세 가지 모드로 정리한다:
  - switch:    채널 스위처 (실제로 화면이 필터링되는 페이지에만)
  - indicator: 특정 채널 전용 기능 표시 (예: 광고 관리 = Meta 전용)
  - hidden:    채널 개념이 없거나 페이지 자체 필터가 있는 경우
  모든 채널을 다루지 않는 기능에 스위처가 떠서 "눌러도 아무 일 없는" 혼란을 없앤다.
*/

export type ChannelScope =
  | { mode: "switch" }
  | { mode: "indicator"; icon: "instagram" | "meta"; label: string; hint: string }
  | { mode: "hidden" };

/** 경로별 규칙 — 구체적인 prefix가 먼저 오도록 정렬 유지 */
const SCOPES: { prefix: string; scope: ChannelScope }[] = [
  { prefix: "/dashboard", scope: { mode: "switch" } },
  {
    prefix: "/audience",
    scope: {
      mode: "indicator",
      icon: "instagram",
      label: "Instagram 기준",
      hint: "오디언스 분석은 현재 인스타그램 공식 지표 기준입니다. 틱톡·쓰레드는 부분 지원으로 순차 확장됩니다.",
    },
  },
  {
    prefix: "/competitors/ads",
    scope: {
      mode: "indicator",
      icon: "meta",
      label: "Meta 광고 전용",
      hint: "경쟁사 광고 모니터링은 Meta 광고 라이브러리(Facebook·Instagram 광고) 기반 기능입니다.",
    },
  },
  {
    prefix: "/ads",
    scope: {
      mode: "indicator",
      icon: "meta",
      label: "Meta 광고 전용",
      hint: "광고 관리는 Meta 광고 계정(Facebook·Instagram 게재) 기능입니다.",
    },
  },
  {
    prefix: "/auto-dm",
    scope: {
      mode: "indicator",
      icon: "instagram",
      label: "Instagram 전용",
      hint: "댓글 자동 DM은 인스타그램 메시지 API 기반 기능입니다. 스레드·틱톡은 서드파티 DM 발송을 지원하지 않아 제외됩니다.",
    },
  },
  /* 탐색은 페이지 안에 자체 채널 필터가 있어 상단 중복 제거,
     분석·경쟁사 계정·스튜디오·리포트·알림·설정은 채널 필터 개념이 없음 → hidden */
];

export function getChannelScope(pathname: string): ChannelScope {
  const hit = SCOPES.find((s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`));
  return hit ? hit.scope : { mode: "hidden" };
}

const CHANNEL_OPTIONS: { value: ChannelFilter; label: string; glyph: React.ReactNode | null }[] = [
  { value: "all", label: "전체", glyph: null },
  { value: "instagram", label: "Instagram", glyph: <InstagramGlyph className="size-3.5" /> },
  { value: "tiktok", label: "TikTok", glyph: <TiktokGlyph className="size-3.5" /> },
  { value: "threads", label: "Threads", glyph: <ThreadsGlyph className="size-3.5" /> },
];

/** 채널 배지색 — 비활성 칩의 글리프에만 채널 고유색, 활성(코랄) 칩은 온컬러 통일 */
const GLYPH_TINT: Partial<Record<ChannelFilter, string>> = {
  instagram: "text-ig",
  tiktok: "text-fg",
  threads: "text-fg",
};

export function ChannelSwitcher({
  value,
  onChange,
}: {
  value: ChannelFilter;
  onChange: (v: ChannelFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="채널 선택">
      {CHANNEL_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              active
                ? "bg-primary text-on-primary"
                : "bg-overlay text-fg-sub border border-line hover:border-line-strong hover:text-fg",
            )}
          >
            {opt.glyph ? (
              <span className={cn(active ? "text-on-primary" : GLYPH_TINT[opt.value])} aria-hidden>
                {opt.glyph}
              </span>
            ) : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** 채널 전용 기능 표시 — 스위처 대신 뜨는 정적 안내 */
export function ChannelIndicator({ scope }: { scope: Extract<ChannelScope, { mode: "indicator" }> }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-chip border border-line bg-overlay px-3.5 py-1.5 text-[13px] font-semibold text-fg-sub">
      <span className={scope.icon === "instagram" ? "text-ig" : "text-meta"} aria-hidden>
        {scope.icon === "instagram" ? (
          <InstagramGlyph className="size-3.5" />
        ) : (
          <MetaGlyph className="size-3.5" />
        )}
      </span>
      {scope.label}
      <InfoTip>{scope.hint}</InfoTip>
    </span>
  );
}
