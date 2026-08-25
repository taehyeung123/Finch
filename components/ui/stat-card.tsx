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
  deltaLabel = "지난주 대비",
  trend,
  hint,
  hero = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: number;
  deltaUnit?: string;
  /**
   * 증감의 **비교 구간** 라벨. 예전엔 "지난주 대비"가 박혀 있어서, 14일 탭에서도
   * 「지난주 대비」라고 말했다(실측). 무엇과 비교한 값인지 틀리면 숫자도 못 믿는다.
   */
  deltaLabel?: string;
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
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="min-w-0 shrink-0">
          {/* 타입 7단계 준수 — text-3xl(30px)·text-2xl(24px)은 스케일 밖이었다 */}
          <div className={cn("tnum font-bold leading-none", hero ? "text-[28px]" : "text-[20px]")}>{value}</div>
          {delta !== undefined ? (
            <div className="mt-1.5 text-[14px]">
              <DeltaText value={delta} unit={deltaUnit} />
              <span className="ml-1 text-fg-sub">{deltaLabel}</span>
            </div>
          ) : null}
        </div>
        {/* 남은 폭**만** 차지한다. 예전엔 min-w-[96px] 로 최소 폭을 보장했는데, 값(shrink-0) + gap 12
            + 96 이 좁은 카드의 내부 폭(390px 화면에서 133px)을 넘어서 SVG 가 카드 밖으로 77px 삐져나갔다 —
            gutter 를 건너 **옆 카드 위에** 코랄 대각선을 그었다(카드는 overflow:visible 이라 잘리지도 않는다).
            1024~1279px 데스크톱에서도 재현됐다. 이제 남는 폭이 없으면 스스로 0 이 된다.
            카드 쪽 overflow-hidden 은 안 건다 — 이웃 침범만 가리고 그림은 여전히 잘리는 상태가 되기 때문이다. */}
        {trend && trend.length >= 2 ? (
          <Sparkline data={trend} stroke="var(--color-primary)" className="min-w-0 flex-1" />
        ) : null}
      </div>
    </Card>
  );
}
