"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LineChart } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart as LineChartIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChannelTrend } from "@/lib/types";
import { formatCompact, formatPercent } from "@/lib/format";

/*
  성과 추이 카드 — 개별 채널 선택 시 프로필 패널 옆(왼쪽) 공백을 채운다.
  팔로워·조회(도달)·참여율을 탭으로 전환해 최근 14일 추이를 라인 차트로 보여준다.
  실데이터 모드에서는 조회 곡선이 일별 '도달'(공식 API가 시계열로 제공하는 지표)이라
  viewsLabel로 표기를 바꾼다. 일부 지표만 비어 있으면 탭은 유지하고 본문만 안내로 대체한다.
*/

type Metric = "followers" | "views" | "engagement";

export function PerformanceTrend({
  trend,
  viewsLabel = "조회수",
}: {
  trend: ChannelTrend;
  /** 조회 탭 라벨 — 실데이터(일별 도달)면 "도달"로 표기 */
  viewsLabel?: string;
}) {
  const [metric, setMetric] = useState<Metric>("followers");

  const metrics: { key: Metric; label: string }[] = [
    { key: "followers", label: "팔로워" },
    { key: "views", label: viewsLabel },
    { key: "engagement", label: "참여율" },
  ];

  const allEmpty = metrics.every((m) => (trend[m.key]?.length ?? 0) < 2);
  if (allEmpty) {
    return (
      <Card>
        <CardHeader title="성과 추이" description="최근 14일" />
        <CardBody>
          <EmptyState
            icon={LineChartIcon}
            title="추이 데이터가 아직 없어요"
            description="채널을 연동하면 팔로워·도달 변화를 그래프로 확인할 수 있어요. 연동 직후에는 데이터가 쌓일 때까지 하루 이틀 걸릴 수 있습니다."
          />
        </CardBody>
      </Card>
    );
  }

  const series = trend[metric];
  const hasSeries = (series?.length ?? 0) >= 2;

  const header = (
    <CardHeader
      title="성과 추이"
      description={trend.startLabel ? `${trend.startLabel} ~ ${trend.endLabel}` : "최근 14일"}
      action={
        <div className="flex rounded-chip border border-line bg-overlay p-0.5">
          {metrics.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "rounded-chip px-3 py-1 text-[13px] font-semibold transition-colors",
                metric === m.key ? "bg-primary text-on-primary" : "text-fg-sub hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    />
  );

  if (!hasSeries) {
    return (
      <Card>
        {header}
        <CardBody>
          <p className="py-10 text-center text-[13px] leading-relaxed text-fg-faint">
            {metric === "engagement"
              ? "일별 참여율은 공식 API가 제공하지 않아 추이를 그릴 수 없어요. 기간 합산 참여율은 위 요약 카드에서 확인하세요."
              : "이 지표의 추이 데이터가 아직 없어요. 데이터가 쌓이면 자동으로 표시됩니다."}
          </p>
        </CardBody>
      </Card>
    );
  }

  const first = series[0];
  const last = series[series.length - 1];
  const deltaPct = first !== 0 ? ((last - first) / first) * 100 : 0;
  const up = last >= first;

  const format = (v: number) =>
    metric === "engagement" ? formatPercent(v) : formatCompact(v);

  return (
    <Card>
      {header}
      <CardBody>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="tnum text-2xl font-bold leading-none">{format(last)}</p>
            <p
              className={cn(
                "tnum mt-1.5 text-[13px] font-semibold",
                up ? "text-positive" : "text-negative",
              )}
            >
              {up ? "+" : ""}
              {deltaPct.toFixed(1)}% <span className="font-normal text-fg-faint">· 기간 시작 대비</span>
            </p>
          </div>
        </div>
        <LineChart
          data={series}
          height={168}
          stroke={up ? "var(--color-positive)" : "var(--color-negative)"}
          className="mt-4"
        />
      </CardBody>
    </Card>
  );
}
