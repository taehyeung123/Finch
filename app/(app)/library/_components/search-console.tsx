"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AtSign,
  Hash,
  Megaphone,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Type,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import type { ChannelFilter } from "@/lib/types";

/*
  복합 검색 콘솔 — 자사 뷰스코프(components/search/search-console.tsx, 2026-08-08
  "스니핏 벤치마크" 표준)를 핀치 토큰으로 이식한 것. 뷰스코프 DESIGN.md가
  "다른 검색 화면으로 확대할 때는 이 컴포넌트를 재사용할 것"이라고 못박은 표준이다.

  이식한 핵심 3가지:
  1) [대상 드롭다운 | 헤어라인 | 입력 | 필터] 를 테두리 하나로 묶은 복합 바
     — 인풋·필터버튼·정렬이 따로 놀던 구조를 대체한다.
  2) 필터 패널을 인라인 확장이 아니라 **바에 앵커된 absolute 오버레이**로 —
     패널을 열어도 결과 그리드가 아래로 밀리지 않는다(접힘선 위에 남는다).
  3) 필터 조합 저장(localStorage) + 원클릭 재적용.
     useSyncExternalStore로 구독해 setState-in-effect 없이, SSR 스냅샷은 빈 목록.

  핀치 고유 조정:
  - 활성 필터에 진한 bg-primary를 쓰지 않는다(bg-primary-weak + text-primary).
    칩이 10개 뜨면 화면이 코랄 덩어리가 되고 [지금 수집]이 묻힌다.
    같은 이유로 components/ui/chip-filter.tsx의 ChipFilter는 여기서 쓰지 않는다.
  - 상태 줄 높이를 h-9로 고정 — 필터를 걸고 풀어도 아래 그리드가 1px도 안 움직인다.
  - shadow-pop은 다크에서 none이므로 오버레이 테두리를 border-line-strong으로 승격.
*/

/* ---------------- 필터 상태 ---------------- */

/** 오가닉 채널 + 메타광고 — 메타광고는 Channel이 아니라 별도 축이라 유니온을 확장한다 */
export type SearchTarget = ChannelFilter | "ads";
export type CollectedWithin = "all" | "24h" | "7d" | "30d";
export type ItemSort = "views" | "likes" | "recent" | "posted";

/**
 * 배열로 둔다(Set 아님) — localStorage 저장 조합과 URL 직렬화가 그대로 되고,
 * 저장된 조합을 다시 적용할 때 변환 계층이 필요 없다.
 */
export interface LibraryFilters {
  target: SearchTarget;
  within: CollectedWithin;
  /**
   * 업종 — categories(수집 카테고리)와 별도 축이다.
   * 겹쳐 쓰지 않는 이유: 광고 화면에서 categories 는 이미 광고주(pageName) 축으로
   * 재사용되고 있다. 여기에 업종까지 얹으면 한 배열이 세 가지 뜻을 갖는다.
   */
  industries: string[];
  categories: string[];
  hooks: string[];
  sources: string[];
  favOnly: boolean;
  overOnly: boolean;
  sort: ItemSort;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  target: "all",
  within: "all",
  industries: [],
  categories: [],
  hooks: [],
  sources: [],
  favOnly: false,
  overOnly: false,
  sort: "views",
};

/** 업종 칩 하나 — 서버가 노출 자격을 통과한 업종만 내려준다 */
export interface IndustryFacet {
  id: string;
  label: string;
  count: number;
}

export interface Facet {
  name: string;
  count: number;
}

export interface SourceFacet {
  value: string;
  count: number;
  kind: string;
}

export const TARGET_OPTIONS: { value: SearchTarget; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "instagram", label: "인스타그램" },
  { value: "tiktok", label: "틱톡" },
  { value: "threads", label: "스레드" },
  { value: "ads", label: "메타광고" },
];

