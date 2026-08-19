"use client";

import { useState, useTransition } from "react";
import { FileSearch, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { InsightsTabs } from "../tabs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { MiniBars, RatioBar } from "@/components/ui/charts";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAgo, formatCompact } from "@/lib/format";
import { analyzeHistory } from "@/lib/data";
import type { AnalyzeResult } from "@/lib/types";
import { analyzeUrl } from "./actions";

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await analyzeUrl(url.trim());
      if (res.ok) {
        setResult(res.result);
      } else {
        setResult(null);
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <InsightsTabs current="link" />
      <PageHeader
        title="링크 분석"
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
            className="h-10 flex-1 rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint trans-state hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          />
          <Button type="submit" disabled={!url.trim() || pending}>
            <Search className="size-4" aria-hidden />
            {pending ? "분석 중…" : "분석하기"}
          </Button>
        </form>
      </Card>

      {error ? (
        <div className="rounded-card border border-warning/40 bg-warning-weak p-4 text-[15px] text-fg-sub" role="alert">
          {error}
        </div>
      ) : null}

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
              </div>
              <div className="min-w-0">
                <p className="text-[17px] font-bold leading-snug">{result.caption}</p>
                <p className="mt-1 text-[14px] text-fg-sub">
                  {formatAgo(result.publishedAt)} 게시 ·{" "}
                  <span className="break-all text-fg-faint">{result.url}</span>
                </p>
              </div>
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
                {result.hourlyGrowth.length > 0 ? (
                  <>
                    <MiniBars data={result.hourlyGrowth} height={140} />
                    <div className="mt-2 flex items-baseline justify-between text-xs text-fg-faint">
                      <span>업로드 직후</span>
                      <span className="tnum">
                        +{result.hourlyGrowth.length}시간 · 누적{" "}
                        {formatCompact(result.hourlyGrowth[result.hourlyGrowth.length - 1])}회
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-[14px] leading-relaxed text-fg-sub">
                    시간대별 누적 조회는 인스타그램 공식 API가 제공하지 않는 데이터예요.
                    <br />
                    현재 누적 지표(조회·좋아요·댓글·공유)는 위 카드에서 확인할 수 있습니다.
                  </p>
                )}
              </CardBody>
            </Card>

            <div className="space-y-6">
              {/* 해시태그 */}
              <Card>
                <CardHeader title="해시태그" description="게시물에 사용된 태그" />
                <CardBody className="flex flex-wrap gap-1.5">
                  {result.hashtags.length > 0 ? (
                    result.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-chip border border-line bg-body px-2.5 py-0.5 text-xs font-semibold leading-5 text-fg-sub"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <p className="text-[14px] text-fg-sub">게시물에 해시태그가 없어요.</p>
                  )}
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
                    <p className="text-[14px] text-fg-sub">
                      분석할 댓글이 충분하지 않습니다.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

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
          <table className="w-full min-w-[520px] text-[15px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="pb-2 font-medium">URL</th>
                <th className="pb-2 font-medium">채널</th>
                <th className="pb-2 font-medium">분석 시각</th>
                <th className="pb-2 text-right font-medium">조회수</th>
              </tr>
            </thead>
            <tbody>
              {analyzeHistory.length > 0 ? (
                analyzeHistory.map((h) => (
                  <tr key={h.id} className="border-b border-line last:border-0">
                    <td className="max-w-[280px] py-3 pr-3">
                      <p className="truncate font-medium">{h.url}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <ChannelBadge channel={h.channel} />
                    </td>
                    <td className="py-3 pr-3 text-[14px] text-fg-sub">{formatAgo(h.analyzedAt)}</td>
                    <td className="tnum py-3 text-right">{formatCompact(h.views)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[14px] text-fg-sub">
                    아직 분석 기록이 없어요. 위에서 첫 게시물을 분석해 보세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
