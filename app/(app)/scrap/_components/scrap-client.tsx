"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, ButtonLink } from "@/components/ui/button";
import { togglePoolSave } from "@/app/(app)/library/pool-actions";
import { ReferenceCard, AdCard } from "@/app/(app)/library/_components/reference-card";
import { ReferenceDetailModal } from "@/app/(app)/library/_components/reference-detail";
import { AdDetailModal } from "@/app/(app)/library/_components/ad-detail";
import { loadScrapPage } from "../actions";
import type { ScrapEntry } from "../types";
import type { ReferenceAd } from "@/lib/types";

/*
  스크랩 목록.

  탐색(/library)의 카드·상세 모달을 **그대로** 재사용한다. 저장 화면 전용 카드를
  새로 만들면 같은 소재가 화면마다 다르게 보이고, 성과 배지·후킹 태그처럼 카드가
  이미 하는 일을 두 번 구현하게 된다.

  필터는 전체/게시물/광고 셋뿐이다. 저장 목록은 검색 결과와 달리 대개 수십 건이라
  업종·후킹 패싯을 얹으면 필터가 목록보다 커진다.
*/
const TABS = [
  { key: "all", label: "전체" },
  { key: "post", label: "게시물" },
  { key: "ad", label: "광고" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const idOf = (e: ScrapEntry) => (e.kind === "ad" ? e.ad.id : e.item.id);

export function ScrapClient({
  initialEntries,
  initialHasMore,
  isDemo,
}: {
  initialEntries: ScrapEntry[];
  initialHasMore: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 서버가 새 목록을 내려주면 반영한다 — useState 초기값은 첫 렌더에만 쓰인다.
     effect 로 하면 setState 캐스케이드가 되므로 렌더 시점에 비교한다(레포 관례).
     더 보기로 이어붙인 뒷장은 여기서 리셋된다 — router.refresh 는 첫 장만 다시
     내려주므로, 그게 서버와 화면을 일치시키는 유일하게 정직한 상태다. */
  const [prevInitial, setPrevInitial] = useState(initialEntries);
  if (initialEntries !== prevInitial) {
    setPrevInitial(initialEntries);
    setEntries(initialEntries);
    setHasMore(initialHasMore);
    setPage(0);
  }

  const [tab, setTab] = useState<TabKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: entries.length,
      post: entries.filter((e) => e.kind === "post").length,
      ad: entries.filter((e) => e.kind === "ad").length,
    }),
    [entries],
  );

  const shown = useMemo(
    () => (tab === "all" ? entries : entries.filter((e) => e.kind === tab)),
    [entries, tab],
  );

  const selected = useMemo(
    () => entries.find((e) => idOf(e) === selectedId) ?? null,
    [entries, selectedId],
  );

  /* 광고 상세의 "유사 광고" — 서버를 한 번 더 부르지 않고 **이미 받아둔 저장 목록에서**
     같은 광고주 → 나머지 순으로 채운다. 스크랩 화면의 유사도는 "내가 담아둔 것들 중"
     이라는 뜻이 자연스럽고, 여기서 풀 전체를 다시 뒤지면 저장 화면이 검색 화면이 된다. */
  const similarAds = useMemo(() => {
    if (!selected || selected.kind !== "ad") return [];
    const me = selected.ad;
    const others = entries.filter((e): e is { kind: "ad"; ad: ReferenceAd } => e.kind === "ad" && e.ad.id !== me.id);
    const sameBrand = others.filter((e) => e.ad.pageName === me.pageName);
    const rest = others.filter((e) => e.ad.pageName !== me.pageName);
    return [...sameBrand, ...rest].slice(0, 12).map((e) => e.ad);
  }, [entries, selected]);

  /* 저장 목록에 있는 건 정의상 전부 저장된 상태다 — 모달의 유사 카드도 채워진 북마크로 */
  const savedIds = useMemo(() => new Set(entries.map(idOf)), [entries]);

  function unsave(id: string) {
    if (isDemo) return;
    const snapshot = entries;
    setError(null);
    setEntries((prev) => prev.filter((e) => idOf(e) !== id));
    setSelectedId((cur) => (cur === id ? null : cur));

    startTransition(async () => {
      /* 서버가 거절하거나(로그인 만료·RLS) 던지면(네트워크) 원상 복구한다.
         refresh 만 믿으면 throw 경로에서 카드가 사라진 채로 남는다. */
      try {
        const result = await togglePoolSave(id, false);
        if (!result.ok) {
          setEntries(snapshot);
          setError(result.error ?? "스크랩 해제에 실패했어요.");
          return;
        }
        router.refresh();
      } catch {
        setEntries(snapshot);
        setError("스크랩 해제에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const next = page + 1;
      const res = await loadScrapPage(next);
      /* 그 사이 해제된 항목이 뒷장에 다시 들어올 수 있다 — id 로 거른다 */
      const seen = new Set(entries.map(idOf));
      setEntries((prev) => [...prev, ...res.entries.filter((e) => !seen.has(idOf(e)))]);
      setHasMore(res.hasMore);
      setPage(next);
    } catch {
      setError("목록을 더 불러오지 못했어요.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="아직 스크랩한 레퍼런스가 없어요"
        description="탐색에서 카드 오른쪽 위 북마크를 누르면 여기에 쌓입니다."
        action={<ButtonLink href="/library">탐색으로 가기</ButtonLink>}
      />
    );
  }

  return (
    <div className="results-area">
      <div role="tablist" aria-label="스크랩 종류" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={cn(
                "trans-state rounded-chip px-3.5 py-1.5 text-[14px] font-medium",
                on
                  ? "bg-primary text-on-primary"
                  : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
              )}
            >
              {t.label}
              <span className="tnum ml-1.5 opacity-70">{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[14px] text-negative-strong">
          {error}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={tab === "ad" ? "스크랩한 광고가 없어요" : "스크랩한 게시물이 없어요"}
        />
      ) : (
        <div className="grid-refs mt-4">
          {shown.map((e) =>
            e.kind === "ad" ? (
              <AdCard
                key={e.ad.id}
                ad={e.ad}
                favorite
                onToggleFavorite={() => unsave(e.ad.id)}
                onOpen={() => setSelectedId(e.ad.id)}
              />
            ) : (
              <ReferenceCard
                key={e.item.id}
                item={e.item}
                favorite
                onToggleFavorite={() => unsave(e.item.id)}
                onOpen={() => setSelectedId(e.item.id)}
              />
            ),
          )}
        </div>
      )}

      {hasMore && tab === "all" ? (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "불러오는 중…" : "더 보기"}
          </Button>
        </div>
      ) : null}

      {selected?.kind === "post" ? (
        <ReferenceDetailModal
          item={selected.item}
          poolMode
          favorite
          isDemo={isDemo}
          onToggleFavorite={() => unsave(selected.item.id)}
          onClose={() => setSelectedId(null)}
          onDeleted={() => {
            setSelectedId(null);
            router.refresh();
          }}
        />
      ) : null}

      {selected?.kind === "ad" ? (
        <AdDetailModal
          ad={selected.ad}
          similar={similarAds}
          favorite
          savedIds={savedIds}
          onToggleFavorite={() => unsave(selected.ad.id)}
          onToggleSave={(id) => unsave(id)}
          onSelect={(ad) => setSelectedId(ad.id)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
