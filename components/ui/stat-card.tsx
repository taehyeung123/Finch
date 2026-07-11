import { cn } from "@/lib/cn";
import { formatDelta } from "@/lib/format";
import { Card } from "./card";
import { Sparkline } from "./charts";

/** 증감 텍스트 — 상승=초록/하락=빨강 (PART 7.4) */
export function DeltaText({ value, unit = "%", className }: { value: number; unit?: string; className?: string }) {
  const tone = value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-fg-faint";
  return <span className={cn("tnum font-semibold", tone, className)}>{formatDelta(value, unit)}</span>;
}

/** 대시보드 요약 지표 카드 (PART 4.1) */
export function StatCard({
  label,
  value,
  delta,
  deltaUnit = "%",
  trend,
  hint,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: number;
  deltaUnit?: string;
  trend?: number[];
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center gap-1.5 text-[13px] text-fg-sub">
        {label}
        {hint}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div>
          <div className="tnum text-2xl font-bold leading-none">{value}</div>
          {delta !== undefined ? (
            <div className="mt-1.5 text-[13px]">
              <DeltaText value={delta} unit={deltaUnit} />
              <span className="ml-1 text-fg-faint">지난주 대비</span>
            </div>
          ) : null}
        </div>
        {trend ? <Sparkline data={trend} stroke="var(--color-primary)" /> : null}
      </div>
    </Card>
  );
}
