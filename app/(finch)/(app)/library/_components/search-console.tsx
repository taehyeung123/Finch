"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeftRight,
  AtSign,
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  Hash,
  LayoutGrid,
  Megaphone,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tag,
  Type,
  X,
  Zap,
} from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { INDUSTRY_LIST } from "@/lib/industry/list";
import type { ChannelFilter } from "@/lib/types";

/*
  검색 콘솔 — 스니핏 **실측 이식** (2026-08-11, 로그인 상태의 실제 DOM 을 계측).
  이전까지는 스크린샷을 보고 짐작해서 세 번 틀렸다. 아래는 전부 잰 값이다.

  구조 (뷰포트 1920 기준)
    검색 줄 = 박스 두 개가 **붙어서** 한 줄
      [검색 기준 220x72] [검색 입력 1277x72]      ← 사이 간격 0
    필터 패널 = 검색 줄 바로 아래 **떠 있는 층**
      position:absolute · z-index 250 · 바 아래 10px
      카드 좌변은 검색 입력 박스에 맞고(검색 기준 220 + 간격 12), 우변은 바와 같다

  카드
    radius 12 · border 1px · shadow 0 0 16px rgba(107,110,116,.16) · padding 16
    두 열 사이 간격 64

  칩 (기간·업종 전부 같은 규격)
    높이 28 · radius 8 · border 1px · padding 0 20 · font 14/400 · 칩 간격 8

  여는 동작
    **검색창에 포커스가 가면 열린다.** 별도 버튼을 찾아 누르는 게 아니다.
  여는 모션
    **opacity 0.15s ease 하나뿐이다.** 슬라이드도 스케일도 없다.
    (내가 넣었던 translate+scale 은 스니핏에 없는 것이고, 그래서 더 무거워 보였다.)

  핀치가 다르게 가는 축은 색 하나다 — 업종 22개를 5개 대분류 색으로 나눈다.
  radius 12 는 우리 토큰(8/32 두 단계) 밖이라 rounded-card(8)로 맞춘다.
*/

/* ---------------- 필터 상태 ---------------- */

/** 오가닉 채널 + 메타광고 — 메타광고는 Channel이 아니라 별도 축이라 유니온을 확장한다 */
export type SearchTarget = ChannelFilter | "ads";
export type CollectedWithin = "all" | "24h" | "7d" | "30d";
export type ItemSort = "views" | "likes" | "recent" | "posted";

/**
 * 숫자 조건. null 이면 조건 없음이다 — "0 이상"으로 두면 아무것도 안 거르면서
 * 활성 필터로 세어져 "2개 걸림"인데 결과가 그대로인 상태가 된다.
 */
export type MetricFilter = { mode: "gte" | "lte" | "between"; min: number; max: number } | null;

export const METRIC_MODES: { value: NonNullable<MetricFilter>["mode"]; label: string }[] = [
  { value: "gte", label: "이상" },
  { value: "lte", label: "이하" },
  { value: "between", label: "범위" },
];

/** 검색이 무엇을 훑을지. 대본은 수집해 둔 것만 대상이라 별도 축으로 둔다 */
export type SearchScope = "text" | "transcript";

export const SCOPE_OPTIONS: { value: SearchScope; label: string; desc: string }[] = [
  { value: "text", label: "문구·계정", desc: "제목·본문·해시태그·계정명" },
  { value: "transcript", label: "영상 대본", desc: "추출해 둔 릴스 대본 안에서" },
];

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
  /** 검색어가 훑을 대상 */
  scope: SearchScope;
  /** 숫자 조건 — 오가닉 전용(광고는 반응 지표가 공개되지 않는다) */
  views: MetricFilter;
  likes: MetricFilter;
  comments: MetricFilter;
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
  scope: "text",
  views: null,
  likes: null,
  comments: null,
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
    (f.views ? 1 : 0) +
    (f.likes ? 1 : 0) +
    (f.comments ? 1 : 0) +
    f.categories.length +
    f.hooks.length +
    f.sources.length +
    (f.favOnly ? 1 : 0) +
    (f.overOnly ? 1 : 0)
  );
}

/** 숫자 조건을 사람이 읽는 한 줄로 — 활성 칩 라벨용 */
function describeMetric(m: NonNullable<MetricFilter>): string {
  if (m.mode === "between") return `${m.min.toLocaleString()}~${m.max.toLocaleString()}`;
  return `${m.min.toLocaleString()} ${m.mode === "gte" ? "이상" : "이하"}`;
}

/** 업종 id → 라벨. 화면에 보여줄 때만 쓴다(저장은 항상 id) */
function industryLabelById(id: string): string {
  return INDUSTRY_LIST.find((i) => i.id === id)?.label ?? id;
}

/**
 * 추천 검색어 — 검색 줄 바로 아래 칩 (스니핏 실측: 알약 · 높이 30 · 흰 배경 + 연테두리).
 * 라벨은 사람이 읽는 말, q 는 실제로 풀에 잘 걸리는 짧은 토큰이다 —
 * "8월 여름세일"을 통째로 검색하면 0건이지만 "세일"은 광고 문구 어디에나 있다.
 */
/* ⚠️ 칩은 **눌렀을 때 결과가 나와야 한다.** 예전 다섯 개 중 넷(세일·신제품·특가·이벤트)이
   목 데이터 어디에도 없어서 「지금 조건에 맞는 레퍼런스가 없어요」로 떨어졌다(실측).
   처음 들어온 사람이 가장 먼저 누르는 자리에서 네 번 연속 빈 화면을 보면 «자료가 없는 서비스»가 된다.
   지금 토큰은 데모 목 데이터에 실제로 걸리는 것들이고, 실제 풀에서도 흔한 말이다. */