export const WITHIN_OPTIONS: { value: CollectedWithin; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "24h", label: "오늘 수집" },
  { value: "7d", label: "최근 1주" },
  { value: "30d", label: "최근 1개월" },
];

export const SORT_OPTIONS: { value: ItemSort; label: string }[] = [
  { value: "views", label: "반응 높은 순" },
  { value: "likes", label: "좋아요순" },
  { value: "recent", label: "최근 수집순" },
  { value: "posted", label: "게시 최신순" },
];

/** 정렬은 "조건"이 아니라 항상 켜져 있는 축이므로 활성 수에서 뺀다 */
export function countActiveFilters(f: LibraryFilters): number {
  return (
    (f.target !== "all" ? 1 : 0) +
    (f.within !== "all" ? 1 : 0) +
    f.industries.length +
    f.categories.length +
    f.hooks.length +
    f.sources.length +
    (f.favOnly ? 1 : 0) +
    (f.overOnly ? 1 : 0)
  );
}

/** 배열 토글 — 있으면 빼고 없으면 넣은 새 배열 */
function toggleIn(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/* ---------------- 저장된 필터 조합 (localStorage 외부 스토어) ---------------- */

interface SavedCombo {
  name: string;
  filters: LibraryFilters;
}

const SAVED_KEY = "finch:library:saved-filters:v1";
const SAVED_MAX = 8;

let savedCache: SavedCombo[] | null = null;
const savedListeners = new Set<() => void>();
const SAVED_EMPTY: SavedCombo[] = [];

function getSavedSnapshot(): SavedCombo[] {
  if (savedCache === null) {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      savedCache = Array.isArray(parsed) ? parsed.slice(0, SAVED_MAX) : [];
    } catch {
      savedCache = [];
    }
  }
  return savedCache;
}

function subscribeSaved(onChange: () => void) {
  savedListeners.add(onChange);
  return () => savedListeners.delete(onChange);
}

function writeSaved(next: SavedCombo[]) {
  savedCache = next;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    // 저장 공간 초과 등 — 목록은 메모리에서만 유지
  }
  savedListeners.forEach((l) => l());
}

/** 활성 조합을 사람이 읽는 이름으로 요약 — 저장 칩 라벨용 */
function describeFilters(f: LibraryFilters): string {
  const parts: string[] = [];
  if (f.target !== "all") parts.push(TARGET_OPTIONS.find((o) => o.value === f.target)?.label ?? f.target);
  if (f.within !== "all") parts.push(WITHIN_OPTIONS.find((o) => o.value === f.within)?.label ?? f.within);
  parts.push(...f.industries, ...f.categories, ...f.hooks, ...f.sources);
  if (f.favOnly) parts.push("즐겨찾기만");
  if (f.overOnly) parts.push("잘 나온 것만");
  return parts.slice(0, 4).join(" · ") || "기본 조합";
}

/* ---------------- 활성 필터 칩 (상태 줄) ---------------- */

interface ActiveChip {
  key: string;
  label: string;
  clear: (f: LibraryFilters) => LibraryFilters;
}

function buildActiveChips(f: LibraryFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  /* target(플랫폼)·업종은 전용 행이 상시 노출하므로 칩으로 중복 표시하지 않는다 */
  if (f.within !== "all") {
    chips.push({
      key: "within",
      label: WITHIN_OPTIONS.find((o) => o.value === f.within)?.label ?? f.within,
      clear: (p) => ({ ...p, within: "all" }),
    });
  }
  for (const c of f.categories) {
    chips.push({ key: `cat:${c}`, label: c, clear: (p) => ({ ...p, categories: p.categories.filter((x) => x !== c) }) });
  }
  for (const h of f.hooks) {
    chips.push({ key: `hook:${h}`, label: h, clear: (p) => ({ ...p, hooks: p.hooks.filter((x) => x !== h) }) });
  }
  for (const s of f.sources) {
    chips.push({
      key: `src:${s}`,
      label: `${s} 기준`,
      clear: (p) => ({ ...p, sources: p.sources.filter((x) => x !== s) }),
    });
  }
  if (f.favOnly) chips.push({ key: "fav", label: "즐겨찾기만", clear: (p) => ({ ...p, favOnly: false }) });
  if (f.overOnly) chips.push({ key: "over", label: "잘 나온 것만", clear: (p) => ({ ...p, overOnly: false }) });
  return chips;
}

