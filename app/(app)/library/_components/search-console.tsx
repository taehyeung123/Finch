"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AtSign,
  Hash,
  Megaphone,
  Bookmark,
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
import { INDUSTRY_LIST } from "@/lib/industry/list";
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
   * 업종 **id** 배열 — 라벨이 아니라 id 를 담는다(라벨은 언제든 바뀔 수 있고,
   * 바뀌는 순간 저장해 둔 필터 조합이 통째로 깨진다).
   *
   * categories 와 별도 축인 이유: 광고 화면에서 categories 는 이미 광고주(pageName)
   * 축으로 재사용되고 있다. 여기에 업종까지 얹으면 한 배열이 세 가지 뜻을 갖는다.
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

/** 업종 id → 라벨. 화면에 보여줄 때만 쓴다(저장은 항상 id) */
function industryLabelById(id: string): string {
  return INDUSTRY_LIST.find((i) => i.id === id)?.label ?? id;
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
  parts.push(...f.industries.map(industryLabelById), ...f.categories, ...f.hooks, ...f.sources);
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
  /* 플랫폼·업종이 필터 패널 안으로 들어갔으므로, 접힌 상태에서 무엇이 걸려 있는지는
     이 칩 줄이 유일한 단서다. 여기서 빠뜨리면 "왜 결과가 이것뿐이지"가 된다. */
  if (f.target !== "all") {
    chips.push({
      key: "target",
      label: TARGET_OPTIONS.find((o) => o.value === f.target)?.label ?? f.target,
      clear: (p) => ({ ...p, target: "all" }),
    });
  }
  for (const id of f.industries) {
    chips.push({
      key: `ind:${id}`,
      label: industryLabelById(id),
      clear: (p) => ({ ...p, industries: p.industries.filter((x) => x !== id) }),
    });
  }
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

/*
  구성 (스니핏 필터 카드 실측 이식, 2026-08-11)

  왼쪽 = "어디서 · 언제"          오른쪽 = "무엇을"
    · 수집 시기                     · 업종 카테고리 (고정 22개)
    · 플랫폼 (세그먼트 트랙)         · 후킹 기법 / 광고주
    · 플랫폼에 딸린 조건 (회색 판)

  플랫폼을 패널 밖에 두지 않는다. 밖에 두면 축이 두 군데로 흩어지고,
  "필터"를 눌러도 정작 제일 많이 쓰는 축은 거기 없다.
  지금 무엇을 보고 있는지는 상태 줄의 활성 칩이 대신 알려준다.

  색: 선택 표시에 코랄을 남발하지 않는다. 플랫폼 세그먼트의 선택은 흰 알약 + 미세 그림자로
  표현한다(배경 트랙이 회색이라 그것만으로 충분히 읽힌다). 코랄은 조건 칩과
  [지금 수집]에만 남긴다 — 칩 열 개가 전부 코랄이면 화면이 코랄 덩어리가 되고
  정작 눌러야 할 버튼이 묻힌다.
*/

/** 한 조건 묶음 — 라벨 + 내용. 모든 축이 같은 리듬을 갖게 하는 유일한 통로 */
function Field({
  label,
  hint,
  info,
  children,
}: {
  label: string;
  hint?: string;
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-fg">
        {label}
        {info ? <InfoTip>{info}</InfoTip> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-fg-faint">{hint}</p> : null}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** 선택 칩 — 이 패널의 유일한 선택 표현. 축마다 크기·모양이 달라지면 조잡해진다 */
function Chip({
  on,
  onClick,
  children,
  count,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "trans-state inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-chip border px-3.5 text-[13px]",
        on
          ? "border-primary bg-primary-weak font-semibold text-primary"
          : "border-line bg-body font-medium text-fg-sub hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
      {count !== undefined ? (
        <span className={cn("tnum text-[11px]", on ? "text-primary/70" : "text-fg-faint")}>{count}</span>
      ) : null}
    </button>
  );
}

/** 세그먼트 트랙 — 배타 선택 축(플랫폼) 전용. 회색 판 위에서 흰 알약이 움직인다 */
function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: SearchTarget; label: string }[];
  value: SearchTarget;
  onChange: (v: SearchTarget) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex w-full items-center gap-1 overflow-x-auto rounded-card bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "trans-state h-8 flex-1 shrink-0 cursor-pointer whitespace-nowrap rounded-card px-3 text-[13px]",
              on ? "bg-body font-bold text-fg shadow-pop" : "font-medium text-fg-sub hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterPanelBody({
  filters,
  setFilters,
  hookFacets,
  sourceFacets,
  advertiserFacets,
}: {
  filters: LibraryFilters;
  setFilters: (next: LibraryFilters) => void;
  hookFacets: Facet[];
  sourceFacets: SourceFacet[];
  advertiserFacets: Facet[];
}) {
  const [showAllSources, setShowAllSources] = useState(false);
  const isAds = filters.target === "ads";
  const visibleSources = showAllSources ? sourceFacets : sourceFacets.slice(0, 6);
  const hiddenSelected = sourceFacets.slice(6).filter((s) => filters.sources.includes(s.value)).length;

  return (
    <div className="grid gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
      {/* ── 왼쪽: 어디서 · 언제 ── */}
      <div className="space-y-6">
        <Field label="수집 시기">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="수집 시기 필터">
            {WITHIN_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                on={filters.within === o.value}
                onClick={() => setFilters({ ...filters, within: o.value })}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="플랫폼" hint="플랫폼을 고르면 아래 조건이 달라져요">
          <Segmented
            ariaLabel="플랫폼 필터"
            options={TARGET_OPTIONS}
            value={filters.target}
            onChange={(v) => setFilters({ ...filters, target: v })}
          />

          {/* 플랫폼에 딸린 조건 — 회색 판으로 묶어 "위 선택에 종속된 것"임을 형태로 말한다 */}
          <div className="mt-2.5 space-y-4 rounded-card bg-surface p-4">
            {sourceFacets.length > 0 ? (
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-sub">
                  수집 기준
                  {hiddenSelected > 0 ? (
                    <span className="tnum rounded-chip bg-primary-weak px-1.5 text-[11px] font-bold text-primary">
                      {hiddenSelected}
                    </span>
                  ) : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="수집 기준 필터">
                  {visibleSources.map((s) => (
                    <Chip
                      key={s.value}
                      on={filters.sources.includes(s.value)}
                      onClick={() => setFilters({ ...filters, sources: toggleIn(filters.sources, s.value) })}
                      count={s.count}
                    >
                      <SourceGlyph
                        kind={s.kind}
                        className={filters.sources.includes(s.value) ? "text-primary" : undefined}
                      />
                      <span className="max-w-[9rem] truncate">{s.value}</span>
                    </Chip>
                  ))}
                  {sourceFacets.length > 6 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllSources((v) => !v)}
                      className="h-9 cursor-pointer px-2 text-[12px] font-semibold text-fg-sub transition-colors hover:text-fg"
                    >
                      {showAllSources ? "접기" : `+${sourceFacets.length - 6}`}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div>
              <p className="text-[12px] font-semibold text-fg-sub">보기 옵션</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Chip on={filters.favOnly} onClick={() => setFilters({ ...filters, favOnly: !filters.favOnly })}>
                  즐겨찾기만
                </Chip>
                <Chip on={filters.overOnly} onClick={() => setFilters({ ...filters, overOnly: !filters.overOnly })}>
                  잘 나온 것만
                </Chip>
                <InfoTip>
                  같은 수집 기준으로 모인 콘텐츠의 평균 반응 대비 1.5배 이상인 항목만 봅니다. 핀치 자체 계산이에요.
                </InfoTip>
              </div>
            </div>
          </div>
        </Field>
      </div>

      {/* ── 오른쪽: 무엇을 ── */}
      <div className="space-y-6">
        {/* 업종 — **고정 목록이다. 데이터에서 뽑지 않는다.**
            예전에는 수집물의 AI 자동 분류를 그대로 칩으로 만들어서, 웨딩 자료가 많으면
            '웨딩드레스 4 · 웨딩촬영 2 · 웨딩케이크 1' 같은 잡동사니가 이 자리를 차지했다.
            업종은 데이터가 아니라 제품이 정하는 축이라, 언제 들어와도 같은 목록이
            같은 자리에 있어야 사용자가 외운다. */}
        <Field label="업종 카테고리">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="업종 필터">
            {INDUSTRY_LIST.map((ind) => (
              <Chip
                key={ind.id}
                on={filters.industries.includes(ind.id)}
                onClick={() => setFilters({ ...filters, industries: toggleIn(filters.industries, ind.id) })}
              >
                {ind.label}
              </Chip>
            ))}
          </div>
        </Field>

        {isAds ? (
          advertiserFacets.length > 0 ? (
            <Field label="광고주">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="광고주 필터">
                {advertiserFacets.slice(0, 12).map((a) => (
                  <Chip
                    key={a.name}
                    on={filters.categories.includes(a.name)}
                    onClick={() => setFilters({ ...filters, categories: toggleIn(filters.categories, a.name) })}
                    count={a.count}
                  >
                    <Megaphone
                      className={cn(
                        "size-3 shrink-0",
                        filters.categories.includes(a.name) ? "text-primary" : "text-fg-faint",
                      )}
                      aria-hidden
                    />
                    <span className="max-w-[10rem] truncate">{a.name}</span>
                  </Chip>
                ))}
              </div>
            </Field>
          ) : null
        ) : hookFacets.length > 0 ? (
          <Field
            label="후킹 기법"
            info="핀치 AI가 콘텐츠에서 추정한 후킹 기법이에요. 플랫폼 공식 데이터가 아닌 자체 추정치입니다."
          >
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="후킹 기법 필터">
              {hookFacets.map((h) => (
                <Chip
                  key={h.name}
                  on={filters.hooks.includes(h.name)}
                  onClick={() => setFilters({ ...filters, hooks: toggleIn(filters.hooks, h.name) })}
                  count={h.count}
                >
                  {h.name}
                </Chip>
              ))}
            </div>
          </Field>
        ) : null}
      </div>
    </div>
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
    /* 패널 머리 줄 오른쪽에 붙는다. 예전에는 패널 맨 아래 구분선 밑에 깔려 있었는데,
       거기까지 스크롤해야 보이니 "저장해 둔 조합"이 사실상 없는 기능이었다. */
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      {saved.map((combo, index) => (
        <span
          key={`${combo.name}-${index}`}
          className="inline-flex h-7 items-center overflow-hidden rounded-chip border border-line bg-body"
        >
          <button
            type="button"
            onClick={() => setFilters({ ...combo.filters })}
            title={combo.name}
            className="trans-state max-w-40 cursor-pointer truncate px-2.5 text-[12px] text-fg-sub hover:bg-surface hover:text-fg"
          >
            {combo.name}
          </button>
          <button
            type="button"
            onClick={() => writeSaved(saved.filter((_, i) => i !== index))}
            aria-label={`저장된 조합 삭제: ${combo.name}`}
            className="trans-state cursor-pointer self-stretch border-l border-line px-1.5 text-fg-faint hover:bg-surface hover:text-negative"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={saveCurrent}
        disabled={active === 0}
        className="trans-state inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-chip px-2.5 text-[12px] font-semibold text-fg-sub hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Bookmark className="size-3.5" aria-hidden />
        조합 저장
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
  hookFacets,
  sourceFacets,
  advertiserFacets,
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
  hookFacets: Facet[];
  sourceFacets: SourceFacet[];
  advertiserFacets: Facet[];
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
      {/* 패널 머리 줄 — 왼쪽에 안내·활성 개수·초기화, 오른쪽에 저장 조합.
          스니핏이 이 줄에서 "지금 몇 개가 걸려 있나"를 한 번에 보여준다. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[13px] text-fg-sub">
            조건을 조합해 정확한 레퍼런스를 찾아보세요
          </p>
          {activeCount > 0 ? (
            <>
              <span className="tnum inline-flex size-5 shrink-0 items-center justify-center rounded-chip bg-primary text-[11px] font-bold text-on-primary">
                {activeCount}
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="trans-state inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-chip px-2 py-1 text-[12px] font-semibold text-fg-sub hover:bg-surface hover:text-fg"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                필터 초기화
              </button>
            </>
          ) : null}
        </div>
        <SavedCombosRow filters={filters} setFilters={setFilters} />
      </div>

      <div className="mt-5">
        <FilterPanelBody
          filters={filters}
          setFilters={setFilters}
          hookFacets={hookFacets}
          sourceFacets={sourceFacets}
          advertiserFacets={advertiserFacets}
        />
      </div>
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
        {/* 검색 바. 높이 56px — 이 화면에서 가장 많이 쓰는 컨트롤이라 제일 커야 한다.
            필터 버튼은 세로 헤어라인 뒤에 둔다: 입력과 조작을 한 테두리 안에 두되
            역할이 다르다는 걸 선 하나로 말한다. 열려 있어도 코랄로 칠하지 않는다 —
            패널이 열린 건 이미 눈에 보이고, 코랄은 [지금 수집] 몫이다. */}
        <div className="flex h-14 min-w-0 flex-1 items-center rounded-card border border-line bg-body transition-colors focus-within:border-line-strong">
          <Search className="ml-4 size-5 shrink-0 text-fg-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="브랜드·문구·계정·해시태그로 찾기"
            aria-label="레퍼런스 검색"
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-faint"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="검색어 지우기"
              className="trans-state flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-chip text-fg-faint hover:bg-surface hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
          <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden />
          <button
            ref={filterBtnRef}
            type="button"
            aria-expanded={panelOpen}
            className={cn(
              "trans-state mr-2 inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-card px-3.5 text-[14px] font-semibold",
              panelOpen ? "bg-surface text-fg" : "text-fg-sub hover:bg-surface hover:text-fg",
            )}
            onClick={() => setPanelOpen((v) => !v)}
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
          className="trans-state flex h-14 w-12 shrink-0 cursor-pointer items-center justify-center rounded-card border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg"
        >
          <Settings2 className="size-[18px]" aria-hidden />
        </button>

        {/* (3) 지금 수집 */}
        <Button
          onClick={onCollect}
          disabled={collecting}
          aria-busy={collecting}
          className="h-14 shrink-0 px-4 md:px-5"
        >
          <Zap className="size-4" aria-hidden />
          <span className="hidden md:inline">{collecting ? "수집 중…" : "지금 수집"}</span>
        </Button>

        {/* 필터 패널 — 콘솔 줄에 앵커된 오버레이. 결과 그리드를 밀지 않는다 (lg 이상) */}
        {panelOpen ? (
          <div
            role="region"
            aria-label="상세 필터"
            className="absolute inset-x-0 top-full z-30 mt-2 hidden max-h-[68vh] overflow-y-auto rounded-card border border-line-strong bg-overlay p-6 shadow-pop lg:block"
          >
            {panelInner}
          </div>
        ) : null}
      </div>

      {/* 2행 — 상태 줄. 높이 36px 고정이라 필터를 걸고 풀어도 그리드가 안 움직인다.

          플랫폼·업종을 여기 밖에 따로 깔지 않는다. 축을 밖에 늘어놓으면 필터를 눌러도
          정작 제일 많이 쓰는 축은 거기 없고, 화면 위쪽이 칩 줄로 계속 두꺼워진다.
          지금 무엇이 걸려 있는지는 아래 활성 칩이 전부 말해 준다. */}
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
