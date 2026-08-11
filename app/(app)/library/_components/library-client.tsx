"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Info, SearchX, Zap } from "lucide-react";
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
import { searchPoolAction } from "../pool-actions";
import { TREND_CATEGORIES } from "@/lib/data";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReferenceDetailModal } from "./reference-detail";
import { AdCard, ReferenceCard } from "./reference-card";
import { LibrarySettingsDrawer, type DrawerTab, type SourceBaseline } from "./library-settings-drawer";
import {
  DEFAULT_FILTERS,
  SearchConsole,
  countActiveFilters,
  type Facet,
  type IndustryFacet,
  type LibraryFilters,
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

/** 반응 점수 — 정렬·베이스라인 공용 (조회수 없는 스레드도 좋아요·댓글로 비교) */
function itemScore(i: ReferenceItem): number {
  return i.views + i.likes * 20 + (i.comments ?? 0) * 40;
}

type Entry = { kind: "item"; data: ReferenceItem } | { kind: "ad"; data: ReferenceAd };

const PAGE_SIZE = 60;

export function LibraryClient({
  sources: initialSources,
  settings: initialSettings,
  adSources: initialAdSources,
  items: initialItems,
  ads: initialAds,
  industryFacets,
  poolReady,
  isDemo,
}: {
  sources: ReferenceSource[];
  items: ReferenceItem[];
  settings: CollectSettings;
  adSources: AdSource[];
  ads: ReferenceAd[];
  /** 공용 풀에서 노출 자격을 통과한 업종. 풀이 비었으면 빈 배열 → 업종 줄이 안 그려진다 */
  industryFacets: IndustryFacet[];
  /**
   * 공용 풀이 준비됐는가. true 면 검색어를 서버로 보낸다 —
   * 풀은 수백만 행이라 처음 40건만 받아 브라우저에서 거르면 가짜 검색이 된다.
   * false 면 개인 수집분을 브라우저에서 거른다(기존 동작 그대로).
   */
  poolReady: boolean;
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
  const [toast, setToast] = useState<{ tone: "error" | "notice"; text: string } | null>(null);

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.favorite).map((i) => i.id)),
  );
  const [adFavoriteIds, setAdFavoriteIds] = useState<Set<string>>(
    () => new Set(ads.filter((a) => a.favorite).map((a) => a.id)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const activeFilterCount = countActiveFilters(filters);
  const hasQuery = query.trim() !== "" || activeFilterCount > 0;

  /* 업종 라벨 → id. 화면은 사람이 읽는 라벨로 다루고 서버에는 id 로 보낸다 —
     라벨은 언제든 바뀔 수 있고, 바뀌는 순간 저장된 필터 조합이 전부 깨진다. */
  const industryIdByLabel = useMemo(
    () => new Map(industryFacets.map((f) => [f.label, f.id])),
    [industryFacets],
  );

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
            industryIds: f.industries.map((l) => industryIdByLabel.get(l)).filter((v): v is string => Boolean(v)),
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
    [poolReady, industryIdByLabel],
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
      runPoolSearch(q, filters, 260);
    },
    [filters, runPoolSearch],
  );

  /* ---------------- 패싯 (수집물에 실재하는 값만) ---------------- */

  const categoryFacets = useMemo<Facet[]>(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const c = item.category || "일반";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }));
  }, [items]);

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
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.matchedSource, (counts.get(item.matchedSource) ?? 0) + 1);
    for (const ad of ads) counts.set(ad.matchedSource, (counts.get(ad.matchedSource) ?? 0) + 1);
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
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const maxHours = WITHIN_HOURS[filters.within];
    const base = items.filter((item) => {
      if (filters.target === "ads") return false; // 메타광고만 볼 때는 오가닉을 안 섞는다
      if (filters.target !== "all" && item.channel !== filters.target) return false;
      if (filters.favOnly && !favoriteIds.has(item.id)) return false;
      if (filters.overOnly && !overAvgMultiple.has(item.id)) return false;
      if (maxHours !== null && item.collectedAgoHours > maxHours) return false;
      /* 업종 — 풀 소재는 category 자리에 업종 라벨이 들어온다(lib/pool/bridge.ts) */
      if (filters.industries.length > 0 && !filters.industries.includes(item.category)) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(item.category || "일반")) return false;
      if (filters.hooks.length > 0 && !item.hooks.some((h) => filters.hooks.includes(h))) return false;
      if (filters.sources.length > 0 && !filters.sources.includes(item.matchedSource)) return false;
      if (tokens.length > 0) {
        /* 다단어는 AND — 단일 문자열 includes였을 때 "웨딩 릴스"처럼 띄우면 0건이 됐다 */
        const haystack = [
          item.title,
          item.caption,
          item.summary,
          item.creatorHandle,
          item.category,
          item.matchedSource,
          item.note,
          item.transcript,
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
  }, [items, filters, favoriteIds, overAvgMultiple, query]);

  /* 메타광고 — 틱톡·스레드엔 게재되지 않으므로 그 채널 필터에선 항상 제외.
     인스타 필터에선 platforms에 INSTAGRAM이 걸린 광고만 함께 보여준다. */
  const filteredAds = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const maxHours = WITHIN_HOURS[filters.within];
    return ads.filter((ad) => {
      if (filters.target === "tiktok" || filters.target === "threads") return false;
      if (filters.target === "instagram" && !ad.platforms.includes("INSTAGRAM")) return false;
      if (filters.favOnly && !adFavoriteIds.has(ad.id)) return false;
      if (filters.overOnly) return false; // 광고는 반응 지표가 없어 '잘 나온 것' 판정 대상이 아니다
      if (maxHours !== null && ad.collectedAgoHours > maxHours) return false;
      if (filters.industries.length > 0 && !filters.industries.includes(ad.category)) return false;
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
  }, [ads, filters, adFavoriteIds, query]);

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

  async function handleCollect() {
    if (collecting) return;
    setToast(null);

    if (isDemo) {
      setCollecting(true);
      // 이벤트 핸들러 안의 타이머 — 데모 수집 시뮬레이션
      setTimeout(() => {
        setCollecting(false);
        setToast({ tone: "notice", text: "데모 수집 완료 — 실제 계정에서는 등록한 기준으로 실수집이 실행됩니다" });
      }, 1200);
      return;
    }

    setCollecting(true);
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
    const result = await toggleReferenceFavorite(id, !was);
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
    const result = await toggleAdFavorite(id, !was);
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
        onToggleFavorite={() => toggleAdFav(entry.data.id)}
      />
    );
  }

  const totalCollected = items.length + ads.length;
  const totalSources = sources.length + adSources.length;
  /* .grid-refs — globals.css의 모션 체계가 소유한다. 모바일 2열 고정,
     40rem부터 auto-fill minmax(14rem)이라 카드 폭이 224~240px 밴드에 머문다.
     하드코딩 컬럼 수를 화면마다 두면 loading.tsx와 어긋나 로딩→콘텐츠에서 시프트가 난다. */
  const gridCls = "grid-refs";

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <h1 className="sr-only">레퍼런스</h1>

      {/* ── 블록 1 — 검색 콘솔 ── */}
      <SearchConsole
        query={query}
        onQueryChange={applyQuery}
        filters={filters}
        setFilters={applyFilters}
        resultCount={displayEntries.length}
        hasQuery={hasQuery}
        categoryFacets={categoryFacets}
        hookFacets={hookFacets}
        sourceFacets={sourceFacets}
        advertiserFacets={advertiserFacets}
        industryFacets={industryFacets}
        registeredSources={[
          ...sources.map((s) => ({ id: s.id, value: s.value, kind: s.kind as string })),
          ...adSources.map((s) => ({ id: s.id, value: s.value, kind: "ads" })),
        ]}
        onOpenSettings={() => openDrawer("sources")}
        onCollect={handleCollect}
        collecting={collecting}
      />

      {/* 토스트 — 문서 흐름 밖(fixed). 예전엔 mt-4 인라인 <p>라 뜰 때마다 결과 그리드를
          40px 밀어냈다. 이 화면에서 실측된 유일한 레이아웃 시프트였다. */}
      <div
        aria-live={toast?.tone === "error" ? "assertive" : "polite"}
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
      >
        <p
          data-open={toast ? "true" : "false"}
          role={toast?.tone === "error" ? "alert" : "status"}
          className={cn(
            "toast-pop pointer-events-auto flex max-w-xl items-start gap-1.5 rounded-card border border-line-strong bg-overlay px-4 py-2.5 text-[13px] shadow-pop",
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
        {totalSources === 0 && totalCollected === 0 ? (
          /* ① 신규 — 온보딩으로 결과 영역을 대체한다(추가가 아니라 대체) */
          <Card className="p-8 text-center">
            <p className="text-[19px] font-bold text-fg">1분이면 첫 레퍼런스가 도착해요</p>
            <p className="mt-1.5 text-[14px] text-fg-sub">
              관심 키워드나 계정을 등록하면 매일 아침 자동으로 모아드려요.
            </p>
            <p className="mt-1 text-[13px] text-fg-faint">① 주제·계정 등록 → ② 채널 선택 → ③ 매일 자동 수집</p>
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
                    className="cursor-pointer rounded-chip bg-overlay px-3 py-1 text-[13px] text-fg-sub transition-colors hover:text-fg"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        ) : totalCollected === 0 ? (
          /* ② 기준은 있는데 수집물 0건 */
          <EmptyState
            icon={Zap}
            title="이제 수집할 준비가 됐어요"
            description={`기준 ${totalSources}개 등록됨 — '지금 수집'을 누르면 첫 수집이 시작됩니다. 매일 아침에도 자동으로 모아둘게요.`}
            action={<Button onClick={handleCollect}>지금 수집</Button>}
          />
        ) : displayEntries.length > 0 ? (
          /* 첫 화면도 검색 결과도 **같은 그리드 하나**다.

             예전에는 검색어가 없을 때 큐레이션 가로 선반 3줄을 그렸다. 실측해 보니
             선반 2개가 카드 1장짜리였고, .row-shelf의 1fr 때문에 그 1장이 가로 전체를
             차지해 카드 하나가 화면을 덮었다(첫 화면 총 6장). 조건이 붙을 때만 성립하는
             레이아웃은 실제 데이터에서 무너진다.

             선반을 없애니 첫 화면이 곧 전체 목록이 된다 — 스니핏·솔라리와 같은 구조이고,
             "무엇을 볼지 고르는 화면"이 아니라 "보면서 고르는 화면"이 된다. */
          <>
            <div className={gridCls}>{displayEntries.slice(0, visibleCount).map(renderEntry)}</div>
            <div className="mt-6 flex justify-center">
              {displayEntries.length > visibleCount ? (
                <Button variant="ghost" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                  더 보기
                </Button>
              ) : displayEntries.length > PAGE_SIZE ? (
                <p className="text-[13px] text-fg-faint">모두 불러왔어요</p>
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
              poolResult?.isGap
                ? "아직 공용 자료에 없는 주제예요. 방금 검색으로 수집 대기열에 올려뒀으니 곧 채워집니다."
                : "조건을 하나씩 풀어보거나, 아직 안 모은 주제라면 새 수집 기준으로 만들어보세요."
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
                {/* 등록된 기준 어디에도 없는 검색어 = 콜드스타트.
                    /discover의 유일한 고유 가치("등록 안 한 주제도 만나는 발견")를
                    별도 화면이 아니라 검색의 자연스러운 실패 경로로 흡수한다. */}
                {query.trim() && !sourceFacets.some((s) => s.value.includes(query.trim())) ? (
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

      {/* 수집 진행 — 수십 초 걸리고 끝나면 화면 전체가 바뀌므로 전체화면이 옳다 */}
      {collecting ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-surface/85 backdrop-blur-sm"
        >
          <div className="collect-orbit">
            <FinchMark className="size-12 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-[17px] font-bold">레퍼런스를 모으는 중이에요</p>
            <p className="mt-1.5 text-[14px] text-fg-sub">
              {isDemo
                ? "데모 수집을 실행하고 있어요"
                : "등록한 기준으로 콘텐츠를 수집하고 AI가 요약과 후킹 태그를 붙입니다 — 수십 초 걸릴 수 있어요"}
            </p>
          </div>
        </div>
      ) : null}

      {selectedItem ? (
        <ReferenceDetailModal
          item={selectedItem}
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
