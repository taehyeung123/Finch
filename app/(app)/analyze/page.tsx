"use client";

import { useState } from "react";
import { FileSearch, Info, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge, DataSourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { MiniBars, RatioBar } from "@/components/ui/charts";
import { InfoTip } from "@/components/ui/info-tip";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAgo, formatCompact } from "@/lib/format";
import { analyzeHistory, analyzeSample } from "@/lib/mock/data";
import type { AnalyzeResult } from "@/lib/types";

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    // Phase 1: 목 결과로 상태 전환 (실제 연동 시 API 호출로 교체)
    setResult(analyzeSample);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="콘텐츠 분석"
        description="게시물 URL을 입력하면 상세 지표를 분석해 드립니다."
      />

      {/* URL 입력 (PART 4.3) */}
      <Card className="p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/... 또는 TikTok·Threads 게시물 URL"
            aria-label="분석할 게시물 URL"
            className="h-10 flex-1 rounded-card border border-line bg-overlay px-3 text-[15px] text-fg placeholder:text-fg-faint transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          />
          <Button type="submit" disabled={!url.trim()}>
            <Search className="size-4" aria-hidden />
            분석하기
          </Button>
        </form>
      </Card>

      {result ? (
        <>
          {/* 게시물 개요 */}
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {result.isOwnPost ? (
                  <Badge tone="primary">내 계정 게시물</Badge>
                ) : (
                  <Badge tone="neutral">타 계정 게시물</Badge>
                )}
                <ChannelBadge channel={result.channel} />
                <DataSourceBadge source={result.isOwnPost ? "official" : "thirdparty"} />
              </div>
              <div className="min-w-0">
                <p className="text-[17px] font-bold leading-snug">{result.caption}</p>
                <p className="mt-1 text-[13px] text-fg-sub">
                  {formatAgo(result.publishedAt)} 게시 ·{" "}
                  <span className="break-all text-fg-faint">{result.url}</span>
                </p>
              </div>
              <DataSourceNote
                source={result.isOwnPost ? "플랫폼 공식 API" : "제휴 데이터 공급사"}
              />
            </CardBody>
          </Card>

          {/* 핵심 지표 4개 */}
          <section aria-label="게시물 핵심 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="조회수" value={formatCompact(result.views)} />
            <StatCard label="좋아요" value={formatCompact(result.likes)} />
            <StatCard label="댓글" value={formatCompact(result.comments)} />
            <StatCard label="공유" value={formatCompact(result.shares)} />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* 시간대별 누적 조회수 */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="업로드 후 시간대별 누적 조회수"
                description="게시 직후부터 시간 단위 누적 추이"
              />
              <CardBody>
                <MiniBars data={result.hourlyGrowth} height={140} />
                <div className="mt-2 flex items-baseline justify-between text-xs text-fg-faint">
                  <span>업로드 직후</span>
                  <span className="tnum">
                    +{result.hourlyGrowth.length}시간 · 누적{" "}
                    {formatCompact(result.hourlyGrowth[result.hourlyGrowth.length - 1])}회
                  </span>
                </div>
              </CardBody>
            </Card>

            <div className="space-y-6">
              {/* 해시태그 */}
              <Card>
                <CardHeader title="해시태그" description="게시물에 사용된 태그" />
                <CardBody className="flex flex-wrap gap-1.5">
                  {result.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-chip border border-line bg-overlay px-2.5 py-0.5 text-xs font-semibold leading-5 text-fg-sub"
                    >
                      {tag}
                    </span>
                  ))}
                </CardBody>
              </Card>

              {/* 댓글 감성 요약 */}
              <Card>
                <CardHeader
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      댓글 감성 요약
                      <InfoTip>
                        댓글 텍스트를 핀치 AI가 긍정·중립·부정으로 분류한 자체 추정치입니다.
                        플랫폼 공식 데이터가 아닌 핀치 자체 추정치예요.
                      </InfoTip>
                    </span>
                  }
                  description="최근 댓글 기준"
                />
                <CardBody>
                  {result.sentiment ? (
                    <RatioBar
                      segments={[
                        { label: "긍정", ratio: result.sentiment.positive, color: "var(--color-positive)" },
                        { label: "중립", ratio: result.sentiment.neutral, color: "var(--color-warning)" },
                        { label: "부정", ratio: result.sentiment.negative, color: "var(--color-negative)" },
                      ]}
                    />
                  ) : (
                    <p className="text-[13px] text-fg-faint">
                      분석할 댓글이 충분하지 않습니다.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          {/* 타 계정 게시물 지표 제한 안내 */}
          <Card className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
            <div className="text-[13px] leading-relaxed text-fg-sub">
              <p className="font-semibold text-fg">타 계정 게시물은 조회 가능한 지표가 제한됩니다.</p>
              <p className="mt-1">
                Instagram은 공식 Business Discovery API의 기초 지표만 제공되며, TikTok·Threads의 타
                계정 분석에는 제휴 데이터 공급사 연동이 필요합니다.
              </p>
            </div>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={FileSearch}
          title="URL을 입력해 첫 분석을 시작하세요"
          description="내 계정 게시물은 물론, 타 계정 게시물도 조회 가능한 범위 안에서 분석할 수 있습니다."
        />
      )}

      {/* 분석 히스토리 (PART 4.3) */}
      <Card>
        <CardHeader title="분석 히스토리" description="최근에 분석한 게시물" />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="pb-2 font-medium">URL</th>
                <th className="pb-2 font-medium">채널</th>
                <th className="pb-2 font-medium">분석 시각</th>
                <th className="pb-2 text-right font-medium">조회수</th>
              </tr>
            </thead>
            <tbody>
              {analyzeHistory.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-0">
                  <td className="max-w-[280px] py-3 pr-3">
                    <p className="truncate font-medium">{h.url}</p>
                  </td>
                  <td className="py-3 pr-3">
                    <ChannelBadge channel={h.channel} />
                  </td>
                  <td className="py-3 pr-3 text-[13px] text-fg-sub">{formatAgo(h.analyzedAt)}</td>
                  <td className="tnum py-3 text-right">{formatCompact(h.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
