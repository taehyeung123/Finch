"use client";

import { useMemo, useState } from "react";
import { Bookmark, Flame, Info, Search, SearchX } from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import type { Channel, ChannelFilter, TrendItem } from "@/lib/types";
import { CHANNEL_FILTERS } from "@/lib/channels";
import { formatCompact } from "@/lib/format";
import { trendItems, TREND_CATEGORIES } from "@/lib/data";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { ChannelBadge, DataSourceBadge } from "@/components/ui/badge";
import { ChipFilter } from "@/components/ui/chip-filter";
import { InfoTip } from "@/components/ui/info-tip";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { EmptyState } from "@/components/ui/empty-state";

type Tab = "realtime" | "category";
type SortKey = "views" | "reach" | "likes";

const TABS: { value: Tab; label: string }[] = [
  { value: "realtime", label: "실시간 급상승" },
  { value: "category", label: "카테고리별" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "views", label: "조회수순" },
  { value: "reach", label: "급상승순" },
  { value: "likes", label: "좋아요순" },
];

/* 썸네일 자리 표시용 채널 아이콘 — 실제 미디어 연동 전까지 브랜드 글리프로 목 처리 */
const CHANNEL_ICON: Record<Channel, (props: { className?: string }) => React.ReactNode> = {
  instagram: InstagramGlyph,
  tiktok: TiktokGlyph,
  threads: ThreadsGlyph,
};

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>("realtime");
  const [category, setCategory] = useState<string>("전체");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [sort, setSort] = useState<SortKey>("views");
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    // 검색어·채널 필터는 두 탭 공통 적용
    const base = trendItems.filter(
      (item) =>
        (channel === "all" || item.channel === channel) &&
        (q === "" ||
          item.title.toLowerCase().includes(q) ||
          item.creatorHandle.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)),
    );
    if (tab === "realtime") {
      return base.sort((a, b) => a.postedAgoHours - b.postedAgoHours);
    }
    const filtered = base.filter((item) => category === "전체" || item.category === category);
    return filtered.sort((a, b) => {
      if (sort === "reach") return b.reachScore - a.reachScore;
      if (sort === "likes") return b.likes - a.likes;
      return b.views - a.views;
    });
  }, [tab, category, channel, sort, query]);

  const toggleSave = (id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="트렌드 탐색"
        description="지금 뜨는 콘텐츠를 카테고리와 채널별로 살펴보세요."
        action={<DataSourceNote />}
      />

      {/* 탭: 실시간 급상승 / 카테고리별 */}
      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="탐색 방식">
        {TABS.map((t) => {
          const active = t.value === tab;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[14px] font-semibold transition-colors",
                active
                  ? "border-primary text-fg"
                  : "border-transparent text-fg-sub hover:text-fg",
              )}
            >
              {t.value === "realtime" ? <Flame className="size-4" aria-hidden /> : null}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 검색 — 검색어 관련 게시글 탐색 (두 탭 공통) */}
      <label className="relative block max-w-xl">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어를 입력하세요 — 제목, 크리에이터, 카테고리"
          className="h-11 w-full rounded-card border border-line bg-body pl-10 pr-4 text-[15px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </label>

      {/* 채널 필터 — 실시간·카테고리 두 탭 모두 적용 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipFilter options={CHANNEL_FILTERS} value={channel} onChange={setChannel} />
        {tab === "category" ? (
          <label className="flex items-center gap-2 text-[13px] text-fg-sub">
            정렬
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-8 rounded-card border border-line bg-overlay px-2.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {tab === "category" ? (
        <ChipFilter
          options={TREND_CATEGORIES.map((c) => ({ value: c, label: c }))}
          value={category}
          onChange={setCategory}
        />
      ) : null}

      {query.trim() !== "" ? (
        <p className="text-[13px] text-fg-sub">
          <span className="font-semibold text-fg">&lsquo;{query.trim()}&rsquo;</span> 검색 결과{" "}
          <span className="tnum font-semibold text-primary">{items.length}</span>건
        </p>
      ) : tab === "realtime" ? (
        <p className="text-[13px] text-fg-faint">최근 업로드된 순서로 급상승 콘텐츠를 보여드려요.</p>
      ) : null}

      {/* 콘텐츠 카드 그리드 */}
      {items.length > 0 ? (
        <section
          aria-label="트렌드 콘텐츠 목록"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {items.map((item) => (
            <TrendCard
              key={item.id}
              item={item}
              saved={savedIds.has(item.id)}
              onToggleSave={() => toggleSave(item.id)}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          icon={SearchX}
          title="조건에 맞는 콘텐츠가 없어요"
          description="검색어를 바꾸거나 카테고리·채널 필터를 조정해서 다시 찾아보세요. 데이터는 갱신 주기에 따라 순차적으로 채워집니다."
        />
      )}

      {/* 하단 데이터 출처 안내 */}
      <Card className="flex items-start gap-3 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
        <p className="text-[13px] leading-relaxed text-fg-sub">
          카테고리 탐색과 실시간 트렌드는 제휴 데이터 공급사 데이터로 제공되며 갱신 주기에 따라
          지연될 수 있습니다. 저장한 콘텐츠는 경쟁사 분석 목록과 연결해 함께 추적할 수 있어요.
        </p>
      </Card>
    </div>
  );
}

function TrendCard({
  item,
  saved,
  onToggleSave,
}: {
  item: TrendItem;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const ChannelIcon = CHANNEL_ICON[item.channel];
  return (
    <Card hover className="flex flex-col overflow-hidden">
      {/* 썸네일 자리 — 실제 미디어 연동 전 목 표시 */}
      <div className="flex aspect-video items-center justify-center bg-overlay" aria-hidden>
        <ChannelIcon className="size-9 text-fg-faint" />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <ChannelBadge channel={item.channel} />
            <DataSourceBadge source={item.dataSource} />
          </div>
          <button
            type="button"
            aria-pressed={saved}
            aria-label={saved ? "저장 해제" : "저장"}
            title="저장하면 경쟁사 분석 목록과 연결해 추적할 수 있어요"
            onClick={onToggleSave}
            className={cn(
              "shrink-0 rounded-card p-1.5 transition-colors",
              saved ? "text-primary" : "text-fg-faint hover:bg-overlay hover:text-fg-sub",
            )}
          >
            <Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />
          </button>
        </div>

        <div className="min-w-0">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{item.title}</p>
          <p className="mt-1 text-[13px] text-fg-sub">
            {item.creatorHandle}
            <span className="mx-1.5 text-fg-faint">·</span>
            <span className="text-fg-faint">{item.category}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-sub">
          <span>
            조회수 <span className="tnum font-semibold text-fg">{formatCompact(item.views)}</span>
          </span>
          <span>
            좋아요 <span className="tnum font-semibold text-fg">{formatCompact(item.likes)}</span>
          </span>
          <span className="text-fg-faint">{item.postedAgoHours}시간 전</span>
        </div>

        {/* 도달 스코어 — 자체 산출 지표, 계산 근거 고지 필수 (PART 4.4) */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-line pt-2.5 text-[13px]">
          <span className="text-fg-sub">도달 스코어</span>
          <span className="tnum font-bold text-primary">팔로워 대비 {item.reachScore}배</span>
          <InfoTip>
            조회수 ÷ 팔로워 수. 작은 채널의 잠재력을 가늠하는 핀치 자체 추정치이며 플랫폼 공식
            지표가 아닙니다.
          </InfoTip>
        </div>
      </div>
    </Card>
  );
}
