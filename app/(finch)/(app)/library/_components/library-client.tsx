"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Info, RefreshCw, SearchX, Zap } from "lucide-react";
import { FinchMark } from "@/components/logo";
import type {
  AdSource,
  Channel,
  CollectSettings,
  ReferenceAd,
  ReferenceItem,
  ReferenceSource,
} from "@/lib/types";
import {
  addReferenceSource,
  removeReferenceSource,
  runCollection,
  saveCollectSettings,
  toggleReferenceFavorite,
} from "@/lib/actions/reference";
import { addAdSource, removeAdSource, runAdCollection, toggleAdFavorite } from "@/lib/actions/ads-reference";
import { industryFromText } from "@/lib/industry/list";
import { collectPoolNow, requestPoolCollect, searchPoolAction, togglePoolSave } from "../pool-actions";
import { TREND_CATEGORIES } from "@/lib/data";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReferenceDetailModal } from "./reference-detail";
import { AdDetailModal } from "./ad-detail";
import { AdCard, ReferenceCard } from "./reference-card";
import { LibrarySettingsDrawer, type DrawerTab, type SourceBaseline } from "./library-settings-drawer";
import {
  DEFAULT_FILTERS,
  SearchConsole,
  countActiveFilters,
  type Facet,
  type LibraryFilters,
  type MetricFilter,
  type SourceFacet,
} from "./search-console";

/*
  레퍼런스 — 검색 주도 화면.

  최상위 세로 블록은 항상 **2개**다: ① sticky 검색 콘솔, ② 결과 영역.
  그 외 모든 것(수집 기준·메타광고 검색어·수집 옵션·상세·수집 진행)은 문서 흐름
  밖(드로어·오버레이)에 둔다. 이 규율이 없으면 기능이 늘 때마다 화면이 다시
  세로로 길어진다 — 개편 직전 이 화면은 블록 11개였다.

  /discover(트렌드 탐색)는 이 화면에 흡수됐다. 그 화면의 실제 가치였던 "발견"은
  별도 라우트가 아니라 **검색어가 없을 때의 기본 상태**로 들어온다(아래 탐색 모드).
  '실시간 급상승' 탭의 실체는 게시 시각 오름차순 정렬 한 줄이었으므로 정렬 옵션
  '게시 최신순'이 대체한다.
*/

const WITHIN_HOURS: Record<LibraryFilters["within"], number | null> = {
  all: null,
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

/**
 * 숫자 조건 판정. null 이면 조건이 없는 것이라 무조건 통과다.
 * "0 이상"을 조건으로 세지 않는 이유는 search-console 의 MetricFilter 주석에 있다.
 */
function passMetric(value: number, m: MetricFilter): boolean {
  if (!m) return true;
  if (m.mode === "gte") return value >= m.min;
  if (m.mode === "lte") return value <= m.min;
  const lo = Math.min(m.min, m.max);
  const hi = Math.max(m.min, m.max);
  return value >= lo && value <= hi;
}

/** 반응 점수 — 정렬·베이스라인 공용 (조회수 없는 스레드도 좋아요·댓글로 비교) */
function itemScore(i: ReferenceItem): number {
  return i.views + i.likes * 20 + (i.comments ?? 0) * 40;
}

type Entry = { kind: "item"; data: ReferenceItem } | { kind: "ad"; data: ReferenceAd };

/** 탐색 섹션 헤더 — 스니핏 실측: 제목 18px/700 + 부제 12px 회색이 **같은 줄**,
 *  오른쪽에 새로고침 글씨 버튼(14px/600 연회색). */
function SectionHead({
  title,
  subtitle,
  moreLabel,
  onMore,
}: {
  title: string;
  subtitle: string;
  moreLabel: string;
  onMore: () => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
        <p className="text-[12px] text-fg-sub">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onMore}
        className="trans-state inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[14px] font-semibold text-fg-sub hover:text-fg"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        {moreLabel}
      </button>
    </div>
  );
}

/** n개씩 도는 창 — "다른 레퍼런스 보기"가 다음 묶음으로 넘긴다. 끝에 오면 처음으로 */
function windowOf<T>(list: T[], offset: number, size: number): T[] {
  if (list.length <= size) return list;
  const start = (offset * size) % list.length;
  const out = list.slice(start, start + size);
  return out.length < size ? [...out, ...list.slice(0, size - out.length)] : out;
}

const PAGE_SIZE = 60;

/**
 * 수집 시도 기록의 유일한 키 — 쓰기·읽기가 같은 정규화를 써야 '#여름'과 '여름'이 갈리지 않는다.
 * 탭(target)까지 넣는 이유: 인스타 실시간 수집과 틱톡 대기열 예약은 다른 일이라,
 * 한쪽을 걸었다고 다른 탭의 수집까지 막으면 막다른 상태가 된다(적대 검증 확정).
 * 접두 기호는 몇 개가 붙든 다 턴다 — '##여름'과 '여름'이 다른 키가 되면 한 번 더 과금된다.
 */
function collectKey(q: string, target: string): string {
  return `${target}:${q.trim().replace(/^[#@]+/, "").trim()}`;
}

