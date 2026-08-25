"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { Button, ButtonLink } from "@/components/ui/button";
import { togglePoolSave } from "@/app/(finch)/(app)/library/pool-actions";
import { ReferenceCard, AdCard } from "@/app/(finch)/(app)/library/_components/reference-card";
import { ReferenceDetailModal } from "@/app/(finch)/(app)/library/_components/reference-detail";
import { AdDetailModal } from "@/app/(finch)/(app)/library/_components/ad-detail";
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
  loadFailed = false,
}: {
  initialEntries: ScrapEntry[];
  initialHasMore: boolean;
  isDemo: boolean;
  /** 조회 자체가 실패했다 — «0건»과 다른 화면을 그린다(lib/data/internal.ts 규칙) */
  loadFailed?: boolean;
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
        /* 성공 경로에서 router.refresh() 를 부르지 않는다 — 서버는 언제나 **첫 60건**만 내려주고,
           위 동기화 블록이 그걸 보고 목록을 첫 장으로 되감는다. 즉 「더 보기」로 쌓아 둔 뒷장이
           해제 한 번에 통째로 날아갔다(실측). 화면은 이미 낙관적으로 그 카드를 지웠고 그게 서버 상태와
           같으므로, 다시 읽을 이유가 없다. */
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

  /* 실패 분기가 빈 상태보다 **앞**이다 — 순서가 바뀌면 조회 실패가 「아직 없어요」로 나가고,
     담아 둔 사람은 저장이 날아간 줄 안다. */
  if (loadFailed) {
    return (
      <LoadFailed
        title="스크랩을 불러오지 못했어요"
        description="저장한 게 없는 게 아니라 목록을 못 읽은 것이에요. 잠시 후 다시 시도해 주세요."
      />
    );
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
              {/* 총계가 아니라 "지금 불러온 수"다. hasMore 면 + 를 붙여 총계로 오독되지 않게 —
                  200건 저장한 사람에게 "전체 40"이라고 말하면 저장이 사라진 것처럼 보인다. */}
              {/* 0 인데 뒷장이 남았으면 «0+» 라는 이상한 글자가 됐다 — 그때는 세지 못한 것이므로 «—» 다 */}
              <span className="tnum ml-1.5 opacity-70">
                {counts[t.key] === 0 && hasMore ? "—" : `${counts[t.key]}${hasMore ? "+" : ""}`}
              </span>
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
        /* 필터는 **이미 받아온 60건**에만 걸린다(서버 필터가 아니다). 뒷장이 남아 있는데
           「없어요」라고 단정하면, 실제로는 61번째부터 잔뜩 있는 사람에게 거짓말이 된다. */
        <EmptyState
          icon={Bookmark}
          title={
            hasMore
              ? "지금까지 불러온 것 중에는 없어요"
              : tab === "ad"
                ? "스크랩한 광고가 없어요"
                : "스크랩한 게시물이 없어요"
          }
          description={hasMore ? "아래 「더 보기」로 이어서 확인해 주세요." : undefined}
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

      {/* 탭과 무관하게 노출한다. 앞서는 전체 탭에서만 떠서, 게시물·광고로 거르면
          뒷장 저장분에 도달할 방법이 사라졌다 — 필터를 걸수록 볼 수 있는 게 줄어드는
          막다른 화면이었다(더 받아온 뒤 현재 탭 필터가 다시 적용된다). */}
      {hasMore ? (
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
