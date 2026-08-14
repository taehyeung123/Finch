import Link from "next/link";
import { ArrowRight, Flame, Layers, Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatCompact } from "@/lib/format";
import type { PoolHomeStats } from "@/lib/pool/home-stats";

/*
  오늘의 핀치 — 홈 상단 데일리 브리핑 (2026-08-14 홈 개편).
  스니핏 홈의 구조(오늘의 브리핑 → 아카이빙 현황 → 검색 유도 칩)를 우리 토큰으로
  재구성했다. 통계 나열이 아니라 "오늘 뭐가 새로 들어왔고, 지금 뭘 하면 되는지"를
  말해주는 블록 — CTA는 탐색 하나다.
*/

function formatToday(): string {
  const now = new Date();
  return `${now.getFullYear()}. ${String(now.getMonth() + 1).padStart(2, "0")}. ${String(now.getDate()).padStart(2, "0")}`;
}

export function DailyBrief({ stats }: { stats: PoolHomeStats }) {
  const hasNew = stats.newCreatives3d > 0;
  const top = stats.topBrands[0] ?? null;

  return (
    <section aria-label="오늘의 핀치">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-primary">
              오늘의 핀치
              <span className="tnum font-medium text-fg-faint">{formatToday()}</span>
            </p>
            <h2 className="mt-1.5 text-[22px] font-bold leading-snug">
              {hasNew ? (
                <>
                  새 레퍼런스 <span className="tnum text-primary">{formatCompact(stats.newCreatives3d)}건</span>이
                  들어왔어요
                </>
              ) : (
                "오늘의 레퍼런스를 탐색해 보세요"
              )}
            </h2>
            <p className="mt-1 text-[14px] text-fg-sub">
              {hasNew
                ? "최근 3일 동안 공용 풀에 새로 쌓인 소재예요. 우리 업종에서 뭐가 뜨는지 확인해 보세요."
                : "매일 자동 수집이 돌며 새 소재가 쌓입니다. 탐색에서 업종별 레퍼런스를 둘러보세요."}
            </p>
            <ButtonLink href="/library" size="sm" className="mt-4">
              레퍼런스 탐색하기 <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          </div>

          {/* 아카이빙 현황 3타일 */}
          <div className="grid shrink-0 grid-cols-3 gap-3">
            <div className="rounded-card border border-line bg-body px-4 py-3.5 text-center">
              <Layers className="mx-auto size-4 text-fg-sub" aria-hidden />
              <p className="tnum mt-1.5 text-lg font-bold leading-none">{formatCompact(stats.newCreatives3d)}</p>
              <p className="mt-1 text-[11px] text-fg-sub">신규 수집 · 3일</p>
            </div>
            <div className="rounded-card border border-line bg-body px-4 py-3.5 text-center">
              <Store className="mx-auto size-4 text-fg-sub" aria-hidden />
              <p className="tnum mt-1.5 text-lg font-bold leading-none">{formatCompact(stats.totalBrands)}</p>
              <p className="mt-1 text-[11px] text-fg-sub">수집 브랜드</p>
            </div>
            <div className="rounded-card border border-line bg-body px-4 py-3.5 text-center">
              <Flame className="mx-auto size-4 text-warning" aria-hidden />
              {top ? (
                <>
                  <p className="mt-1.5 max-w-[96px] truncate text-[13px] font-bold leading-tight">{top.name}</p>
                  <p className="tnum mt-1 text-[11px] text-fg-sub">이번 주 {top.count}건</p>
                </>
              ) : (
                <>
                  <p className="mt-1.5 text-[13px] font-bold leading-tight text-fg-faint">—</p>
                  <p className="mt-1 text-[11px] text-fg-sub">활발한 브랜드</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 검색 유도 칩 — 클릭하면 탐색에 검색어가 채워진 채 열린다 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-body px-6 py-4">
          <span className="text-[12px] font-medium text-fg-sub">추천 검색</span>
          {stats.searchChips.map((chip) => (
            <Link
              key={chip}
              href={`/library?q=${encodeURIComponent(chip)}`}
              className="rounded-chip border border-line bg-overlay px-3 py-1.5 text-[13px] font-medium text-fg-sub transition-colors hover:border-primary hover:text-primary"
            >
              {chip}
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}