export function LibraryClient({
  sources: initialSources,
  settings: initialSettings,
  adSources: initialAdSources,
  items: initialItems,
  ads: initialAds,
  poolReady,
  poolSavedIds,
  isDemo,
}: {
  sources: ReferenceSource[];
  items: ReferenceItem[];
  settings: CollectSettings;
  adSources: AdSource[];
  ads: ReferenceAd[];
  /**
   * 공용 풀이 준비됐는가. true 면 검색어를 서버로 보낸다 —
   * 풀은 수백만 행이라 처음 40건만 받아 브라우저에서 거르면 가짜 검색이 된다.
   * false 면 개인 수집분을 브라우저에서 거른다(기존 동작 그대로).
   */
  poolReady: boolean;
  /** 이미 저장한 풀 소재 id — 카드 북마크 상태를 첫 렌더부터 맞춘다 */
  poolSavedIds: string[];
  isDemo: boolean;
}) {
  const router = useRouter();

  const [sources, setSources] = useState<ReferenceSource[]>(initialSources);
  const [adSources, setAdSources] = useState<AdSource[]>(initialAdSources);
  const [settings, setSettings] = useState<CollectSettings>(initialSettings);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /* 풀 검색 결과. null = 아직 서버에 안 물어봤다(첫 진입 = 서버가 준 인기 상위).
     이 값이 있으면 이걸 그리고, 없으면 초기 props 를 그린다. */
  const [poolResult, setPoolResult] = useState<{ items: ReferenceItem[]; ads: ReferenceAd[]; isGap: boolean } | null>(
    null,
  );
  const [poolSearching, setPoolSearching] = useState(false);
  /* 디바운스 타이머와 요청 순번. 순번이 없으면 느린 이전 요청이 나중에 도착해
     새 검색 결과를 덮어쓴다(타이핑이 빠를수록 확실히 재현된다). */
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  const items = poolResult?.items ?? initialItems;
  const ads = poolResult?.ads ?? initialAds;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("sources");
  /* 수집 기준 입력값을 부모가 든다 — 빈 상태 씨앗 칩·검색 0건 CTA가 값을 채운 채
     드로어를 열기 때문. 드로어 안에서 effect로 동기화하면 캐스케이딩 렌더가 난다. */
  const [sourceInput, setSourceInput] = useState("");

  const [collecting, setCollecting] = useState(false);
  /* 전체화면 수집 오버레이 문구 — null 이면 오버레이 없음. collecting 과 분리한 이유:
     광고 예약(INSERT 한 건, 수백 ms)에 "수십 초" 전체화면이 번쩍이는 걸 막는다(리뷰 확정). */
  const [collectOverlay, setCollectOverlay] = useState<string | null>(null);
  /* 이 검색어로 이미 수집을 **시도**했다 — 성공만 기록하면 실패한 검색어(공급사 0건 등
     재시도해도 같은 결과)에서 CTA가 계속 떠 클릭마다 공용 예산이 나간다(적대 리뷰 확정
     결함). 성공/실패 무관하게 한 검색어당 한 번으로 닫는다. */
  const [collectedQueries, setCollectedQueries] = useState<Set<string>>(() => new Set());
  /* 마지막 수집 시도의 결과 문구 — 빈 화면 안내를 Set 유무가 아니라 **실제로 일어난 일**로
     쓴다. Set 만 보고 "걸어뒀어요"라고 하면 과금 거절·예산 소진처럼 아무것도 안 걸린
     실패에서도 같은 말이 나온다(적대 검증 확정). */
  const [collectNote, setCollectNote] = useState<{ key: string; text: string } | null>(null);
  const [toast, setToast] = useState<{ tone: "error" | "notice"; text: string } | null>(null);

  /* 풀이 켜지면 저장 상태의 출처가 saved_creatives 로 바뀐다.
     풀 소재의 id 는 creatives.id 라서 reference_items 의 favorite 과는 애초에 다른 세계다. */
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() =>
    poolReady ? new Set(poolSavedIds) : new Set(items.filter((i) => i.favorite).map((i) => i.id)),
  );
  const [adFavoriteIds, setAdFavoriteIds] = useState<Set<string>>(() =>
    poolReady ? new Set(poolSavedIds) : new Set(ads.filter((a) => a.favorite).map((a) => a.id)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const selectedAd = ads.find((a) => a.id === selectedAdId) ?? null;

  /* 유사 광고 — 서버 호출 없이 이미 받아 둔 목록에서 고른다.
     같은 광고주가 먼저(그 브랜드의 다른 소재), 다음이 같은 업종. 6개까지. */
  const similarAds = useMemo<ReferenceAd[]>(() => {
    if (!selectedAd) return [];
    const sameBrand = ads.filter((a) => a.id !== selectedAd.id && a.pageName === selectedAd.pageName);
    const sameIndustry = ads.filter(
      (a) => a.id !== selectedAd.id && a.pageName !== selectedAd.pageName && a.category === selectedAd.category,
    );
    return [...sameBrand, ...sameIndustry].slice(0, 24);
  }, [ads, selectedAd]);

  const activeFilterCount = countActiveFilters(filters);
  const hasQuery = query.trim() !== "" || activeFilterCount > 0;

  /**
   * 풀 검색 — 디바운스 후 서버 조회.
   * effect 가 아니라 이벤트 핸들러에서 부른다(입력 → 요청이 직접 인과관계이므로
   * effect 로 두면 렌더가 한 번 더 돌고 취소 처리가 복잡해진다).
   */
  const runPoolSearch = useCallback(
    (q: string, f: LibraryFilters, delay: number) => {
      if (!poolReady) return;
      if (searchTimer.current) clearTimeout(searchTimer.current);
      const seq = ++searchSeq.current;
      setPoolSearching(true);
      searchTimer.current = setTimeout(async () => {
        try {
          const res = await searchPoolAction({
            query: q,
            target: f.target,
            industryIds: f.industries,
            sort: f.sort,
            page: 0,
          });
          // 나보다 나중에 시작된 요청이 이미 돌아왔으면 이 결과는 버린다
          if (seq !== searchSeq.current) return;
          setPoolResult({ items: res.items, ads: res.ads, isGap: res.isGap });
        } catch {
          // 검색 실패는 화면을 비우지 않는다 — 직전 결과를 그대로 두는 편이 낫다
        } finally {
          if (seq === searchSeq.current) setPoolSearching(false);
        }
      }, delay);
    },
    [poolReady],
  );

  /* 필터·검색어가 바뀌면 더보기 페이지를 처음으로 되돌린다 */
  const applyFilters = useCallback(
    (next: LibraryFilters) => {
      setFilters(next);
      setVisibleCount(PAGE_SIZE);
      // 필터는 클릭이라 오타 보정이 필요 없다 — 바로 보낸다
      runPoolSearch(query, next, 0);
    },
    [query, runPoolSearch],
  );
  const applyQuery = useCallback(
    (q: string) => {
      setQuery(q);
      setVisibleCount(PAGE_SIZE);
      // 제출(엔터·검색 버튼)에서만 불린다 — 타이핑 디바운스가 필요 없어 바로 조회
      runPoolSearch(q, filters, 0);
    },
    [filters, runPoolSearch],
  );

  /** [전체 해제] — 검색어와 필터를 한 번에 초기화하고 서버 검색도 한 번만 부른다.
      onQueryChange("") 뒤에 필터 초기화를 잇는 옛 방식은 applyFilters 가 같은 렌더
      클로저의 **지우기 전 검색어**로 재검색해, 탐색 화면이 방금 지운 검색어의 결과로
      오염됐다(적대 리뷰 확정 결함 — runPoolSearch 의 타이머 취소가 빈 검색을 죽인다). */
  const clearAll = useCallback(() => {
    const next = { ...DEFAULT_FILTERS, sort: filters.sort, scope: filters.scope };
    setQuery("");
    setFilters(next);
    setVisibleCount(PAGE_SIZE);
    runPoolSearch("", next, 0);
  }, [filters.sort, filters.scope, runPoolSearch]);

  /* 홈 검색바·추천 칩 딥링크(/library?q=…&target=…) — 최초 1회만 URL을 상태로 주입.
     useSearchParams 대신 window에서 읽는다: 이 페이지는 정적 렌더라 Suspense 경계가 없다. */
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    deepLinkApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const q = (params.get("q") ?? "").trim();
    const targetRaw = params.get("target");
    const target: LibraryFilters["target"] | null =
      targetRaw === "instagram" || targetRaw === "tiktok" || targetRaw === "threads" || targetRaw === "ads"
        ? targetRaw
        : null;
    if (!q && !target) return;
    const nextFilters = target ? { ...filters, target } : filters;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL→상태 마운트 1회 동기화(딥링크)라 effect가 맞는 자리
    if (target) setFilters(nextFilters);
     
    if (q) setQuery(q);
    setVisibleCount(PAGE_SIZE);
    runPoolSearch(q, nextFilters, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 딥링크 주입
  }, []);

  /* ---------------- 패싯 (수집물에 실재하는 값만) ---------------- */

  const hookFacets = useMemo<Facet[]>(() => {
    const counts = new Map<string, number>();
    for (const item of items) for (const h of item.hooks) counts.set(h, (counts.get(h) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [items]);

  const advertiserFacets = useMemo<Facet[]>(() => {
    const counts = new Map<string, number>();
    for (const ad of ads) counts.set(ad.pageName, (counts.get(ad.pageName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [ads]);

  /* 수집 기준 패싯 — 구 "저장한 계정" 카드를 정식 필터 축으로 승격한 것.
     검색창에 핸들을 채워넣던 우회를 대체하고, 다른 축과 조합이 가능해진다. */
  const sourceFacets = useMemo<SourceFacet[]>(() => {
    /* 빈 값은 세지 않는다. 공용 풀에는 개인 "수집 기준" 개념이 없어 전부 빈 문자열로 오는데,
       그대로 세면 라벨 없는 빈 칩이 필터 패널에 하나 뜬다(눌러도 아무 일 안 하는 칩). */
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.matchedSource) continue;
      counts.set(item.matchedSource, (counts.get(item.matchedSource) ?? 0) + 1);
    }
    for (const ad of ads) {
      if (!ad.matchedSource) continue;
      counts.set(ad.matchedSource, (counts.get(ad.matchedSource) ?? 0) + 1);
    }
    const kindOf = new Map<string, string>();
    for (const s of sources) kindOf.set(s.value, s.kind);
    for (const s of adSources) kindOf.set(s.value, "ads");
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count, kind: kindOf.get(value) ?? "keyword" }));
  }, [items, ads, sources, adSources]);

  /* 기준별 베이스라인 — 드로어 [수집 기준] 탭 보조 텍스트로 착지 */
  const baselines = useMemo(() => {
    const map = new Map<string, SourceBaseline>();
    const grouped = new Map<string, number[]>();
    for (const item of items) {
      const arr = grouped.get(item.matchedSource) ?? [];
      arr.push(item.views);
      grouped.set(item.matchedSource, arr);
    }
    for (const [source, views] of grouped) {
      const sorted = [...views].sort((a, b) => a - b);
      map.set(source, {
        count: sorted.length,
        medianViews: sorted[Math.floor(sorted.length / 2)] ?? 0,
        maxViews: sorted[sorted.length - 1] ?? 0,
      });
    }
    return map;
  }, [items]);

  /* 기준 평균 대비 배수 — 1.5배 이상이면 카드 배지 + "잘 나온 것만" 필터의 근거 */
  const overAvgMultiple = useMemo(() => {
    const map = new Map<string, number>();
    const grouped = new Map<string, number[]>();
    for (const item of items) {
      const arr = grouped.get(item.matchedSource) ?? [];
      arr.push(itemScore(item));
      grouped.set(item.matchedSource, arr);
    }
    const avgBySource = new Map<string, number>();
    for (const [source, scores] of grouped) {
      if (scores.length < 3) continue; // 표본이 적으면 평균이 의미가 없다
      avgBySource.set(source, scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    for (const item of items) {
      const avg = avgBySource.get(item.matchedSource);
      if (avg && avg > 0) {
        const mult = itemScore(item) / avg;
        if (mult >= 1.5) map.set(item.id, mult);
      }
    }
    return map;
  }, [items]);

  /* ---------------- 필터링 ---------------- */

  const filteredItems = useMemo(() => {
    /* 풀 모드에서는 텍스트 필터를 서버가 이미 끝냈다(글자 일치 + **의미 검색 보충**).
       여기서 글자 포함으로 또 거르면 의미 보충분("휘낭시에" → 베이킹 소재처럼
       검색어 글자가 캡션에 없는 결과)이 전부 떨어져 나간다 — 기능이 통째로 사라진다.
       클라이언트 토큰 필터는 개인 수집분(서버 검색이 없는 데모·개인 모드) 전용. */
    const tokens = poolReady ? [] : query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const maxHours = WITHIN_HOURS[filters.within];
    const base = items.filter((item) => {
      if (filters.target === "ads") return false; // 메타광고만 볼 때는 오가닉을 안 섞는다
      if (filters.target !== "all" && item.channel !== filters.target) return false;
      if (filters.favOnly && !favoriteIds.has(item.id)) return false;
      if (filters.overOnly && !overAvgMultiple.has(item.id)) return false;
      if (maxHours !== null && item.collectedAgoHours > maxHours) return false;
      /* 업종 — 풀 소재는 category 자리에 업종 라벨이 들어오고(lib/pool/bridge.ts),
         예전 개인 수집분은 AI 자동 분류 문구가 들어온다. 어느 쪽이든 글자에서 업종을
         추정해 맞춘다 — 안 그러면 고정 업종 칩이 옛 자료에서 항상 0건이 되어
         눌러도 아무 일도 안 일어나는 버튼이 된다. */
      if (filters.industries.length > 0) {
        const ind = industryFromText(item.category, item.title, item.summary);
        if (!ind || !filters.industries.includes(ind)) return false;
      }
      /* categories 는 **광고주 축**이라 오가닉에는 적용하지 않는다.
         칩은 메타광고 탭에서만 렌더되는데, 광고주를 고른 뒤 인스타 탭으로 넘어가면
         '올리브영'이 업종 라벨과 영영 안 맞아 결과가 통째로 0건이 됐다.
         그 칩은 오가닉 화면에 보이지도 않아 사용자가 지울 방법조차 없었다.
         (이 블록은 위에서 target==='ads' 를 이미 걸러냈으므로 여기 오는 건 항상 오가닉이다.) */
      if (filters.hooks.length > 0 && !item.hooks.some((h) => filters.hooks.includes(h))) return false;
      if (!passMetric(item.views, filters.views)) return false;
      if (!passMetric(item.likes, filters.likes)) return false;
      if (!passMetric(item.comments ?? 0, filters.comments)) return false;
      if (filters.sources.length > 0 && !filters.sources.includes(item.matchedSource)) return false;
      if (tokens.length > 0) {
        /* 검색 범위 — '영상 대본'을 고르면 추출해 둔 대본만 훑는다.
           대본이 없는 항목은 그 모드에서 애초에 대상이 아니다(빈 문자열이라 자동 탈락). */
        const haystack =
          filters.scope === "transcript"
            ? (item.transcript ?? "").toLowerCase()
            : /* 다단어는 AND — 단일 문자열 includes였을 때 "웨딩 릴스"처럼 띄우면 0건이 됐다 */
              [
                item.title,
                item.caption,
                item.summary,
                item.creatorHandle,
                item.category,
                item.matchedSource,
                item.note,
                ...(item.hashtags ?? []),
                ...item.hooks,
              ]
                .join(" ")
                .toLowerCase();
        if (!tokens.every((t) => haystack.includes(t))) return false;
      }
      return true;
    });

    if (filters.sort === "views") return [...base].sort((a, b) => itemScore(b) - itemScore(a));
    if (filters.sort === "likes") return [...base].sort((a, b) => b.likes - a.likes);
    if (filters.sort === "posted") {
      /* 게시 시각을 모르는 항목(0019 이전 수집분)은 목록 끝으로 */
      return [...base].sort(
        (a, b) =>
          (a.postedAgoHours ?? Number.MAX_SAFE_INTEGER) - (b.postedAgoHours ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return [...base].sort((a, b) => a.collectedAgoHours - b.collectedAgoHours);
  }, [items, filters, favoriteIds, overAvgMultiple, query, poolReady]);

  /* 메타광고 — 틱톡·스레드엔 게재되지 않으므로 그 채널 필터에선 항상 제외.
     인스타 필터에선 platforms에 INSTAGRAM이 걸린 광고만 함께 보여준다. */
  const filteredAds = useMemo(() => {
    // 풀 모드는 서버 검색(글자+의미) 결과라 토큰 재필터 금지 — filteredItems 와 같은 이유
    const tokens = poolReady ? [] : query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const maxHours = WITHIN_HOURS[filters.within];
    return ads.filter((ad) => {
      /* 「영상 대본」 검색에서는 광고를 제외한다 — 광고에는 transcript 필드가 아예 없는데
         아래 haystack 이 body·문구를 훑어서, «대본 안에서 찾는다»고 안내해 놓고 광고 문구가
         걸려 나왔다(실측: 「여름」 → 대본 없는 메타광고 1건). filteredItems 는 scope 를 보는데
         여기만 안 보고 있었다. */
      if (filters.scope === "transcript") return false;
      if (filters.target === "tiktok" || filters.target === "threads") return false;
      if (filters.target === "instagram" && !ad.platforms.includes("INSTAGRAM")) return false;
      if (filters.favOnly && !adFavoriteIds.has(ad.id)) return false;
      if (filters.overOnly) return false; // 광고는 반응 지표가 없어 '잘 나온 것' 판정 대상이 아니다
      /* 조회수·좋아요·댓글 조건이 하나라도 걸리면 광고는 제외한다. 메타는 광고의 반응
         지표를 공개하지 않으므로 "조회수 1만 이상"에 광고가 섞여 나오면 거짓말이 된다. */
      if (filters.views || filters.likes || filters.comments) return false;
      if (maxHours !== null && ad.collectedAgoHours > maxHours) return false;
      if (filters.industries.length > 0) {
        const ind = industryFromText(ad.category, ad.pageName, ad.body);
        if (!ind || !filters.industries.includes(ind)) return false;
      }
      if (filters.sources.length > 0 && !filters.sources.includes(ad.matchedSource)) return false;
      /* 광고 화면에서는 카테고리 축을 광고주(pageName)로 재사용한다 */
      if (filters.target === "ads" && filters.categories.length > 0 && !filters.categories.includes(ad.pageName)) {
        return false;
      }
      if (filters.target !== "ads" && (filters.categories.length > 0 || filters.hooks.length > 0)) return false;
      if (tokens.length > 0) {
        const haystack = [ad.body, ad.pageName, ad.matchedSource, ad.ctaText ?? "", ad.category, ad.aiComment]
          .join(" ")
          .toLowerCase();
        if (!tokens.every((t) => haystack.includes(t))) return false;
      }
      return true;
    });
  }, [ads, filters, adFavoriteIds, query, poolReady]);

  /* 통합 목록 — 광고는 조회·좋아요가 없어 반응 기반 정렬에서는 뒤에 붙이고,
     시간 기반 정렬에서는 완전히 섞는다 */
  const displayEntries = useMemo<Entry[]>(() => {
    const itemEntries: Entry[] = filteredItems.map((data) => ({ kind: "item", data }));
    const adEntries: Entry[] = [...filteredAds]
      .sort((a, b) => a.collectedAgoHours - b.collectedAgoHours)
      .map((data) => ({ kind: "ad", data }));
    if (filters.sort === "recent" || filters.sort === "posted") {
      return [...itemEntries, ...adEntries].sort((a, b) => a.data.collectedAgoHours - b.data.collectedAgoHours);
    }
    return [...itemEntries, ...adEntries];
  }, [filteredItems, filteredAds, filters.sort]);


  /* ---------------- 탐색 섹션 (검색어·필터가 없을 때) — 스니핏 구조 ---------------- */

  const [savedOffset, setSavedOffset] = useState(0);
  const [risingOffset, setRisingOffset] = useState(0);

  /* ① 자주 저장된 레퍼런스 — 서버가 이미 히트 순(저장 부스트 포함)으로 내려준다.
     상위 25개 안에서 5개씩 돌려 보여준다("다른 레퍼런스 보기"). */
  const savedPool = useMemo<Entry[]>(() => {
    const merged: Entry[] = [
      ...ads.map((data) => ({ kind: "ad" as const, data })),
      ...items.map((data) => ({ kind: "item" as const, data })),
    ];
    return merged.slice(0, 25);
  }, [ads, items]);

  /* ② 팔로워 수 대비 인기 영상 — 조회수/팔로워 배수 순.
     최근 3일 내 게시분을 우선하고(스니핏 문구 그대로), 풀 초기라 3일 내가 비면
     전체에서 뽑는다 — 섹션이 통째로 사라지는 것보다 낫고 부제로 구분한다. */
  const rising = useMemo(() => {
    const candidates = items.filter((i) => i.views > 0 && i.followerCount > 0);
    const ranked = [...candidates].sort(
      (a, b) => b.views / b.followerCount - a.views / a.followerCount,
    );
    const recent = ranked.filter((i) => (i.postedAgoHours ?? Infinity) <= 72);
    const pool = recent.length >= 5 ? recent : ranked;
    return {
      pool: pool.slice(0, 25).map((data) => ({ kind: "item" as const, data })),
      isRecent: recent.length >= 5,
    };
  }, [items]);

  /* ---------------- 액션 ---------------- */

  function openDrawer(tab: DrawerTab, seed?: string) {
    setDrawerTab(tab);
    if (seed !== undefined) setSourceInput(seed);
    setDrawerOpen(true);
  }

  async function handleAddSource(input: { channel: Channel; kind: ReferenceSource["kind"]; value: string }) {
    const result = await addReferenceSource(input);
    if (result.ok) {
      setSources((prev) => [...prev, result.source]);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }

  async function handleRemoveSource(id: string) {
    const before = sources;
    setSources((prev) => prev.filter((s) => s.id !== id)); // 낙관적 제거
    const result = await removeReferenceSource(id);
    if (!result.ok) setSources(before);
    return result;
  }

  async function handleAddAdSource(value: string) {
    const result = await addAdSource({ value });
    if (result.ok) {
      setAdSources((prev) => [...prev, result.source]);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }

  async function handleRemoveAdSource(id: string) {
    const before = adSources;
    setAdSources((prev) => prev.filter((s) => s.id !== id));
    const result = await removeAdSource(id);
    if (!result.ok) setAdSources(before);
    return result;
  }

  function handleUpdateSettings(next: CollectSettings) {
    setSettings(next);
    if (isDemo) return;
    void saveCollectSettings(next);
  }

  /**
   * 검색어 기반 [지금 수집하기] — 검색하듯 키워드를 치면 **그 주제를 그 자리에서** 모아온다.
   * (2026-08-15 사장님 지시로 재편. 예전 구조 — 수집 설정에 기준을 먼저 등록해 두고
   * 등록분을 일괄 수집 — 는 풀 모드에서 폐기했다. 검색창 옆 버튼이 "등록된 수집 기준이
   * 없어요"라고 답하는 게 그 구조의 결함이었다.)
   * 결과는 공용 풀에 적재되고, 성공하면 같은 검색을 다시 돌려 방금 소재가 바로 보인다.
   */
  async function collectByQuery(rawQuery: string) {
    if (collecting) return;
    const raw = rawQuery.trim();
    /* 표시·재검색·수집에 쓰는 정규형(접두 기호 제거). 계정 수집 신호인 '@'만 아래에서 되살린다. */
    const bare = raw.replace(/^[#@]+/, "").trim();
    const key = collectKey(raw, filters.target);
    if (bare.length < 2 || bare.length > 60) {
      /* canCollectQuery 가 같은 조건으로 버튼을 숨기므로 여기 오는 건 이례적인 경로다.
         서버에 보내면 문맥 안 맞는 에러가 돌아오니 여기서 같은 기준으로 거른다. */
      setToast({ tone: "notice", text: "수집할 검색어는 2~60자로 입력해 주세요" });
      return;
    }
    setToast(null);
    setCollecting(true);
    /* 시도 즉시 기록 — 공급사 호출은 결과가 0건이어도 돈이 나가므로, 같은 검색어를
       연달아 누르지 못하게 먼저 닫는다(공용 예산 보호). 우리 쪽 오류(retriable)로
       끝나면 아래에서 다시 열어 준다 — 안 그러면 "다시 시도하라"면서 버튼이 없는
       막다른 화면이 된다(적대 검증 확정). */
    setCollectedQueries((prev) => new Set(prev).add(key));
    const allowRetry = () =>
      setCollectedQueries((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

    if (isDemo) {
      setCollectOverlay("데모 수집을 실행하고 있어요");
      // 이벤트 핸들러 안의 타이머 — 데모 수집 시뮬레이션
      setTimeout(() => {
        setCollecting(false);
        setCollectOverlay(null);
        setToast({ tone: "notice", text: `데모 수집 완료 — 실제 계정에서는 '${bare}' 소재를 그 자리에서 모아옵니다` });
      }, 1200);
      return;
    }

    try {
      /* 실시간 수집은 인스타그램 전용이다(collectPoolNow — 공급사 즉시 호출).
         메타광고·틱톡·스레드 탭에서 그 경로를 타면 크레딧은 나가는데 인스타 소재만
         쌓이고, 재검색은 그 탭 필터라 방금 수집분이 하나도 안 보인다(리뷰 확정 결함).
         → 해당 탭은 다음 수집 회차 최우선 예약으로 보낸다. INSERT 한 건짜리 작업이라
         전체화면 오버레이는 띄우지 않는다. */
      const QUEUE_PLATFORM: Partial<Record<LibraryFilters["target"], { platform: string; label: string }>> = {
        ads: { platform: "meta_ads", label: "메타광고" },
        tiktok: { platform: "tiktok", label: "틱톡" },
        threads: { platform: "threads", label: "스레드" },
      };
      const queued = QUEUE_PLATFORM[filters.target];
      if (queued) {
        const r = await requestPoolCollect([{ value: bare, platform: queued.platform }]);
        if (!r.ok && r.retriable) allowRetry();
        const text = r.ok
          ? `'${bare}' ${queued.label} 소재를 다음 수집 회차에 모아 둘게요 — 반영에는 시간이 조금 걸려요.`
          : (r.error ?? "수집 예약에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setCollectNote({ key, text });
        setToast({ tone: r.ok ? "notice" : "error", text });
        return;
      }

      setCollectOverlay(`'${bare}' 소재를 지금 수집하고 있어요 — 수십 초 걸릴 수 있어요`);
      /* kind 명시: '@'는 계정, 공백 포함 다단어는 릴스 검색(keyword). 안 넘기면 서버가
         다단어를 통째로 해시태그 조회해 항상 0건 — 무료 월 1회 한도만 태운다(리뷰 확정). */
      const isAccount = raw.startsWith("@");
      const kind = isAccount ? "account" : /\s/.test(bare) ? "keyword" : "hashtag";
      /* '@ 올리브영'처럼 기호 뒤 공백이 붙은 입력을 그대로 보내면 핸들에 공백이 남아
         무조건 0건이 된다 — 정규화한 형태로 보낸다(기호는 계정 신호라 유지). */
      const r = await collectPoolNow([{ value: isAccount ? `@${bare}` : bare, kind }]);
      if (r.ok) {
        const text = `'${bare}' 소재 ${r.added}건을 지금 수집했어요`;
        setCollectNote({ key, text });
        setToast({ tone: "notice", text });
        /* 확정 검색어를 접두 기호 없는 형태로 갱신 — 재검색과 입력칸 동기화가 한 번에 된다.
           '#세일'을 그대로 재검색하면 캡션의 '세일'과 안 맞아 방금 수집분이 안 보인다(리뷰 확정). */
        applyQuery(bare);
        // 탐색 피드(초기 props)에도 방금 적재분이 보이게 서버 데이터 재조회
        router.refresh();
      } else {
        if (r.retriable) allowRetry();
        const text = r.error ?? "수집에 실패했어요. 잠시 후 다시 시도해 주세요.";
        setCollectNote({ key, text });
        setToast({ tone: "error", text });
      }
    } catch {
      // 네트워크·서버 액션 자체 실패 — 공급사 호출 여부와 무관하게 사용자에겐 재시도가 답이다
      allowRetry();
      setCollectNote(null);
      setToast({ tone: "error", text: "수집 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setCollecting(false);
      setCollectOverlay(null);
    }
  }

  /** 개인 수집 모드 전용 [지금 수집] — 등록해 둔 기준을 일괄 수집한다. 풀·데모 모드에서는
      버튼 자체가 숨고(SearchConsole showCollectSettings), 수집은 collectByQuery 가 맡는다. */
  async function handleCollect() {
    if (collecting) return;
    setToast(null);

    setCollecting(true);
    setCollectOverlay("등록한 기준으로 콘텐츠를 수집하고 AI가 요약과 후킹 태그를 붙입니다 — 수십 초 걸릴 수 있어요");
    try {
      const [result, adResult] = await Promise.all([
        runCollection(),
        adSources.length > 0 ? runAdCollection() : Promise.resolve(null),
      ]);

      const parts: string[] = [];
      let tone: "notice" | "error" = "notice";

      if (result.ok) {
        /* 새로 들어온 게 없고 중복만 나온 건 실패가 아니라 "이미 최신"이다 */
        if (result.added === 0 && result.duplicates > 0) {
          parts.push(`레퍼런스는 이미 최신 상태예요 (새 게시물 0건)`);
        } else {
          parts.push(`레퍼런스 ${result.added}건 수집`);
          if (result.duplicates > 0) parts.push(`중복 ${result.duplicates}건 제외`);
        }
        if (result.excludedLowQuality > 0) parts.push(`반응 낮은 ${result.excludedLowQuality}건 제외`);
        if (result.failedSources.length > 0) {
          parts.push(`기준 ${result.failedSources.map((v) => `'${v}'`).join(", ")}은 실패`);
        }
        if (result.aiWarning) {
          parts.push(result.aiWarning);
          tone = "error";
        }
      } else if (result.reason !== "no_sources") {
        parts.push(result.error);
        tone = "error";
      }

      if (adResult) {
        if (adResult.ok) {
          parts.push(
            adResult.added === 0 && adResult.duplicates > 0
              ? "메타광고도 이미 최신 상태예요"
              : `메타광고 ${adResult.added}건 수집`,
          );
        } else if (adResult.reason !== "no_sources") {
          parts.push(adResult.error);
          tone = "error";
        }
      }

      if (parts.length === 0) parts.push("등록된 수집 기준이 없어요 — 먼저 기준을 추가해 주세요.");
      setToast({ tone, text: parts.join(" · ") });
      router.refresh();
    } catch {
      setToast({ tone: "error", text: "수집 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setCollecting(false);
      setCollectOverlay(null);
    }
  }

  async function toggleFavorite(id: string) {
    const was = favoriteIds.has(id);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (was) next.delete(id);
      else next.add(id);
      return next;
    });
    if (isDemo) return;
    const result = poolReady ? await togglePoolSave(id, !was) : await toggleReferenceFavorite(id, !was);
    if (!result.ok) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (was) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }

  async function toggleAdFav(id: string) {
    const was = adFavoriteIds.has(id);
    setAdFavoriteIds((prev) => {
      const next = new Set(prev);
      if (was) next.delete(id);
      else next.add(id);
      return next;
    });
    if (isDemo) return;
    /* 광고도 풀에서는 같은 creatives 표의 행이다 — 저장 경로가 하나로 합쳐진다 */
    const result = poolReady ? await togglePoolSave(id, !was) : await toggleAdFavorite(id, !was);
    if (!result.ok) {
      setAdFavoriteIds((prev) => {
        const next = new Set(prev);
        if (was) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }

  function renderEntry(entry: Entry) {
    if (entry.kind === "item") {
      return (
        <ReferenceCard
          key={entry.data.id}
          item={entry.data}
          favorite={favoriteIds.has(entry.data.id)}
          onToggleFavorite={() => toggleFavorite(entry.data.id)}
          overAvgMultiple={overAvgMultiple.get(entry.data.id)}
          onOpen={() => setSelectedId(entry.data.id)}
        />
      );
    }
    return (
      <AdCard
        key={entry.data.id}
        ad={entry.data}
        favorite={adFavoriteIds.has(entry.data.id)}
        onOpen={() => setSelectedAdId(entry.data.id)}
        onToggleFavorite={() => toggleAdFav(entry.data.id)}
      />
    );
  }

  const totalCollected = items.length + ads.length;
  const totalSources = sources.length + adSources.length;
  /* 검색어 수집 CTA 노출 조건 — 전부 "누르면 실제로 뭔가 일어난다"의 필요조건이다.
     ① 수집 가능한 길이(서버 판정과 같은 기준 — 아니면 눌러도 거절만 하는 죽은 버튼)
     ② 풀이 그 검색어를 모른다(isGap)거나 데모. isGap=false 인 0건은 서버엔 있는데
        클라이언트 필터가 다 걸러낸 것이라 수집해도 화면이 안 변하고 재과금만 된다 —
        그 경우의 정답은 필터 풀기다.
     ③ 검색 응답 대기 중이 아니다 — 대기 중엔 isGap 이 이전 검색어의 값이라 오과금된다.
     ④ 이 검색어로 아직 시도하지 않았다. (전부 적대 리뷰 확정 결함) */
  const collectableQuery = query.trim().replace(/^[#@]+/, "").trim();
  const collectAttemptKey = collectKey(query, filters.target);
  const canCollectQuery =
    collectableQuery.length >= 2 &&
    collectableQuery.length <= 60 &&
    (poolReady ? poolResult?.isGap === true : isDemo) &&
    !poolSearching &&
    !collectedQueries.has(collectAttemptKey);
  /* .grid-refs — globals.css의 모션 체계가 소유한다. 모바일 2열 고정,
     40rem부터 auto-fill minmax(14rem)이라 카드 폭이 224~240px 밴드에 머문다.
     하드코딩 컬럼 수를 화면마다 두면 loading.tsx와 어긋나 로딩→콘텐츠에서 시프트가 난다. */
  const gridCls = "grid-refs";

  /* 폭 캡 제거(2026-08-17). 탐색은 앱에서 **가장 넓게 써야 할 화면**인데
     1400px 로 묶여 있어, grid-refs 의 컨테이너 쿼리가 6·7열까지 열려 있어도
     5열에서 멈추고 좌우가 비었다. */
  return (
    <div className="w-full">
      <h1 className="sr-only">레퍼런스</h1>

      {/* ── 블록 1 — 검색 콘솔 ── */}
      <SearchConsole
        query={query}
        onQueryChange={applyQuery}
        onClearAll={clearAll}
        filters={filters}
        setFilters={applyFilters}
        resultCount={displayEntries.length}
        hasQuery={hasQuery}
        hookFacets={hookFacets}
        sourceFacets={sourceFacets}
        advertiserFacets={advertiserFacets}
        registeredSources={[
          ...sources.map((s) => ({ id: s.id, value: s.value, kind: s.kind as string })),
          ...adSources.map((s) => ({ id: s.id, value: s.value, kind: "ads" })),
        ]}
        onOpenSettings={() => openDrawer("sources")}
        onCollect={handleCollect}
        collecting={collecting}
        showCollectSettings={!poolReady && !isDemo}
      />

      {/* 토스트 — 문서 흐름 밖(fixed). 예전엔 mt-4 인라인 <p>라 뜰 때마다 결과 그리드를
          40px 밀어냈다. 이 화면에서 실측된 유일한 레이아웃 시프트였다. */}
      <div
        aria-live={toast?.tone === "error" ? "assertive" : "polite"}
        /* 모바일에서는 하단 탭바(fixed bottom-0, z-40, 높이 61px) 위로 올린다 —
           같은 z 에 DOM 이 뒤라 탭바가 토스트를 덮어, 두 줄짜리 안내의 아랫줄이 안 읽혔다(실측 390px).
           safe-area 를 더해 홈 인디케이터가 있는 기기에서도 가려지지 않게 한다. */
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 flex justify-center px-4 md:bottom-6"
      >
        <p
          data-open={toast ? "true" : "false"}
          role={toast?.tone === "error" ? "alert" : "status"}
          className={cn(
            "toast-pop pointer-events-auto flex max-w-xl items-start gap-1.5 rounded-card border border-line-strong bg-overlay px-4 py-2.5 text-[14px] shadow-pop",
            toast?.tone === "error" ? "text-negative" : "text-fg-sub",
          )}
        >
          <Info className="mt-0.5 size-3.5 shrink-0 text-fg-faint" aria-hidden />
          {toast?.text ?? ""}
        </p>
      </div>

      {/* ── 블록 2 — 결과 영역 ── */}
      {/* 서버 검색 중에는 결과를 지우지 않고 살짝 물러나게만 한다.
          지웠다 다시 그리면 타이핑 한 글자마다 화면이 깜빡이고, 스크롤 위치도 튄다. */}
      <section
        aria-label="레퍼런스 결과"
        aria-busy={poolSearching}
        className={cn("results-area mt-5 transition-opacity duration-150", poolSearching && "opacity-60")}
      >
        {/* ①·② 는 **개인 수집 모드 전용** 온보딩이다. 풀·데모 모드에서 열어두면
            0건 검색(totalCollected 는 현재 검색 결과 길이다)이 여기로 떨어져
            폐기한 "수집 기준 등록" 흐름과 개인 일괄 수집(handleCollect — 풀 화면에
            안 보이는 표에 과금 수집)으로 유도된다(적대 리뷰 확정 결함). */}
        {!poolReady && !isDemo && totalSources === 0 && totalCollected === 0 ? (
          /* ① 신규 — 온보딩으로 결과 영역을 대체한다(추가가 아니라 대체) */
          <Card className="p-8 text-center">
            <p className="text-[17px] font-semibold text-fg">1분이면 첫 레퍼런스가 도착해요</p>
            <p className="mt-1.5 text-[15px] text-fg-sub">
              관심 키워드나 계정을 등록하면 매일 아침 자동으로 모아드려요.
            </p>
            <p className="mt-1 text-[14px] text-fg-sub">① 주제·계정 등록 → ② 채널 선택 → ③ 매일 자동 수집</p>
            <div className="mt-5">
              <Button onClick={() => openDrawer("sources")}>수집 기준 등록하기</Button>
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-[12px] font-semibold text-fg-faint">이런 주제로 시작해보세요</p>
              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                {TREND_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => openDrawer("sources", c)}
                    className="cursor-pointer rounded-chip bg-overlay px-3 py-1 text-[14px] text-fg-sub trans-state hover:text-fg"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        ) : !poolReady && !isDemo && totalCollected === 0 ? (
          /* ② 기준은 있는데 수집물 0건 */
          <EmptyState
            icon={Zap}
            title="이제 수집할 준비가 됐어요"
            description={`기준 ${totalSources}개 등록됨 — '지금 수집'을 누르면 첫 수집이 시작됩니다. 매일 아침에도 자동으로 모아둘게요.`}
            action={
              <Button onClick={handleCollect} disabled={collecting} aria-busy={collecting}>
                {collecting ? "수집 중…" : "지금 수집"}
              </Button>
            }
          />
        ) : displayEntries.length > 0 ? (
          /* 탐색 상태(검색어 없음)는 스니핏 구조다: 큐레이션 섹션 → 전체 그리드.
             섹션은 항상 5장 고정 창이라, 예전 선반처럼 "카드 1장이 화면을 덮는" 붕괴가 없다.
             검색을 시작하면 섹션이 사라지고 결과 그리드만 남는다. */
          <>
            {!hasQuery && savedPool.length >= 5 ? (
              <div className="mb-8">
                <SectionHead
                  title="자주 저장된 레퍼런스"
                  subtitle="다른 사용자가 자주 저장한 레퍼런스를 모아봤어요"
                  moreLabel="다른 레퍼런스 보기"
                  onMore={() => setSavedOffset((v) => v + 1)}
                />
                <div className="grid-refs mt-3">{windowOf(savedPool, savedOffset, 5).map(renderEntry)}</div>
              </div>
            ) : null}

            {!hasQuery && rising.pool.length >= 3 ? (
              <div className="mb-8">
                <SectionHead
                  title="팔로워 수 대비 인기 영상"
                  subtitle={
                    rising.isRecent
                      ? "최근 3일 내에 업로드된 영상 중 팔로워 수 대비 조회수가 높은 영상들을 가져왔어요"
                      : "팔로워 수 대비 조회수가 높은 영상들을 모아봤어요"
                  }
                  moreLabel="다른 영상 보기"
                  onMore={() => setRisingOffset((v) => v + 1)}
                />
                <div className="grid-refs mt-3">{windowOf(rising.pool, risingOffset, 5).map(renderEntry)}</div>
              </div>
            ) : null}

            {!hasQuery ? (
              <div className="mb-3 flex items-baseline gap-2.5">
                <h2 className="text-[17px] font-semibold text-fg">전체 레퍼런스</h2>
                <span className="tnum text-[12px] text-fg-sub">{displayEntries.length}건</span>
              </div>
            ) : null}
            {/* 미적중(글자 일치 0건)인데 의미 검색 보충으로 화면이 채워진 경우 —
                비슷한 소재임을 알리고, 검색어 그대로의 수집을 한 번에 걸 수 있게 한다.
                이미 이 검색어로 수집했으면 숨긴다(재과금 루프 차단). */}
            {poolResult?.isGap && canCollectQuery ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-line bg-body px-4 py-3">
                <p className="text-[14px] text-fg-sub">
                  &lsquo;{query.trim()}&rsquo;와 정확히 일치하는 소재는 아직 없어서 비슷한 소재를 보여드리고 있어요.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => collectByQuery(query)}
                  disabled={collecting}
                  aria-busy={collecting}
                  className="h-9 px-3"
                >
                  <Zap className="size-3.5" aria-hidden />
                  {collecting ? "수집 중…" : "지금 수집하기"}
                </Button>
              </div>
            ) : null}
            <div className={gridCls}>{displayEntries.slice(0, visibleCount).map(renderEntry)}</div>
            <div className="mt-6 flex justify-center">
              {displayEntries.length > visibleCount ? (
                <Button variant="ghost" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                  더 보기
                </Button>
              ) : displayEntries.length > PAGE_SIZE ? (
                <p className="text-[14px] text-fg-sub">모두 불러왔어요</p>
              ) : null}
            </div>
          </>
        ) : (
          /* ④ 검색·필터 결과 0건 — 문구만 있는 빈 상태를 만들지 않는다 */
          <EmptyState
            icon={SearchX}
            title={
              query.trim()
                ? `'${query.trim()}'${activeFilterCount > 0 ? " · 지금 조건" : ""}에 맞는 레퍼런스가 없어요`
                : "이 조건에 맞는 레퍼런스가 없어요"
            }
            description={
              canCollectQuery
                ? poolResult?.isGap
                  ? "아직 공용 자료에 없는 주제예요 — 지금 바로 모아올 수 있어요."
                  : "조건을 하나씩 풀어보거나, 이 검색어로 바로 수집해 보세요."
                : collectNote?.key === collectAttemptKey
                  ? collectNote.text
                  : collectedQueries.has(collectAttemptKey)
                    ? "이 검색어는 수집을 한 번 걸어봤어요 — 다른 말로 검색해 보셔도 좋아요."
                  : !poolReady && !isDemo
                    ? "조건을 하나씩 풀어보거나, 아직 안 모은 주제라면 새 수집 기준으로 만들어보세요."
                    : activeFilterCount > 0
                      ? "조건을 하나씩 풀어보세요 — 필터를 좁힌 만큼 결과가 줄어요."
                      : "다른 말로 검색해 보세요 — 짧은 단어일수록 잘 찾아져요."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {query.trim() ? (
                  <Button variant="ghost" onClick={() => applyQuery("")}>
                    검색어 지우기
                  </Button>
                ) : null}
                {activeFilterCount > 0 ? (
                  <Button variant="ghost" onClick={() => applyFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>
                    필터 초기화
                  </Button>
                ) : null}
                {/* 풀·데모 모드 — 검색어가 곧 수집 기준이다. 치던 말 그대로 그 자리에서 모아온다
                    (2026-08-15 사장님 지시: "그냥 검색하는 것처럼 수집"). */}
                {canCollectQuery ? (
                  <Button onClick={() => collectByQuery(query)} disabled={collecting} aria-busy={collecting}>
                    <Zap className="size-4" aria-hidden />
                    {collecting ? "수집 중…" : `'${query.trim()}' 지금 수집하기`}
                  </Button>
                ) : null}
                {/* 수집을 이미 건 검색어 — 반영을 직접 확인할 수단을 준다.
                    안내문이 "시간이 조금 걸려요"라고 말하면서 확인 버튼이 없으면 막다른 화면이다. */}
                {poolReady && collectedQueries.has(collectAttemptKey) ? (
                  <Button
                    variant="secondary"
                    onClick={() => runPoolSearch(query, filters, 0)}
                    disabled={poolSearching}
                    aria-busy={poolSearching}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                    {poolSearching ? "확인 중…" : "다시 확인"}
                  </Button>
                ) : null}
                {/* 개인 수집 모드 — 등록된 기준 어디에도 없는 검색어 = 콜드스타트 */}
                {!poolReady && !isDemo && query.trim() && !sourceFacets.some((s) => s.value.includes(query.trim())) ? (
                  <Button onClick={() => openDrawer("sources", query.trim())}>
                    &lsquo;{query.trim()}&rsquo;로 수집 기준 만들기
                  </Button>
                ) : null}
              </div>
            }
          />
        )}

        {totalCollected > 0 && totalSources === 0 ? (
          <p className="mt-6 flex items-start gap-1.5 text-[12px] text-fg-faint">
            <FolderPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            수집 기준을 등록하면 매일 아침 자동으로 새 레퍼런스가 쌓여요.
          </p>
        ) : null}
      </section>

      {/* ── 흐름 밖 ── */}

      <LibrarySettingsDrawer
        open={drawerOpen}
        tab={drawerTab}
        onTabChange={setDrawerTab}
        onClose={() => setDrawerOpen(false)}
        sources={sources}
        adSources={adSources}
        baselines={baselines}
        settings={settings}
        isDemo={isDemo}
        value={sourceInput}
        onValueChange={setSourceInput}
        onAddSource={handleAddSource}
        onRemoveSource={handleRemoveSource}
        onAddAdSource={handleAddAdSource}
        onRemoveAdSource={handleRemoveAdSource}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* 수집 진행 — 수십 초짜리 실수집만 전체화면. 문구는 실행 경로가 정한다
          (검색어 수집·기준 일괄 수집·데모가 다르다). 광고 예약은 오버레이 없이 토스트만. */}
      {collectOverlay ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-body/85 backdrop-blur-sm"
        >
          <div className="collect-orbit">
            <FinchMark className="size-12 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-[17px] font-bold">레퍼런스를 모으는 중이에요</p>
            <p className="mt-1.5 text-[15px] text-fg-sub">{collectOverlay}</p>
          </div>
        </div>
      ) : null}

      {selectedAd ? (
        <AdDetailModal
          ad={selectedAd}
          similar={similarAds}
          favorite={adFavoriteIds.has(selectedAd.id)}
          savedIds={adFavoriteIds}
          onToggleFavorite={() => toggleAdFav(selectedAd.id)}
          onToggleSave={(id) => toggleAdFav(id)}
          onSelect={(a) => setSelectedAdId(a.id)}
          onClose={() => setSelectedAdId(null)}
        />
      ) : null}

      {selectedItem ? (
        <ReferenceDetailModal
          item={selectedItem}
          poolMode={poolReady}
          favorite={favoriteIds.has(selectedItem.id)}
          isDemo={isDemo}
          onToggleFavorite={() => toggleFavorite(selectedItem.id)}
          onClose={() => setSelectedId(null)}
          onDeleted={() => {
            setSelectedId(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
