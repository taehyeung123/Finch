import { cn } from "@/lib/cn";
import { formatDelta } from "@/lib/format";
import { Card } from "./card";
import { Sparkline } from "./charts";

/** 증감 텍스트 — 상승=초록/하락=빨강 (PART 7.4) */
export function DeltaText({ value, unit = "%", className }: { value: number; unit?: string; className?: string }) {
  const tone = value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-fg-faint";
  return <span className={cn("tnum font-semibold", tone, className)}>{formatDelta(value, unit)}</span>;
}

/** 대시보드 요약 지표 카드 (PART 4.1) — hero면 대표 지표용으로 크게 그린다 */
export function StatCard({
  label,
  value,
  delta,
  deltaUnit = "%",
  trend,
  hint,
  hero = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: number;
  deltaUnit?: string;
  trend?: number[];
  hint?: React.ReactNode;
  /** 스탯 행의 대표 지표 — 값·여백을 키우고 추이를 강조 */
  hero?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn(hero ? "p-6" : "p-5", className)}>
      <div className="flex items-center gap-1.5 text-[14px] text-fg-sub">
        {label}
        {hint}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div>
          <div className={cn("tnum font-bold leading-none", hero ? "text-3xl" : "text-2xl")}>{value}</div>
          {delta !== undefined ? (
            <div className="mt-1.5 text-[14px]">
              <DeltaText value={delta} unit={deltaUnit} />
              <span className="ml-1 text-fg-faint">지난주 대비</span>
            </div>
          ) : null}
        </div>
        {trend && trend.length >= 2 ? <Sparkline data={trend} stroke="var(--color-primary)" /> : null}
      </div>
    </Card>
  );
}