/** 수집 기준 종류별 글리프 — 등록 칩 트랙·필터 리스트 공용 */
function SourceGlyph({ kind, className }: { kind: string; className?: string }) {
  const cls = cn("size-3 shrink-0 text-fg-faint", className);
  if (kind === "account") return <AtSign className={cls} aria-hidden />;
  if (kind === "hashtag") return <Hash className={cls} aria-hidden />;
  return <Type className={cls} aria-hidden />;
}

/* ---------------- 필터 패널 본문 (오버레이·시트 공용) ---------------- */

function FilterPanelBody({
  filters,
  setFilters,
  categoryFacets,
  hookFacets,
  sourceFacets,
  advertiserFacets,
}: {
  filters: LibraryFilters;
  setFilters: (next: LibraryFilters) => void;
  categoryFacets: Facet[];
  hookFacets: Facet[];
  sourceFacets: SourceFacet[];
  advertiserFacets: Facet[];
}) {
  const [showAllSources, setShowAllSources] = useState(false);
  const isAds = filters.target === "ads";
  const visibleSources = showAllSources ? sourceFacets : sourceFacets.slice(0, 8);

  /* 접힌 목록 안에 선택이 남아 있으면 헤더에 개수 배지 — 안 그러면 '왜 안 걸리지'가 된다 */
  const hiddenSelected = sourceFacets
    .slice(8)
    .filter((s) => filters.sources.includes(s.value)).length;

  return (
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
      <div className="space-y-5">
        {/* 축 1 — 수집 시기 (단일선택이라 사각 칩) */}
        <div>
          <GroupLabel>수집 시기</GroupLabel>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="수집 시기 필터">
            {WITHIN_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={filters.within === o.value}
                onClick={() => setFilters({ ...filters, within: o.value })}
                className={cn(
                  "h-8 cursor-pointer rounded-card border px-4 text-[13px] font-medium transition-colors",
                  filters.within === o.value
                    ? "border-primary bg-primary-weak font-semibold text-primary"
                    : "border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 축 2 — 수집 기준 (다중, 값 가변 → 리스트 행 + 건수) */}
        {sourceFacets.length > 0 ? (
          <div>
            <GroupLabel badge={hiddenSelected > 0 ? hiddenSelected : undefined}>수집 기준</GroupLabel>
            <ul className="mt-2 space-y-0.5" aria-label="수집 기준 필터">
              {visibleSources.map((s) => {
                const on = filters.sources.includes(s.value);
                return (
                  <li key={s.value}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilters({ ...filters, sources: toggleIn(filters.sources, s.value) })}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-card px-2 py-1.5 text-left text-[13px] transition-colors",
                        on ? "bg-primary-weak font-semibold text-primary" : "text-fg-sub hover:bg-overlay hover:text-fg",
                      )}
                    >
                      <SourceGlyph kind={s.kind} className={on ? "text-primary" : undefined} />
                      <span className="min-w-0 flex-1 truncate">{s.value}</span>
                      <span className={cn("tnum shrink-0 text-[12px]", on ? "text-primary" : "text-fg-faint")}>
                        {s.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {sourceFacets.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAllSources((v) => !v)}
                className="mt-1 cursor-pointer px-2 text-[12px] font-semibold text-fg-sub transition-colors hover:text-fg"
              >
                {showAllSources ? "접기" : `+${sourceFacets.length - 8}개 더 보기`}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* 축 5 — 보기 옵션 (on/off 토글 행) */}
        <div>
          <GroupLabel>보기 옵션</GroupLabel>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <ToggleRow
              on={filters.favOnly}
              onClick={() => setFilters({ ...filters, favOnly: !filters.favOnly })}
              label="즐겨찾기만"
            />
            <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
            <ToggleRow
              on={filters.overOnly}
              onClick={() => setFilters({ ...filters, overOnly: !filters.overOnly })}
              label="기준 대비 잘 나온 것만"
              info="같은 수집 기준으로 모인 콘텐츠의 평균 반응 대비 1.5배 이상인 항목만 봅니다. 핀치 자체 계산이에요."
            />
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* 대상이 메타광고면 카테고리·후킹 대신 광고주·게재 상태 */}
        {isAds ? (
          advertiserFacets.length > 0 ? (
            <div>
              <GroupLabel>광고주</GroupLabel>
              <ul className="mt-2 space-y-0.5" aria-label="광고주 필터">
                {advertiserFacets.slice(0, 10).map((a) => {
                  const on = filters.categories.includes(a.name);
                  return (
                    <li key={a.name}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setFilters({ ...filters, categories: toggleIn(filters.categories, a.name) })}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-card px-2 py-1.5 text-left text-[13px] transition-colors",
                          on ? "bg-primary-weak font-semibold text-primary" : "text-fg-sub hover:bg-overlay hover:text-fg",
                        )}
                      >
                        <Megaphone className={cn("size-3 shrink-0", on ? "text-primary" : "text-fg-faint")} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        <span className={cn("tnum shrink-0 text-[12px]", on ? "text-primary" : "text-fg-faint")}>
                          {a.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null
        ) : (
          <>
            {/* 축 3 — 카테고리 (다중, 알약 칩 + 건수) */}
            {categoryFacets.length > 0 ? (
              <div>
                <GroupLabel hint="AI 자동 분류">카테고리</GroupLabel>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="카테고리 필터">
                  {categoryFacets.map((c) => (
                    <FacetChip
                      key={c.name}
                      facet={c}
                      on={filters.categories.includes(c.name)}
                      onClick={() => setFilters({ ...filters, categories: toggleIn(filters.categories, c.name) })}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* 축 4 — 후킹 기법 (다중, 알약 칩 + 건수) */}
            {hookFacets.length > 0 ? (
              <div>
                <GroupLabel info="핀치 AI가 콘텐츠에서 추정한 후킹 기법이에요. 플랫폼 공식 데이터가 아닌 자체 추정치입니다.">
                  후킹 기법
                </GroupLabel>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="후킹 기법 필터">
                  {hookFacets.map((h) => (
                    <FacetChip
                      key={h.name}
                      facet={h}
                      on={filters.hooks.includes(h.name)}
                      onClick={() => setFilters({ ...filters, hooks: toggleIn(filters.hooks, h.name) })}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function GroupLabel({
  children,
  hint,
  info,
  badge,
}: {
  children: React.ReactNode;
  hint?: string;
  info?: string;
  badge?: number;
}) {
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg-sub">
      {children}
      {hint ? <span className="font-normal text-fg-faint">— {hint}</span> : null}
      {info ? <InfoTip>{info}</InfoTip> : null}
      {badge ? (
        <span className="tnum rounded-chip bg-primary-weak px-2 text-[11px] font-bold text-primary">{badge}</span>
      ) : null}
    </p>
  );
}

function FacetChip({ facet, on, onClick }: { facet: Facet; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1 rounded-chip border px-3 text-[13px] font-medium transition-colors",
        on
          ? "border-primary bg-primary-weak font-semibold text-primary"
          : facet.count === 0
            ? "border-line bg-body text-fg-faint hover:border-line-strong"
            : "border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
      )}
    >
      {facet.name}
      <span className="tnum text-[11px] opacity-60">{facet.count}</span>
    </button>
  );
}

function ToggleRow({
  on,
  onClick,
  label,
  info,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  info?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-pressed={on}
        onClick={onClick}
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-chip border px-3 text-[13px] font-medium transition-colors",
          on
            ? "border-primary bg-primary-weak font-semibold text-primary"
            : "border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
        )}
      >
        {label}
      </button>
      {info ? <InfoTip>{info}</InfoTip> : null}
    </span>
  );
}

/* ---------------- 저장된 조합 줄 ---------------- */

function SavedCombosRow({
  filters,
  setFilters,
}: {
  filters: LibraryFilters;
  setFilters: (next: LibraryFilters) => void;
}) {
  const saved = useSyncExternalStore(subscribeSaved, getSavedSnapshot, () => SAVED_EMPTY);
  const active = countActiveFilters(filters);

  function saveCurrent() {
    if (active === 0) return;
    const signature = JSON.stringify(filters);
    if (saved.some((c) => JSON.stringify(c.filters) === signature)) return;
    writeSaved([{ name: describeFilters(filters), filters }, ...saved].slice(0, SAVED_MAX));
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
      <span className="text-[12px] font-semibold text-fg-faint">저장된 조합</span>
      {saved.map((combo, index) => (
        <span
          key={`${combo.name}-${index}`}
          className="inline-flex items-center overflow-hidden rounded-chip border border-line bg-body"
        >
          <button
            type="button"
            onClick={() => setFilters({ ...combo.filters })}
            title={combo.name}
            className="max-w-56 cursor-pointer truncate px-3 py-1 text-[12px] text-fg-sub transition-colors hover:bg-overlay hover:text-fg"
          >
            {combo.name}
          </button>
          <button
            type="button"
            onClick={() => writeSaved(saved.filter((_, i) => i !== index))}
            aria-label={`저장된 조합 삭제: ${combo.name}`}
            className="cursor-pointer self-stretch border-l border-line px-1.5 text-fg-faint transition-colors hover:bg-overlay hover:text-negative"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={saveCurrent}
        disabled={active === 0}
        className="inline-flex cursor-pointer items-center gap-1 rounded-chip border border-line bg-body px-3 py-1 text-[12px] font-medium text-fg-sub transition-colors hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-3" aria-hidden />
        현재 조합 저장
      </button>
    </div>
  );
}

/* ---------------- 콘솔 본체 ---------------- */

export function SearchConsole({
  query,
  onQueryChange,
  filters,
  setFilters,
  resultCount,
  hasQuery,
  categoryFacets,
  hookFacets,
  sourceFacets,
  advertiserFacets,
  industryFacets,
  registeredSources,
  onOpenSettings,
  onCollect,
  collecting,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  filters: LibraryFilters;
  setFilters: (next: LibraryFilters) => void;
  resultCount: number;
  hasQuery: boolean;
  categoryFacets: Facet[];
  hookFacets: Facet[];
  sourceFacets: SourceFacet[];
  advertiserFacets: Facet[];
  /** 노출 자격을 통과한 업종. 비어 있으면 행 자체를 그리지 않는다 — 빈 줄은 미완성으로 읽힌다 */
  industryFacets: IndustryFacet[];
  registeredSources: { id: string; value: string; kind: string }[];
  onOpenSettings: () => void;
  onCollect: () => void;
  collecting: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const activeCount = countActiveFilters(filters);
  const activeChips = buildActiveChips(filters);

  /* 바깥 클릭·Escape — 비모달이라 포커스 트랩은 걸지 않는다(뒤 결과를 보며 조작) */
  useEffect(() => {
    if (!panelOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPanelOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPanelOpen(false);
        filterBtnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panelOpen]);

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
  }, [setFilters, filters.sort]);

  const panelInner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-fg-sub">조건을 조합해 정확한 레퍼런스를 찾아보세요</p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-chip px-3 py-1 text-[12px] font-semibold text-fg-sub transition-colors hover:bg-overlay hover:text-fg"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            초기화
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        <FilterPanelBody
          filters={filters}
          setFilters={setFilters}
          categoryFacets={categoryFacets}
          hookFacets={hookFacets}
          sourceFacets={sourceFacets}
          advertiserFacets={advertiserFacets}
        />
      </div>
      <SavedCombosRow filters={filters} setFilters={setFilters} />
    </>
  );

  return (
    <header
      className={cn(
        "sticky top-16 z-20 -mx-4 -mt-6 border-b border-line bg-surface/95 px-4 pb-3 pt-3 backdrop-blur",
        "md:-mx-6 md:px-6",
      )}
    >
      <h2 className="sr-only">레퍼런스 검색</h2>

      {/* 1행 — 콘솔 줄. relative는 여기에만(필터 패널 앵커) */}
      <div ref={rootRef} className="relative flex items-center gap-2">
        {/* (1) 복합 콘솔 박스 — 이 화면의 유일한 테두리 컨트롤.
            검색 대상(플랫폼)은 2행 세그먼트 탭으로 내렸다. 드롭다운으로 두면
            지금 무엇을 보고 있는지가 접힌 채라 매번 열어봐야 알 수 있다. */}
        <div className="flex h-12 min-w-0 flex-1 items-center rounded-card border border-line bg-body focus-within:border-line-strong">
          <Search className="ml-3.5 size-[18px] shrink-0 text-fg-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="제목·요약·계정·해시태그로 찾기"
            aria-label="수집한 레퍼런스 검색"
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[16px] font-medium text-fg outline-none placeholder:text-fg-faint"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="검색어 지우기"
              className="trans-state flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-chip text-fg-faint hover:bg-overlay hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
          <button
            ref={filterBtnRef}
            type="button"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
            className={cn(
              "trans-state mx-2 inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-card px-3.5 text-[14px] font-semibold",
              panelOpen || activeCount > 0 ? "bg-primary-weak text-primary" : "text-fg-sub hover:bg-overlay hover:text-fg",
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">필터</span>
            {activeCount > 0 ? (
              <span className="tnum flex size-5 items-center justify-center rounded-chip bg-primary text-[11px] font-bold text-on-primary">
                {activeCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* (2) 수집 설정 — 현행 카드 3장의 유일한 진입점 */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="수집 설정"
          title="수집 기준·메타광고 검색어·수집 옵션"
          className="trans-state flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-card border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg"
        >
          <Settings2 className="size-[18px]" aria-hidden />
        </button>

        {/* (3) 지금 수집 */}
        <Button
          onClick={onCollect}
          disabled={collecting}
          aria-busy={collecting}
          className="h-12 shrink-0 px-4 md:px-5"
        >
          <Zap className="size-4" aria-hidden />
          <span className="hidden md:inline">{collecting ? "수집 중…" : "지금 수집"}</span>
        </Button>

        {/* 필터 패널 — 콘솔 줄에 앵커된 오버레이. 결과 그리드를 밀지 않는다 (lg 이상) */}
        {panelOpen ? (
          <div
            role="region"
            aria-label="상세 필터"
            className="absolute inset-x-0 top-full z-30 mt-2 hidden max-h-[60vh] overflow-y-auto rounded-card border border-line-strong bg-overlay p-5 shadow-pop lg:block"
          >
            {panelInner}
          </div>
        ) : null}
      </div>

      {/* 2행 — 플랫폼 세그먼트. 지금 무엇을 보고 있는지가 접히지 않고 항상 보인다.
          드롭다운이던 걸 여기로 내려서 1행이 검색 하나에만 집중하게 됐다. */}
      <div className="mt-2 flex h-9 items-center gap-1" role="tablist" aria-label="검색 대상">
        {TARGET_OPTIONS.map((o) => {
          const on = filters.target === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilters({ ...filters, target: o.value })}
              className={cn(
                "trans-state h-8 shrink-0 cursor-pointer rounded-chip px-3.5 text-[13px] font-semibold",
                on ? "bg-primary-weak text-primary" : "text-fg-sub hover:bg-overlay hover:text-fg",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* 3행 — 업종. 스니핏의 태그 줄에 해당하는 축이다. 검색어를 떠올리지 못한 사람이
          곧바로 누를 수 있는 입구라, 검색창 바로 아래에 두는 게 맞다.
          자격 미달 업종은 서버에서 이미 걸러져 오므로 여기서 count를 다시 검사하지 않는다. */}
      {industryFacets.length > 0 ? (
        <div
          className="mt-1.5 flex h-9 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="업종"
        >
          <button
            type="button"
            onClick={() => setFilters({ ...filters, industries: [] })}
            aria-pressed={filters.industries.length === 0}
            className={cn(
              "trans-state h-7 shrink-0 cursor-pointer rounded-chip px-3 text-[13px] font-semibold",
              filters.industries.length === 0
                ? "bg-fg text-body"
                : "border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
            )}
          >
            전체 업종
          </button>
          {industryFacets.map((f) => {
            const on = filters.industries.includes(f.label);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilters({ ...filters, industries: toggleIn(filters.industries, f.label) })}
                aria-pressed={on}
                className={cn(
                  "trans-state inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-chip px-3 text-[13px] font-semibold",
                  on
                    ? "bg-primary-weak text-primary"
                    : "border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
                )}
              >
                {f.label}
                <span className={cn("tnum text-[11px] font-medium", on ? "text-primary/70" : "text-fg-faint")}>
                  {f.count > 999 ? `${Math.floor(f.count / 1000)}k` : f.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 4행 — 상태 줄. 높이 36px 고정이라 필터를 걸고 풀어도 그리드가 안 움직인다 */}
      <div className="mt-1 flex h-9 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeChips.length > 0 ? (
            <>
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-chip bg-primary-weak px-3 text-[13px] font-semibold text-primary"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => setFilters(chip.clear(filters))}
                    aria-label={`${chip.label} 조건 해제`}
                    className="cursor-pointer text-primary/70 transition-colors hover:text-primary"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  resetFilters();
                }}
                className="shrink-0 cursor-pointer rounded-chip px-3 text-[13px] font-semibold text-fg-sub transition-colors hover:bg-overlay hover:text-fg"
              >
                전체 해제
              </button>
            </>
          ) : (
            /* 조건이 없을 때는 내가 등록한 수집 기준 트랙 — 클릭 = 그 기준으로 좁히기 */
            registeredSources.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setFilters({ ...filters, sources: toggleIn(filters.sources, s.value) })}
                className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-chip border border-line bg-body px-3 text-[13px] font-medium text-fg-sub transition-colors hover:border-line-strong hover:text-fg"
              >
                <SourceGlyph kind={s.kind} />
                {s.value}
              </button>
            ))
          )}
          {activeChips.length === 0 && registeredSources.length > 0 ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-chip px-3 text-[13px] font-medium text-fg-faint transition-colors hover:bg-overlay hover:text-fg"
            >
              <Plus className="size-3" aria-hidden />
              기준 추가
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {hasQuery ? (
            <span className="tnum text-[13px] text-fg-sub" aria-live="polite">
              {resultCount}건
            </span>
          ) : null}
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value as ItemSort })}
            aria-label="정렬"
            className="h-8 cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-fg-sub outline-none transition-colors hover:text-fg"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 모바일·태블릿 필터 — 하단 시트 (lg 미만). 오버레이와 같은 본문을 재사용 */}
      {panelOpen ? (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setPanelOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="상세 필터"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-card border-t border-line-strong bg-overlay"
          >
            <div className="flex-1 overflow-y-auto p-5">{panelInner}</div>
            <div className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-overlay px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
              <Button variant="secondary" onClick={resetFilters} className="flex-1">
                초기화
              </Button>
              <Button onClick={() => setPanelOpen(false)} className="flex-1">
                <span className="tnum">{resultCount}건</span> 보기
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
