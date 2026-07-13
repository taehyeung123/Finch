"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LayoutGrid,
  MessageCircle,
  Minus,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { InstagramGlyph, MetaGlyph, ThreadsGlyph } from "@/components/icons/brand";
import {
  AD_PLATFORMS,
  MIN_RECOMMENDED,
  PLACEMENT_GROUPS,
  PLATFORM_LABEL,
  allPositions,
  selectedCount,
  type AdPlatform,
  type PlacementGroup,
  type PlacementState,
} from "@/lib/ads/meta-placements";

/*
  노출 위치 선택기 — Meta 광고 관리자의 "노출 위치" 설정 재현.
  ① 방식: 어드밴티지+(자동, 추천) vs 수동
  ② 수동일 때만: 플랫폼 5개 토글 → 플랫폼별 노출 위치를 그룹 아코디언으로 개별 선택
  ③ 선택 위치 6개 미만이면 Meta 실제 경고 문구 노출
  플랫폼을 끄면 그 플랫폼의 위치 선택도 함께 해제(수동 카운트와 실제 선택 일치 유지).
*/

const chipBase =
  "inline-flex items-center gap-1.5 rounded-chip border px-3.5 py-1.5 text-[13px] font-semibold transition-colors";
const chipOff = "border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg";
const chipOn = "border-primary bg-primary text-on-primary";

/** 플랫폼 아이콘 — Instagram/Meta/Threads는 브랜드 글리프, 나머지는 lucide 일반 아이콘 */
function PlatformIcon({ platform, className }: { platform: AdPlatform; className?: string }) {
  switch (platform) {
    case "instagram":
      return <InstagramGlyph className={className} />;
    case "facebook":
      return <MetaGlyph className={className} />;
    case "threads":
      return <ThreadsGlyph className={className} />;
    case "audience_network":
      return <LayoutGrid className={className} aria-hidden />;
    case "messenger":
      return <MessageCircle className={className} aria-hidden />;
  }
}