const SUGGESTED_QUERIES: { label: string; q: string; icon: "sun" | "sparkles" | "tag" | "compare" }[] = [
  { label: "여름 시즌", q: "여름", icon: "sun" },
  { label: "제품 비교", q: "비교", icon: "compare" },
  { label: "리뷰 콘텐츠", q: "리뷰", icon: "sparkles" },
  { label: "할인·프로모션", q: "할인", icon: "tag" },
  { label: "수분·보습", q: "수분", icon: "tag" },
];

function SuggestIcon({ kind }: { kind: string }) {
  const cls = "size-3.5 shrink-0 text-fg-faint";
  if (kind === "sun") return <Sun className={cls} aria-hidden />;
  if (kind === "sparkles") return <Sparkles className={cls} aria-hidden />;
  if (kind === "compare") return <ArrowLeftRight className={cls} aria-hidden />;
  return <Tag className={cls} aria-hidden />;
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
  if (f.favOnly) parts.push("스크랩만");
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
  for (const [key, label] of [
    ["views", "조회수"],
    ["likes", "좋아요"],
    ["comments", "댓글"],
  ] as const) {
    const m = f[key];
    if (!m) continue;
    chips.push({
      key: `m:${key}`,
      label: `${label} ${describeMetric(m)}`,
      clear: (p) => ({ ...p, [key]: null }),
    });
  }
  if (f.favOnly) chips.push({ key: "fav", label: "스크랩만", clear: (p) => ({ ...p, favOnly: false }) });
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

/* ---------------- 필터 패널 본문 ---------------- */

/*
  스니핏 필터 카드를 구조 그대로 옮기고, 색만 우리 것으로 다시 짰다 (2026-08-11).

  구조 (스니핏과 1:1)
    왼쪽 "어디서 · 언제"            오른쪽 "무엇을"
      · 수집 시기 (기간 칩)            · 업종 카테고리 (고정 22개)
      · 플랫폼 (브랜드 로고 세그먼트)   · 후킹 기법 / 광고주
      · 플랫폼에 딸린 조건 (회색 판)
          라벨 왼쪽 / 컨트롤 오른쪽 2단 행
          조회수·좋아요·댓글 = 숫자 입력 + [이상·이하·범위]

  색 (스니핏과 다르게 간 유일한 축)
    스니핏은 전부 회색 칩에 파란 선택색 하나다. 우리는 업종 22개를 5개 대분류 색으로
    나눈다 — 장식이 아니라 분류다. 같은 색 = 같은 대분류라서 22개를 훑을 때
    "이 근처가 리빙 쪽"이 눈으로 잡힌다. 회색 칩 22개는 벽이고, 벽은 안 읽힌다.
    코랄은 선택 상태와 [지금 수집]에만 남긴다. 대분류 색은 넓고 옅게, 코랄은 좁고 진하게 —
    면적과 채도를 반대로 나누기 때문에 색이 많아도 시선은 코랄로 간다.

  적용 시점
    패널 안 조작은 **초안**이다. [필터 적용]을 눌러야 결과가 바뀐다.
    칩 하나 누를 때마다 아래가 갈아엎히면 조건을 조합하는 동안 화면이 계속 흔들린다.
*/

/** 업종 대분류 → 색 클래스. globals.css 의 .tint-* 와 짝이다 */
const GROUP_TINT: Record<string, string> = {
  beauty_fashion: "tint-rose",
  food_health: "tint-green",
  living_home: "tint-teal",
  service_local: "tint-violet",
  digital_finance: "tint-blue",
};

/** 플랫폼 세그먼트의 브랜드 마크 — 이 줄이 패널에서 가장 색이 강한 자리다 */
function TargetGlyph({ value, on }: { value: SearchTarget; on: boolean }) {
  const dim = on ? "" : "opacity-70";
  if (value === "instagram") return <InstagramGlyph className={cn("size-3.5 text-ig", dim)} />;
  if (value === "tiktok") return <TiktokGlyph className={cn("size-3.5 text-fg", dim)} />;
  if (value === "threads") return <ThreadsGlyph className={cn("size-3.5 text-fg", dim)} />;
  if (value === "ads") return <Megaphone className={cn("size-3.5 text-meta", dim)} aria-hidden />;
  return <LayoutGrid className={cn("size-3.5 text-fg-faint", dim)} aria-hidden />;
}

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
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <p className="flex items-center gap-1.5 text-[15px] font-bold text-fg">
          {label}
          {info ? <InfoTip>{info}</InfoTip> : null}
        </p>
        {/* 힌트는 회색 잔글씨가 아니라 **포인트 컬러**다(스니핏 실측 — 강조색 14px).
            "여기서 뭔가 달라진다"는 안내는 눈에 띄어야 안내다. */}
        {hint ? (
          <p className="flex items-center gap-1 text-[12px] font-medium text-primary">
            <Sparkles className="size-3 shrink-0" aria-hidden />
            {hint}
          </p>
        ) : null}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/**
 * 선택 칩. 모서리는 rounded-card(8px) — 알약(32px)을 쓰면 글자가 길수록 좌우 여백이
 * 과장돼 22개가 늘어섰을 때 줄이 안 맞는다. 카드·버튼과 같은 8px이라 규칙도 유지된다.
 */
function Chip({
  on,
  onClick,
  children,
  count,
  tint,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  /** 대분류 색 클래스. 없으면 중립 */
  tint?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "trans-state inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-card border px-5 text-[15px]",
        on
          ? "border-primary bg-primary-weak font-semibold text-primary"
          : tint
            ? cn("border-transparent font-medium", tint)
            : "border-line bg-body font-medium text-fg-sub hover:border-line-strong hover:text-fg",
      )}
    >
      {/* 선택을 색으로만 말하지 않는다 — 색각 이상이나 흑백 인쇄에서도 읽혀야 한다 */}
      {on ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
      {children}
      {count !== undefined ? (
        <span className={cn("tnum text-[11px]", on ? "text-primary/70" : "opacity-60")}>{count}</span>
      ) : null}
    </button>
  );
}

