"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { formatCompact, formatPercent } from "@/lib/format";
import { competitors } from "@/lib/data";
import type { Competitor } from "@/lib/types";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CompetitorTabs } from "./tabs";

/* 자체 산출 지표 고지 문구 (PRD 4.4) */
const ENGAGEMENT_TIP =
  "공개된 좋아요·댓글·공유 수를 게시물 조회수로 나눠 핀치가 계산한 값입니다. 플랫폼 공식 데이터가 아닌 핀치 자체 추정치입니다.";

/* 비교 테이블 행 정의 — 각 행의 최고값을 강조 표시 */
const COMPARE_ROWS: {
  label: string;
  get: (c: Competitor) => number;
  fmt: (n: number) => string;
  tip?: string;
}[] = [
  { label: "팔로워", get: (c) => c.followers, fmt: formatCompact },
  { label: "평균 조회수", get: (c) => c.avgViews, fmt: formatCompact },
  { label: "주간 업로드", get: (c) => c.uploadPerWeek, fmt: (n) => `주 ${n}회` },
  { label: "평균 참여율", get: (c) => c.avgEngagementRate, fmt: formatPercent, tip: ENGAGEMENT_TIP },
];

export default function CompetitorsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(competitors.map((c) => c.id));

  const compared = competitors.filter((c) => selected.includes(c.id));

  function toggleCompare(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // 최소 2개 유지
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return prev; // 최대 3개
      return [...prev, id];
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="경쟁사 비교"
        description="경쟁 계정의 성장 흐름과 콘텐츠 성과를 내 계정과 나란히 확인하세요."
        /* 헤더의 "계정 등록" 버튼을 걷었다 — disabled 입력창에 포커스를 주려 했는데
           disabled 요소는 포커스를 못 받아 아무 반응도 없는 죽은 버튼이었다.
           등록 경로가 아직 없다는 건 아래 폼의 안내가 이미 설명한다. */
      />

      <CompetitorTabs current="accounts" />

      {/* 계정 검색·등록 (PART 4.5) */}
      <Card className="p-5">
        {/* 2026-08-15: 이 폼은 **저장 경로가 없다.**
            supabase/migrations 에 competitors 테이블이 없고 insert 코드도 0건이라,
            앞서는 제출하면 입력창만 비우고 끝났다 — 사용자는 등록됐다고 믿는다.
            연동 전까지 입력을 막고 이유를 밝힌다(개편 계획: 경쟁사는 C 패턴으로 재구성). */}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          aria-describedby="competitor-add-notice"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled
              placeholder="정확한 사용자명(@handle)을 입력하세요"
              aria-label="경쟁사 계정 사용자명"
              className="h-10 w-full rounded-card border border-line bg-body pl-9 pr-3 text-[15px] text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>
          <Button type="submit" disabled>
            <Plus className="size-4" aria-hidden />
            등록
          </Button>
        </form>
        <p id="competitor-add-notice" className="mt-2 text-[14px] text-fg-sub">
          경쟁사 직접 등록은 채널 연동 이후 제공됩니다. 지금은{" "}
          <Link href="/competitors/ads" className="font-semibold text-primary-ink hover:underline">
            경쟁사 광고 모니터링
          </Link>
          에서 실제 집행 중인 광고를 확인할 수 있어요.
        </p>
        <p className="mt-2 text-xs text-fg-faint">
          유사 검색은 지원되지 않아 정확한 사용자명(핸들)이 필요합니다. Instagram은 공개 비즈니스·크리에이터
          계정만 분석할 수 있습니다.
        </p>
      </Card>

      {/* 빈 데이터(실 모드)에서 목록·비교표가 값 없는 뼈대로 무너지던 것을 막는다.
          경쟁사가 하나도 없으면 광고 모니터링으로 안내한다. */}
      {competitors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="아직 등록된 경쟁사가 없어요"
          description="경쟁사 직접 등록은 채널 연동 이후 제공됩니다. 지금은 실제 집행 중인 광고를 확인할 수 있어요."
          action={<ButtonLink href="/competitors/ads">경쟁사 광고 보기</ButtonLink>}
        />
      ) : (
        <>
      {/* 등록된 경쟁사 목록 */}
      <section aria-label="등록된 경쟁사" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-[17px] font-semibold leading-snug">등록된 경쟁사</h3>
            {/* 2026-08-15: 「0/10개 사용 중」 게이지를 걷어냈다.
                lib/data/empty.ts 하드코딩이었고 "경쟁사 등록 상한 10개"는
                credit-config.ts 어디에도 없는 숫자였다. 통합 크레딧 모델과 무관하다. */}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c) => (
            <Card key={c.id} hover className="p-5">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{c.displayName}</p>
                <p className="mt-0.5 truncate text-[14px] text-fg-sub">{c.handle}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <ChannelBadge channel={c.channel} />
                <Badge>{c.category}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                <div>
                  <dt className="text-xs text-fg-faint">팔로워</dt>
                  <dd className="tnum mt-0.5 text-[15px] font-bold">{formatCompact(c.followers)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-faint">게시물</dt>
                  <dd className="tnum mt-0.5 text-[15px] font-bold">
                    {c.posts.toLocaleString("ko-KR")}개
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-fg-faint">
                    평균 참여율
                    <InfoTip>{ENGAGEMENT_TIP}</InfoTip>
                  </dt>
                  <dd className="tnum mt-0.5 text-[15px] font-bold">{formatPercent(c.avgEngagementRate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-faint">주간 업로드</dt>
                  <dd className="tnum mt-0.5 text-[15px] font-bold">주 {c.uploadPerWeek}회</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      </section>

      {/* 비교 뷰 (PART 4.5) */}
      <Card>
        <CardHeader
          title="계정 비교"
          description="비교할 계정을 2~3개 선택하세요. 지표별 최고값을 초록색으로 표시합니다."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {competitors.map((c) => {
              const active = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleCompare(c.id)}
                  className={cn(
                    "rounded-chip px-3.5 py-1.5 text-[14px] font-semibold trans-state",
                    active
                      ? "bg-primary text-on-primary"
                      : "border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
                  )}
                >
                  {c.displayName}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[15px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-faint">
                  <th className="w-32 pb-2 font-medium">지표</th>
                  {compared.map((c) => (
                    <th key={c.id} className="pb-2 pr-3 font-medium">
                      <span className="block text-[15px] font-semibold text-fg">{c.displayName}</span>
                      <span className="mt-1 inline-block">
                        <ChannelBadge channel={c.channel} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => {
                  const best = Math.max(...compared.map(row.get));
                  return (
                    <tr key={row.label} className="border-b border-line last:border-0">
                      <th scope="row" className="py-3 pr-3 text-left text-[14px] font-medium text-fg-sub">
                        <span className="inline-flex items-center gap-1">
                          {row.label}
                          {row.tip ? <InfoTip>{row.tip}</InfoTip> : null}
                        </span>
                      </th>
                      {compared.map((c) => {
                        const value = row.get(c);
                        const isBest = value === best;
                        return (
                          <td
                            key={c.id}
                            className={cn("tnum py-3 pr-3", isBest ? "font-bold text-positive" : "text-fg")}
                          >
                            {row.fmt(value)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
        </>
      )}
    </div>
  );
}
