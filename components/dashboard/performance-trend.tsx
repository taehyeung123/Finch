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
  팔로워·조회수·참여율을 탭으로 전환해 최근 14일 추이를 라인 차트로 보여준다.
*/

type Metric = "followers" | "views" | "engagement";

const METRICS: { key: Metric; label: string }[] = [
  { key: "followers", label: "팔로워" },
  { key: "views", label: "조회수" },
  { key: "engagement", label: "참여율" },
];

export function PerformanceTrend({ trend }: { trend: ChannelTrend }) {
  const [metric, setMetric] = useState<Metric>("followers");
  const series = trend[metric];

  if (!series || series.length < 2) {
    return (
      <Card>
        <CardHeader title="성과 추이" description="최근 14일" />
        <CardBody>
          <EmptyState
            icon={LineChartIcon}
            title="추이 데이터가 아직 없어요"
            description="채널을 연동하면 팔로워·조회수·참여율 변화를 그래프로 확인할 수 있어요."
          />
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
      <CardHeader
        title="성과 추이"
        description={`${trend.startLabel} ~ ${trend.endLabel}`}
        action={
          <div className="flex rounded-chip border border-line bg-overlay p-0.5">
            {METRICS.map((m) => (
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
              {deltaPct.toFixed(1)}% <span className="font-normal text-fg-faint">· 14일 전 대비</span>
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