/**
 * 세그먼트 트랙 — 흰 알약이 선택지로 **미끄러져 간다** (스니핏 실측:
 * transition: transform 0.2s, width 0.2s). 배경색만 뚝 바뀌면 "바뀌었다"는 알아도
 * "옮겨갔다"는 못 읽는다 — 이동감이 곧 이 컨트롤의 문법이다.
 *
 * 썸 위치는 React 상태가 아니라 DOM 스타일로 직접 쓴다.
 * 상태로 두면 effect 안 setState 가 되어 lint(react-hooks/set-state-in-effect)에
 * 걸리고, 굳이 리렌더를 태울 이유도 없다 — 움직이는 건 장식 요소 하나다.
 */
function TargetSegmented({
  value,
  onChange,
}: {
  value: SearchTarget;
  onChange: (v: SearchTarget) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef(new Map<SearchTarget, HTMLButtonElement>());

  useEffect(() => {
    const move = () => {
      const btn = btnRefs.current.get(value);
      const thumb = thumbRef.current;
      if (!btn || !thumb) return;
      thumb.style.transform = `translateX(${btn.offsetLeft}px)`;
      thumb.style.width = `${btn.offsetWidth}px`;
      thumb.style.opacity = "1";
    };
    move();
    // 컨테이너 폭이 바뀌면(패널 열림 직후 측정 0 포함) 다시 잰다
    const ro = new ResizeObserver(move);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [value]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label="플랫폼 필터"
      className="relative flex w-full items-center gap-0.5 overflow-x-auto rounded-t-card bg-plate p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span ref={thumbRef} className="seg-thumb" aria-hidden />
      {TARGET_OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              if (el) btnRefs.current.set(o.value, el);
            }}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 inline-flex h-8 flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-card px-2.5 text-[14px] transition-colors duration-200",
              on ? "font-bold text-fg" : "font-medium text-fg-sub hover:text-fg",
            )}
          >
            <TargetGlyph value={o.value} on={on} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 라벨 왼쪽 / 컨트롤 오른쪽 — 회색 판 안의 모든 행이 이 형태를 쓴다 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="w-[4.5rem] shrink-0 text-[12px] font-semibold text-fg-sub">{label}</p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** 숫자 조건 한 줄 — [입력] + [이상·이하·범위]. 값이 0이면 조건 없음이다 */
function MetricRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MetricFilter;
  onChange: (next: MetricFilter) => void;
}) {
  const mode = value?.mode ?? "gte";
  const min = value?.min ?? 0;
  const max = value?.max ?? 0;

  const commit = (patch: Partial<NonNullable<MetricFilter>>) => {
    const next = { mode, min, max, ...patch };
    // 값이 전부 0이면 조건 자체를 끈다 — "0 이상"은 아무것도 안 거르면서 활성으로 세어진다
    onChange(next.min === 0 && next.max === 0 ? null : next);
  };

  return (
    <Row label={label}>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={min || ""}
        placeholder="0"
        onChange={(e) => commit({ min: Math.max(0, Number(e.target.value) || 0) })}
        aria-label={`${label} 최소`}
        className="tnum h-8 w-24 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg outline-none trans-state placeholder:text-fg-faint focus:border-primary"
      />
      {mode === "between" ? (
        <>
          <span className="text-[12px] text-fg-faint" aria-hidden>
            ~
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={max || ""}
            placeholder="0"
            onChange={(e) => commit({ max: Math.max(0, Number(e.target.value) || 0) })}
            aria-label={`${label} 최대`}
            className="tnum h-8 w-24 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg outline-none trans-state placeholder:text-fg-faint focus:border-primary"
          />
        </>
      ) : null}
      <div className="inline-flex h-8 items-center overflow-hidden rounded-card border border-line" role="group">
        {METRIC_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => commit({ mode: m.value })}
            className={cn(
              "trans-state h-full cursor-pointer border-l border-line px-2.5 text-[12px] first:border-l-0",
              mode === m.value
                ? "bg-primary-weak font-semibold text-primary"
                : "bg-body font-medium text-fg-sub hover:text-fg",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </Row>
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
    <div className="grid gap-x-16 gap-y-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* ── 왼쪽: 어디서 · 언제 ── */}
      <div className="space-y-6">
        <Field label="수집 시기">
          <div className="flex flex-wrap gap-2" role="group" aria-label="수집 시기 필터">
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
          {/* 트랙과 종속 조건을 하나의 회색 덩어리로 붙인다 — 떨어뜨리면
              아래 조건이 위 선택에 딸린 것이라는 관계가 안 보인다 */}
          <div className="overflow-hidden rounded-card bg-plate">
            <TargetSegmented
              value={filters.target}
              onChange={(v) => setFilters({ ...filters, target: v })}
            />
            <div className="space-y-3 px-4 pb-4 pt-1">
              {isAds ? (
                <Row label="게재 상태">
                  <span className="text-[12px] text-fg-faint">
                    메타광고는 반응 지표를 공개하지 않아 수치 조건을 쓸 수 없어요
                  </span>
                </Row>
              ) : (
                <>
                  <MetricRow
                    label="조회수"
                    value={filters.views}
                    onChange={(v) => setFilters({ ...filters, views: v })}
                  />
                  <MetricRow
                    label="좋아요 수"
                    value={filters.likes}
                    onChange={(v) => setFilters({ ...filters, likes: v })}
                  />
                  <MetricRow
                    label="댓글 수"
                    value={filters.comments}
                    onChange={(v) => setFilters({ ...filters, comments: v })}
                  />
                </>
              )}

              {sourceFacets.length > 0 ? (
                <Row label="수집 기준">
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
                      <span className="max-w-[8rem] truncate">{s.value}</span>
                    </Chip>
                  ))}
                  {sourceFacets.length > 6 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllSources((v) => !v)}
                      className="h-8 cursor-pointer px-1.5 text-[12px] font-semibold text-fg-sub trans-state hover:text-fg"
                    >
                      {showAllSources ? "접기" : `+${sourceFacets.length - 6}`}
                    </button>
                  ) : null}
                  {hiddenSelected > 0 ? (
                    <span className="tnum rounded-card bg-primary-weak px-1.5 text-[11px] font-bold text-primary">
                      +{hiddenSelected}
                    </span>
                  ) : null}
                </Row>
              ) : null}

              <Row label="보기 옵션">
                <Chip on={filters.favOnly} onClick={() => setFilters({ ...filters, favOnly: !filters.favOnly })}>
                  스크랩만
                </Chip>
                <Chip on={filters.overOnly} onClick={() => setFilters({ ...filters, overOnly: !filters.overOnly })}>
                  잘 나온 것만
                </Chip>
                <InfoTip>
                  같은 수집 기준으로 모인 콘텐츠의 평균 반응 대비 1.5배 이상인 항목만 봅니다. 핀치 자체 계산이에요.
                </InfoTip>
              </Row>
            </div>
          </div>
        </Field>
      </div>

      {/* ── 오른쪽: 무엇을 ── */}
      <div className="space-y-6">
        {/* 업종은 **고정 목록이다. 데이터에서 뽑지 않는다.**
            예전에는 수집물의 AI 자동 분류를 그대로 칩으로 만들어서, 웨딩 자료가 많으면
            '웨딩드레스 4 · 웨딩촬영 2 · 웨딩케이크 1' 같은 잡동사니가 이 자리를 차지했다.
            업종은 데이터가 아니라 제품이 정하는 축이라, 언제 들어와도 같은 목록이
            같은 자리에 있어야 사용자가 외운다. */}
        <Field label="업종 카테고리" hint="색이 같으면 같은 분야예요">
          <div className="flex flex-wrap gap-2" role="group" aria-label="업종 필터">
            {INDUSTRY_LIST.map((ind) => (
              <Chip
                key={ind.id}
                on={filters.industries.includes(ind.id)}
                onClick={() => setFilters({ ...filters, industries: toggleIn(filters.industries, ind.id) })}
                tint={GROUP_TINT[ind.group]}
              >
                {ind.label}
              </Chip>
            ))}
          </div>
        </Field>

        {isAds ? (
          advertiserFacets.length > 0 ? (
            <Field label="광고주">
              <div className="flex flex-wrap gap-2" role="group" aria-label="광고주 필터">
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
            <div className="flex flex-wrap gap-2" role="group" aria-label="후킹 기법 필터">
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
            className="trans-state max-w-40 cursor-pointer truncate px-2.5 text-[12px] text-fg-sub hover:bg-tint-hover hover:text-fg"
          >
            {combo.name}
          </button>
          <button
            type="button"
            onClick={() => writeSaved(saved.filter((_, i) => i !== index))}
            aria-label={`저장된 조합 삭제: ${combo.name}`}
            className="trans-state cursor-pointer self-stretch border-l border-line px-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={saveCurrent}
        disabled={active === 0}
        className="trans-state inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-chip px-2.5 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Bookmark className="size-3.5" aria-hidden />
        조합 저장
      </button>
    </div>
  );
}

/* ---------------- 최근 검색어 (localStorage 외부 스토어) ---------------- */

const RECENT_KEY = "finch:library:recent:v1";
const RECENT_MAX = 8;

let recentCache: string[] | null = null;
const recentListeners = new Set<() => void>();
const RECENT_EMPTY: string[] = [];

function getRecentSnapshot(): string[] {
  if (recentCache === null) {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      recentCache = Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
    } catch {
      recentCache = [];
    }
  }
  return recentCache;
}

