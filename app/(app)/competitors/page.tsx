"use client";

import { useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge, DataSourceBadge, SupportBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { cn } from "@/lib/cn";
import { formatCompact, formatPercent } from "@/lib/format";
import { competitors, usageStats } from "@/lib/mock/data";
import type { Channel, Competitor, SupportLevel } from "@/lib/types";
import { CompetitorTabs } from "./tabs";

/* 자체 산출 지표 고지 문구 (PRD 4.4) */
const ENGAGEMENT_TIP =
  "공개된 좋아요·댓글·공유 수를 게시물 조회수로 나눠 핀치가 계산한 값입니다. 플랫폼 공식 데이터가 아닌 핀치 자체 추정치입니다.";

/* 채널별 타 계정 분석 가능 범위 (PART 3 매트릭스의 '타 계정 분석' 행 기준) */
const ANALYSIS_SCOPE: { channel: Channel; level: SupportLevel; desc: string }[] = [
  {
    channel: "instagram",
    level: "partial",
    desc: "Meta 공식 Business Discovery API로 공개 비즈니스·크리에이터 계정의 기초 지표(팔로워·게시물 수, 게시물별 좋아요·댓글)를 제공합니다.",
  },
  {
    channel: "tiktok",
    level: "thirdparty",
    desc: "제휴 데이터 공급사가 수집한 공개 프로필·게시물 데이터 기반이며, 갱신 주기에 따라 실제 값과 차이가 있을 수 있습니다.",
  },
  {
    channel: "threads",
    level: "thirdparty",
    desc: "제휴 데이터 공급사 데이터로 제공되며, 공개 게시물 기준 지표만 확인할 수 있습니다.",
  },
];

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(competitors.map((c) => c.id));

  const compared = competitors.filter((c) => selected.includes(c.id));
  const usage = usageStats.find((u) => u.label === "경쟁사 등록");

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
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="경쟁사"
        description="경쟁 계정의 성장 흐름과 콘텐츠 성과를 내 계정과 나란히 확인하세요."
        action={
          <Button size="sm" onClick={() => inputRef.current?.focus()}>
            <Plus className="size-4" aria-hidden />
            계정 등록
          </Button>
        }
      />

      <CompetitorTabs current="accounts" />

      {/* 계정 검색·등록 (PART 4.5) */}
      <Card className="p-5">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery("");
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="정확한 사용자명(@handle)을 입력하세요"
              aria-label="경쟁사 계정 사용자명"
              className="h-10 w-full rounded-card border border-line bg-overlay pl-9 pr-3 text-[14px] text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>
          <Button type="submit">
            <Plus className="size-4" aria-hidden />
            등록
          </Button>
        </form>
        <p className="mt-2 text-xs text-fg-faint">
          유사 검색은 지원되지 않아 정확한 사용자명(핸들)이 필요합니다. Instagram은 공개 비즈니스·크리에이터
          계정만 분석할 수 있습니다.
        </p>
      </Card>

      {/* 등록된 경쟁사 목록 */}
      <section aria-label="등록된 경쟁사" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-[19px] font-bold leading-snug">등록된 경쟁사</h3>
            {usage ? (
              <p className="tnum mt-0.5 text-[13px] text-fg-sub">
                {usage.used}/{usage.limit}
                {usage.unit} 사용 중
              </p>
            ) : null}
          </div>
          <DataSourceNote source="Instagram 공식 API · TikTok 제휴 데이터 공급사" />
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c) => (
            <Card key={c.id} hover className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold">{c.displayName}</p>
                  <p className="mt-0.5 truncate text-[13px] text-fg-sub">{c.handle}</p>
                </div>
                <DataSourceBadge source={c.dataSource} />
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
                    "rounded-chip px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                    active
                      ? "bg-primary text-on-primary"
                      : "border border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg",
                  )}
                >
                  {c.displayName}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-faint">
                  <th className="w-32 pb-2 font-medium">지표</th>
                  {compared.map((c) => (
                    <th key={c.id} className="pb-2 pr-3 font-medium">
                      <span className="block text-[14px] font-semibold text-fg">{c.displayName}</span>
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
                      <th scope="row" className="py-3 pr-3 text-left text-[13px] font-medium text-fg-sub">
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

      {/* 채널별 분석 가능 범위 안내 (PART 3) */}
      <Card>
        <CardHeader
          title="채널별 분석 가능 범위"
          description="타 계정 분석은 채널마다 사용할 수 있는 데이터 소스가 다릅니다."
        />
        <CardBody className="space-y-3">
          {ANALYSIS_SCOPE.map((s) => (
            <div key={s.channel} className="rounded-card border border-line p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <ChannelBadge channel={s.channel} />
                <SupportBadge level={s.level} />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-sub">{s.desc}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