export function PlacementSelector({
  value,
  onChange,
}: {
  value: PlacementState;
  onChange: (v: PlacementState) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(PLACEMENT_GROUPS[0]?.key ?? null);

  const platformSelected = (p: AdPlatform) => value.platforms.includes(p);

  /** 방식 전환 — 수동으로 처음 넘어올 때 선택 플랫폼의 위치를 모두 켠 상태로(Meta 수동 기본값) */
  function chooseMode(mode: PlacementState["mode"]) {
    if (mode === value.mode) return;
    if (mode === "manual" && value.positions.length === 0) {
      const keys = allPositions()
        .filter((pos) => value.platforms.includes(pos.platform))
        .map((pos) => pos.key);
      onChange({ ...value, mode: "manual", positions: keys });
      return;
    }
    onChange({ ...value, mode });
  }

  function togglePlatform(p: AdPlatform) {
    if (platformSelected(p)) {
      // 플랫폼을 끄면 해당 플랫폼의 위치 선택도 함께 해제
      const byKey = new Map(allPositions().map((pos) => [pos.key, pos] as const));
      onChange({
        ...value,
        platforms: value.platforms.filter((x) => x !== p),
        positions: value.positions.filter((key) => byKey.get(key)?.platform !== p),
      });
    } else {
      onChange({ ...value, platforms: [...value.platforms, p] });
    }
  }

  function togglePosition(key: string) {
    onChange({
      ...value,
      positions: value.positions.includes(key)
        ? value.positions.filter((k) => k !== key)
        : [...value.positions, key],
    });
  }

  /** 선택 플랫폼에 속한 그 그룹의 위치들(펼침 표시 대상) */
  const visibleOf = (group: PlacementGroup) =>
    group.positions.filter((pos) => platformSelected(pos.platform));

  function toggleGroup(group: PlacementGroup) {
    const keys = visibleOf(group).map((pos) => pos.key);
    if (keys.length === 0) return;
    const allOn = keys.every((k) => value.positions.includes(k));
    onChange({
      ...value,
      positions: allOn
        ? value.positions.filter((k) => !keys.includes(k))
        : Array.from(new Set([...value.positions, ...keys])),
    });
  }

  const count = selectedCount(value);
  const belowMin = count < MIN_RECOMMENDED;

  const modes = [
    {
      mode: "advantage" as const,
      icon: Sparkles,
      title: "어드밴티지+ 노출 위치",
      recommended: true,
      desc: "예산을 극대화하고 성과 좋은 위치에 자동 노출",
    },
    {
      mode: "manual" as const,
      icon: SlidersHorizontal,
      title: "수동 노출 위치",
      recommended: false,
      desc: "노출 위치를 직접 선택",
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. 방식 선택 */}
      <div role="radiogroup" aria-label="노출 위치 방식" className="grid gap-2 sm:grid-cols-2">
        {modes.map(({ mode, icon: Icon, title, recommended, desc }) => {
          const on = value.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => chooseMode(mode)}
              className={cn(
                "flex items-start gap-3 rounded-card border p-3.5 text-left transition-colors",
                on ? "border-primary bg-primary-weak" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <Icon
                className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-fg-faint")}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-fg">
                  {title}
                  {recommended ? <Badge tone="primary">추천</Badge> : null}
                </span>
                <span className="mt-0.5 block text-xs text-fg-sub">{desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. 수동일 때만 노출 */}
      {value.mode === "manual" ? (
        <div className="space-y-4">
          {/* a. 플랫폼 */}
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-fg-sub">플랫폼</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="플랫폼 선택">
              {AD_PLATFORMS.map((p) => {
                const on = platformSelected(p);
                return (
                  <button
                    key={p}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => togglePlatform(p)}
                    className={cn(chipBase, on ? chipOn : chipOff)}
                  >
                    <PlatformIcon platform={p} className="size-3.5 shrink-0" />
                    {PLATFORM_LABEL[p]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* b. 노출 위치 (그룹 아코디언) */}
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-fg-sub">노출 위치</p>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {value.platforms.length === 0 ? (
                <p className="px-3 py-4 text-[13px] text-fg-faint">
                  플랫폼을 먼저 선택하면 노출 위치가 표시됩니다.
                </p>
              ) : (
                PLACEMENT_GROUPS.map((group) => {
                  const visible = visibleOf(group);
                  if (visible.length === 0) return null;
                  const keys = visible.map((pos) => pos.key);
                  const sel = keys.filter((k) => value.positions.includes(k)).length;
                  const allOn = sel === keys.length;
                  const someOn = sel > 0 && !allOn;
                  const opened = openGroup === group.key;
                  return (
                    <div key={group.key} className="border-b border-line last:border-b-0">
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          aria-expanded={opened}
                          onClick={() => setOpenGroup(opened ? null : group.key)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-fg-faint transition-transform",
                              opened && "rotate-180",
                            )}
                            aria-hidden
                          />
                          <span className="truncate text-[14px] font-semibold text-fg">
                            {group.label}
                          </span>
                          {sel > 0 ? (
                            <Badge tone="primary" className="tnum">
                              {sel}
                            </Badge>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={allOn ? true : someOn ? "mixed" : false}
                          aria-label={`${group.label} 전체 선택`}
                          onClick={() => toggleGroup(group)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-line px-2.5 py-1 text-xs font-semibold text-fg-sub transition-colors hover:border-line-strong hover:text-fg"
                        >
                          <span
                            className={cn(
                              "flex size-4 items-center justify-center rounded-[5px] border transition-colors",
                              allOn
                                ? "border-primary bg-primary text-on-primary"
                                : someOn
                                  ? "border-primary bg-primary-weak text-primary"
                                  : "border-line-strong",
                            )}
                            aria-hidden
                          >
                            {allOn ? (
                              <Check className="size-3" />
                            ) : someOn ? (
                              <Minus className="size-3" />
                            ) : null}
                          </span>
                          전체
                        </button>
                      </div>

                      {opened ? (
                        <div
                          className="flex flex-wrap gap-1.5 px-3 pb-3 pt-0.5"
                          role="group"
                          aria-label={`${group.label} 노출 위치`}
                        >
                          {visible.map((pos) => {
                            const on = value.positions.includes(pos.key);
                            return (
                              <button
                                key={pos.key}
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                onClick={() => togglePosition(pos.key)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-chip border px-3 py-1 text-xs font-medium transition-colors",
                                  on ? chipOn : chipOff,
                                )}
                              >
                                <PlatformIcon platform={pos.platform} className="size-3 shrink-0" />
                                {pos.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* c. 6개 미만 경고 */}
          {belowMin ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-card bg-warning-weak px-3.5 py-3 text-warning"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-[13px] font-medium">
                노출 위치를 6개 이상 포함하면 성과를 개선할 수 있습니다 (현재{" "}
                <span className="tnum">{count}</span>개)
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