function subscribeRecent(onChange: () => void) {
  recentListeners.add(onChange);
  return () => recentListeners.delete(onChange);
}

/** 검색어 기록. 같은 말을 다시 찾으면 맨 앞으로 올린다 */
export function rememberQuery(q: string) {
  const v = q.trim();
  if (v.length < 2) return;
  const next = [v, ...getRecentSnapshot().filter((x) => x !== v)].slice(0, RECENT_MAX);
  recentCache = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // 저장 공간 초과 — 메모리에만 유지
  }
  recentListeners.forEach((l) => l());
}

/* ---------------- 콘솔 본체 ---------------- */

export function SearchConsole({
  query,
  onQueryChange,
  onClearAll,
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
  showCollectSettings = true,
}: {
  query: string;
  /** 확정 검색어 변경 — 제출(엔터·[검색]·칩 클릭)과 지우기에서만 불린다. 타이핑 중에는 안 불린다. */
  onQueryChange: (q: string) => void;
  /** [전체 해제] 전용 — 검색어+필터를 부모가 한 번에 초기화한다. onQueryChange 뒤에
      필터 초기화를 잇는 방식은 옛 검색어로 서버 재검색이 나가는 결함이 있었다. */
  onClearAll: () => void;
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
  /** 개인 수집 설정 진입점 노출 여부 — 공용 풀 모드에서는 개인 수집 시스템이 검색과 무관해 숨긴다 (2026-08-15) */
  showCollectSettings?: boolean;
}) {
  /* 진입 시 패널은 **닫혀 있다** — 첫 화면의 주인공은 콘텐츠다.
     열리는 건 스니핏과 같은 두 경로뿐: 검색창 포커스, 필터 버튼. */
  const [panelOpen, setPanelOpen] = useState(false);
  /* 모바일은 시트라 기본이 닫힘이다 — panelOpen 을 같이 쓰면 진입하자마자 시트가 덮는다 */
  const [sheetOpen, setSheetOpen] = useState(false);

  /*
    패널 조작은 **초안**이다. null 이면 "고칠 것 없음 = 확정본 그대로".
    이렇게 두면 바깥에서 필터가 바뀌어도(칩 해제·저장 조합 적용) effect 로 동기화할 일이
    없다 — 초안을 비우기만 하면 자동으로 확정본을 따라간다.
  */
  const [draft, setDraft] = useState<LibraryFilters | null>(null);
  const editing = draft ?? filters;
  const dirty = draft !== null;

  const [scopeOpen, setScopeOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  /* 입력칸은 **초안**이다 — 엔터·[검색]을 눌러야 확정 검색어(query)가 되고 결과가 바뀐다.
     (2026-08-15 사장님 지시: 타이핑마다 결과가 갈아엎히는 즉시 필터링 금지)
     바깥에서 확정 검색어가 바뀌면(딥링크·전체 해제·0건 화면의 검색어 지우기) 입력칸도
     따라간다 — effect 가 아니라 렌더 중 조정(공식 파생 상태 패턴, 재렌더 1회로 수렴). */
  const [input, setInput] = useState(query);
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setInput(query);
  }

  /** 검색 실행 — 초안을 확정하고 드롭다운을 닫는다. 빈 값 제출 = 검색 해제(탐색 화면 복귀). */
  const submitQuery = useCallback(
    (raw: string) => {
      const v = raw.trim();
      setInput(v);
      setPanelOpen(false);
      setScopeOpen(false);
      setRecentOpen(false);
      /* 빈 입력에서 엔터를 또 치는 경우만 막는다 — 탐색 화면에서 [더 보기]로 쌓아 둔
         목록이 이유 없이 접혔다. 반대로 **같은 검색어 재제출은 허용**해야 한다:
         "수집을 걸었으니 잠시 후 다시 확인하세요"의 그 '다시 확인'이 이 경로다
         (막아 뒀더니 [검색]도 엔터도 무반응인 막다른 상태가 됐다 — 적대 검증 확정). */
      if (v === "" && query === "") return;
      onQueryChange(v);
      rememberQuery(v);
    },
    [onQueryChange, query],
  );

  const recent = useSyncExternalStore(subscribeRecent, getRecentSnapshot, () => RECENT_EMPTY);
  const activeCount = countActiveFilters(filters);
  const activeChips = buildActiveChips(filters);
  const scope = SCOPE_OPTIONS.find((o) => o.value === filters.scope) ?? SCOPE_OPTIONS[0];

  /* 검색바에 붙은 두 드롭다운 — 바깥 클릭·Escape 로 닫는다 */
  useEffect(() => {
    if (!scopeOpen && !recentOpen && !panelOpen) return;
    function onDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setScopeOpen(false);
        setRecentOpen(false);
        setPanelOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setScopeOpen(false);
        setRecentOpen(false);
        setPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [scopeOpen, recentOpen, panelOpen]);

  /** 확정 — 초안을 결과에 반영한다 */
  const applyDraft = useCallback(() => {
    if (draft) setFilters(draft);
    setDraft(null);
  }, [draft, setFilters]);

  /** 확정본을 직접 바꾼다(칩 해제 등). 초안이 남아 있으면 버린다 — 안 그러면
      해제한 조건이 [적용]을 누르는 순간 되살아난다. */
  const commit = useCallback(
    (next: LibraryFilters) => {
      setDraft(null);
      setFilters(next);
    },
    [setFilters],
  );

  const resetAll = useCallback(() => {
    commit({ ...DEFAULT_FILTERS, sort: filters.sort, scope: filters.scope });
  }, [commit, filters.sort, filters.scope]);

  const panelInner = (
    <>
      {/* 머리 줄 — 왼쪽 안내·활성 개수·초기화, 오른쪽 저장 조합·접기 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* 본문은 진하게, 핵심 단어 하나만 포인트 컬러 — 스니핏 실측 구조.
              전부 연회색이면 안내문이 아니라 배경 무늬가 된다. */}
          <p className="truncate text-[15px] text-fg">
            다양한 <span className="font-semibold text-primary">필터</span>를 조합해 정확한
            레퍼런스를 찾아보세요
          </p>
          {activeCount > 0 ? (
            <>
              <span className="tnum inline-flex size-5 shrink-0 items-center justify-center rounded-chip bg-primary text-[11px] font-bold text-on-primary">
                {activeCount}
              </span>
              <button
                type="button"
                onClick={resetAll}
                className="trans-state inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-card px-2 py-1 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                필터 초기화
              </button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <SavedCombosRow filters={editing} setFilters={setDraft} />
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="trans-state hidden shrink-0 cursor-pointer items-center gap-1 rounded-card px-2 py-1 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg lg:inline-flex"
          >
            닫기
          </button>
        </div>
      </div>

      <div className="mt-5">
        <FilterPanelBody
          filters={editing}
          setFilters={setDraft}
          hookFacets={hookFacets}
          sourceFacets={sourceFacets}
          advertiserFacets={advertiserFacets}
        />
      </div>

      {/* 확정 줄 — 여기를 누르기 전에는 아래 결과가 바뀌지 않는다.
          칩 하나 누를 때마다 결과가 갈아엎히면 조건을 조합하는 동안 화면이 계속 흔들린다. */}
      <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
        {dirty ? (
          <>
            <span className="mr-auto text-[12px] font-medium text-fg-faint">
              바꾼 조건이 아직 적용되지 않았어요
            </span>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="trans-state h-9 cursor-pointer rounded-card px-3 text-[14px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg"
            >
              되돌리기
            </button>
          </>
        ) : null}
        <Button onClick={applyDraft} disabled={!dirty} className="h-9 px-4">
          필터 적용
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* 스크림 — 반드시 헤더 **밖**에 있어야 한다.
         헤더의 backdrop-blur(backdrop-filter)는 fixed 자손의 기준(containing block)을
         뷰포트에서 헤더 자신으로 바꿔버린다. 안에 두면 inset:0 이 "화면 전체"가 아니라
         "검색줄 영역"이 되어, 검색창만 어두워지는 코미디가 났다(2026-08-12 실측 사고).
         z-30: 상단바(z-30)와 같은 값 + DOM 이 나중이라 상단바까지 덮는다 —
         스니핏처럼 검색줄과 패널만 남고 전부 가라앉는다. */}
      {panelOpen ? <div className="panel-scrim hidden lg:block" aria-hidden /> : null}

      {/* sticky + z 는 장식이 아니라 **필터 패널이 보이기 위한 전제**다.
         z 를 빼면 헤더가 쌓임 순서에서 결과 영역보다 아래가 되고, 패널 안에 z-30 을 아무리
         줘도 그 값은 헤더 안에서만 유효하므로 카드가 패널 위를 덮는다(2026-08-11 실측 사고).
         z-40 인 이유: 스크림(z-30)이 상단바까지 덮는 동안 이 헤더와 그 안의 패널은
         밝게 남아야 한다. 상단바(top-0 h-14)와 이 헤더(top-14)는 화면에서 절대 겹치지
         않으므로 z 가 더 커도 시각적 충돌이 없다. */}
      <header className="sticky top-14 z-40 -mx-4 -mt-5 border-b border-line bg-body/95 px-4 pb-3 pt-4 backdrop-blur md:-mx-6 md:px-6">
      <h2 className="sr-only">레퍼런스 검색</h2>

      {/* ── 1행 — 검색 줄.
          스니핏 실측(1523px 화면): 상단이 **박스 두 개**다.
            [검색 기준 218px] [검색 입력 ~1285px]
          그리고 아래 필터 카드의 왼쪽 모서리가 **검색 입력 박스**에 맞춰 시작한다.
          한 테두리 안에 다 넣으면 그 정렬 기준이 사라진다. ── */}
      <div ref={barRef} className="relative flex items-center gap-2">
        {/* (1) 검색 기준 — 자체 테두리를 가진 별도 박스 */}
        <div className="relative hidden shrink-0 lg:block">
          <button
            type="button"
            aria-expanded={scopeOpen}
            onClick={() => {
              setScopeOpen((v) => !v);
              setRecentOpen(false);
            }}
            className={cn(
              "trans-state flex h-14 w-48 cursor-pointer items-center gap-2 rounded-card border px-4 text-[15px] font-bold",
              scopeOpen
                ? "border-primary bg-primary-weak text-primary"
                : "border-line bg-body text-fg hover:border-line-strong",
            )}
          >
            {filters.scope === "transcript" ? (
              <Type className="size-4 shrink-0" aria-hidden />
            ) : (
              <Search className="size-4 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-left">{scope.label}</span>
            <ChevronDown
              className={cn("size-4 shrink-0 transition-transform", scopeOpen && "rotate-180")}
              aria-hidden
            />
          </button>

          {scopeOpen ? (
            <div
              role="listbox"
              aria-label="검색 기준"
              className="panel-drop absolute left-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-card border border-line-strong bg-overlay p-1.5 shadow-pop"
            >
              {SCOPE_OPTIONS.map((o) => {
                const on = filters.scope === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      commit({ ...filters, scope: o.value });
                      setScopeOpen(false);
                    }}
                    className={cn(
                      "trans-state flex w-full cursor-pointer items-start gap-2 rounded-card px-2.5 py-2 text-left",
                      on ? "bg-primary-weak" : "hover:bg-tint-hover",
                    )}
                  >
                    <Check
                      className={cn("mt-0.5 size-3.5 shrink-0", on ? "text-primary" : "text-transparent")}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className={cn("block text-[14px] font-semibold", on ? "text-primary" : "text-fg")}>
                        {o.label}
                      </span>
                      <span className="block text-[12px] text-fg-faint">{o.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* (2) 검색 입력 박스 — 필터 카드가 이 박스의 왼쪽 모서리에 맞춰 열린다 */}
        <div className="relative flex h-14 min-w-0 flex-1 items-center rounded-card border border-line bg-body trans-state focus-within:border-line-strong">
          <Search className="ml-4 size-5 shrink-0 text-fg-faint" aria-hidden />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setPanelOpen(true)}
            /* 엔터 제출이 패널을 닫는데 포커스는 입력칸에 남는다 — onFocus 만으로는
               다시 눌러도 안 열린다(포커스가 이미 있어 focus 이벤트가 안 난다). */
            onClick={() => setPanelOpen(true)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              /* 한글 조합 **중**인 엔터는 글자 확정이지 검색 실행이 아니다(Chrome·FF).
                 Safari 는 조합 확정 엔터를 isComposing=false 로 주는 대신 compositionend 가
                 먼저 끝나 DOM value 에 마지막 글자가 이미 들어 있다 — 그래서 state(input)가
                 아니라 currentTarget.value 로 제출하면 엔터 한 번에 올바른 값이 나간다.
                 (시간 창 가드는 정상 엔터까지 삼켜서 폐기했다 — 리뷰 확정) */
              if (e.nativeEvent.isComposing) return;
              submitQuery(e.currentTarget.value);
            }}
            maxLength={60}
            placeholder="브랜드·문구·계정·해시태그로 찾기"
            aria-label="레퍼런스 검색"
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-faint"
          />

          {/* 확정 검색어가 걸려 있으면 입력칸을 비워도 X 를 남긴다 — 안 그러면 키보드로
              다 지운 순간 "빈 입력칸 + 옛 결과"에서 검색을 풀 방법이 사라진다. */}
          {input || query ? (
            <button
              type="button"
              onClick={() => {
                setInput("");
                /* 확정 검색어가 없으면(제출 안 한 초안만 지움) 재검색·페이지 리셋을 부르지 않는다 */
                if (query !== "") onQueryChange("");
              }}
              aria-label="검색어 지우기"
              className="trans-state flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-card text-fg-faint hover:bg-tint-hover hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}

          {/* 필터 여닫이 — 스니핏의 카드가 늘 열려 있는 자리라 우리도 기본은 열림이다.
              누르는 자리를 검색창 안에 두는 이유: 검색과 조건은 한 동작이다. */}
          <button
            type="button"
            aria-expanded={panelOpen}
            aria-controls="library-filter-panel"
            onClick={() => {
              setPanelOpen((v) => !v);
              setScopeOpen(false);
              setRecentOpen(false);
            }}
            className={cn(
              "trans-state mr-1 inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-card px-3 text-[15px] font-semibold",
              panelOpen ? "bg-plate text-fg" : "text-fg-sub hover:bg-tint-hover hover:text-fg",
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">필터</span>
            {activeCount > 0 ? (
              <span className="tnum flex size-5 items-center justify-center rounded-chip bg-primary text-[11px] font-bold text-on-primary">
                {activeCount}
              </span>
            ) : null}
            <ChevronDown
              className={cn("size-3.5 transition-transform", panelOpen && "rotate-180")}
              aria-hidden
            />
          </button>

          {/* 최근 검색 */}
          <button
            type="button"
            aria-expanded={recentOpen}
            aria-label="최근 검색어"
            onClick={() => {
              setRecentOpen((v) => !v);
              setScopeOpen(false);
            }}
            className={cn(
              "trans-state mr-1.5 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-card",
              recentOpen ? "bg-plate text-fg" : "text-fg-faint hover:bg-tint-hover hover:text-fg",
            )}
          >
            <Clock className="size-[18px]" aria-hidden />
          </button>

          {recentOpen ? (
            <div
              className="panel-drop absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-card border border-line-strong bg-overlay p-1.5 shadow-pop"
              role="region"
              aria-label="최근 검색어"
            >
              {recent.length === 0 ? (
                <p className="px-2.5 py-3 text-[14px] text-fg-sub">아직 검색 기록이 없어요</p>
              ) : (
                recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => submitQuery(r)}
                    className="trans-state flex w-full cursor-pointer items-center gap-2 rounded-card px-2.5 py-2 text-left text-[14px] text-fg-sub hover:bg-tint-hover hover:text-fg"
                  >
                    <Clock className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {/* ── 필터 카드 — **화면 위에 떠서** 열린다.
              흐름 안에 두면 열 때마다 아래 결과가 통째로 내려가고, 조건을 만지는 동안
              보고 있던 카드가 화면 밖으로 밀려난다. 스니핏도 띄운다(스크린샷에서
              카드 뒤로 썸네일이 비친다). 왼쪽 모서리는 이 입력 박스에 맞고,
              오른쪽은 [지금 수집]까지 덮어 화면 폭을 다 쓴다. ── */}
          {panelOpen ? (
            <div
              id="library-filter-panel"
              role="region"
              aria-label="상세 필터"
              className="panel-drop absolute left-0 right-0 top-full z-30 mt-2.5 hidden max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-card border border-line bg-body p-4 shadow-panel lg:block"
            >
              {panelInner}
            </div>
          ) : null}
        </div>

        {/* 수집 설정 — 풀 모드에서는 숨김(개인 수집 전용 설정) */}
        {showCollectSettings ? (
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="수집 설정"
          title="수집 기준·메타광고 검색어·수집 옵션"
          className="trans-state flex h-14 w-12 shrink-0 cursor-pointer items-center justify-center rounded-card border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg"
        >
          <Settings2 className="size-[18px]" aria-hidden />
        </button>
        ) : null}

        {/* [지금 수집] — 개인 수집 모드 전용(등록된 기준 일괄 수집). 풀·데모 모드에서는
            수집이 검색어를 따라가므로(0건·미적중 상태의 '지금 수집하기') 별도 버튼이 없다. */}
        {showCollectSettings ? (
          <Button
            variant="secondary"
            onClick={onCollect}
            disabled={collecting}
            aria-busy={collecting}
            className="h-14 shrink-0 px-4"
          >
            <Zap className="size-4" aria-hidden />
            <span className="hidden md:inline">{collecting ? "수집 중…" : "지금 수집"}</span>
          </Button>
        ) : null}

        {/* 검색 실행 — 입력은 여기(또는 엔터)를 눌러야 결과에 반영된다.
            라벨이 md 미만에서 숨으므로 aria-label 로 이름을 보장한다. */}
        <Button onClick={() => submitQuery(input)} aria-label="검색" className="h-14 shrink-0 px-4 md:px-6">
          <Search className="size-4" aria-hidden />
          <span className="hidden md:inline">검색</span>
        </Button>
      </div>

      {/* lg 미만 — 필터를 시트로 연다 */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="trans-state mt-2 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-card border border-line bg-body text-[14px] font-semibold text-fg-sub lg:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        필터
        {activeCount > 0 ? (
          <span className="tnum inline-flex size-5 items-center justify-center rounded-chip bg-primary text-[11px] font-bold text-on-primary">
            {activeCount}
          </span>
        ) : null}
      </button>

      {/* ── 추천 검색어 — 검색 줄 바로 아래, 뭘 칠지 모르는 손을 위한 입구.
          검색어가 있으면 치운다: 이미 찾는 중인 사람에게는 소음이다. ── */}
      {!input.trim() ? (
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUGGESTED_QUERIES.map((sq) => (
            <button
              key={sq.label}
              type="button"
              onClick={() => submitQuery(sq.q)}
              className="trans-state inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-chip border border-line bg-body px-3 text-[14px] font-medium text-fg hover:border-line-strong"
            >
              <SuggestIcon kind={sq.icon} />
              {sq.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── 3행 — 상태 줄. 지금 무엇이 걸려 있는지 ── */}
      <div className="mt-2 flex h-9 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 확정 검색어 칩 — 제출형이 되면서 "입력칸 = 지금 적용된 검색어"가 깨졌다.
              입력칸을 고치다 만 상태에서 필터를 만지면 결과는 옛 검색어 기준으로 다시
              도는데, 그걸 알 방법이 이 칩뿐이다(적대 검증 확정). */}
          {query ? (
            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-card bg-primary-weak px-2.5 text-[14px] font-semibold text-primary">
              검색: {query}
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  onQueryChange("");
                }}
                aria-label="검색어 해제"
                className="cursor-pointer text-primary/70 trans-state hover:text-primary"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ) : null}
          {/* 아직 제출 안 한 초안이 있으면 알린다 — 안 그러면 "쳤는데 왜 그대로냐"가 된다 */}
          {input.trim() !== query ? (
            <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-fg-sub">
              엔터를 눌러 검색하세요
            </span>
          ) : null}
          {activeChips.length > 0 ? (
            <>
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-card bg-primary-weak px-2.5 text-[14px] font-semibold text-primary"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => commit(chip.clear(filters))}
                    aria-label={`${chip.label} 조건 해제`}
                    className="cursor-pointer text-primary/70 trans-state hover:text-primary"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setInput("");
                  onClearAll();
                }}
                className="shrink-0 cursor-pointer rounded-card px-2.5 text-[14px] font-semibold text-fg-sub trans-state hover:bg-tint-hover hover:text-fg"
              >
                전체 해제
              </button>
            </>
          ) : (
            registeredSources.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => commit({ ...filters, sources: toggleIn(filters.sources, s.value) })}
                className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-card border border-line bg-body px-2.5 text-[14px] font-medium text-fg-sub trans-state hover:border-line-strong hover:text-fg"
              >
                <SourceGlyph kind={s.kind} />
                {s.value}
              </button>
            ))
          )}
          {showCollectSettings && activeChips.length === 0 && registeredSources.length > 0 ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-card px-2.5 text-[14px] font-medium text-fg-sub trans-state hover:bg-tint-hover hover:text-fg"
            >
              <Plus className="size-3" aria-hidden />
              기준 추가
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {hasQuery ? (
            <span className="tnum text-[14px] text-fg-sub" aria-live="polite">
              {resultCount}건
            </span>
          ) : null}
          <select
            value={filters.sort}
            onChange={(e) => commit({ ...filters, sort: e.target.value as ItemSort })}
            aria-label="정렬"
            className="h-8 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-fg-sub outline-none trans-state hover:text-fg"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

    </header>

      {/* lg 미만 필터 시트 — 같은 본문을 재사용.

          ⚠️ **헤더 밖에 있어야 한다.** 바로 위 데스크톱 스크림 주석이 적어 둔 것과 같은 사고를
          이 시트가 그대로 다시 겪었다: 헤더의 backdrop-blur 가 fixed 자손의 기준을 뷰포트에서
          헤더 자신으로 바꾸는 바람에, 390px 에서 시트가 top:-394 로 **화면 위쪽 밖**에 붙었다.
          내부 스크롤은 이미 맨 위(scrollTop 0)라 위쪽 절반은 영영 도달 불가였고, 스크림도
          inset:0 이 «헤더 영역»이 되어 화면 대부분이 안 어두워져 뒤 카드가 그대로 눌렸다
          (elementFromPoint 로 확인). 768px 태블릿도 같았다. 헤더의 형제로 빼면 기준이 뷰포트로 돌아온다. */}
      {sheetOpen ? (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSheetOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="상세 필터"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-card border-t border-line-strong bg-overlay"
          >
            <div className="flex-1 overflow-y-auto p-5">{panelInner}</div>
            <div className="border-t border-line p-4">
              <Button className="w-full" onClick={() => setSheetOpen(false)}>
                닫기
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
