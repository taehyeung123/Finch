import { cn } from "@/lib/cn";

/* 경량 SVG 차트 — 외부 차트 라이브러리 없이 대시보드 지표 시각화 */

export function Sparkline({
  data,
  className,
  stroke = "var(--color-primary)",
  width = 96,
  height = 28,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = 2;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width, height }}
      aria-hidden
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/*
  라인 차트 — 성과 추이(팔로워·조회수·참여율)용. 영역 채우기 + 끝점 강조 + 가로 그리드.
  그라디언트 배경 대신 반투명 단색 fill로 깊이 표현 (PART 7.7).
*/
export function LineChart({
  data,
  className,
  stroke = "var(--color-primary)",
  height = 160,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  height?: number;
}) {
  if (data.length < 2) return null;
  const W = 600;
  const H = height;
  const padX = 6;
  const padY = 14;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const x = (i: number) => padX + (i / (data.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / range) * (H - padY * 2);

  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `M${x(0).toFixed(1)},${y(data[0]).toFixed(1)} ${data
    .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ")} L${x(data.length - 1).toFixed(1)},${(H - padY).toFixed(1)} L${x(0).toFixed(1)},${(H - padY).toFixed(1)} Z`;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full", className)} style={{ height }} preserveAspectRatio="none" aria-hidden>
      {/* 가로 그리드 3줄 */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={padX}
          x2={W - padX}
          y1={padY + t * (H - padY * 2)}
          y2={padY + t * (H - padY * 2)}
          stroke="var(--color-line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={area} fill={stroke} opacity={0.1} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={3.5} fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* 세로 막대 미니 차트 — 시간대별 증가 추이 등 */
export function MiniBars({
  data,
  className,
  fill = "var(--color-primary)",
  height = 96,
}: {
  data: number[];
  className?: string;
  fill?: string;
  height?: number;
}) {
  const max = Math.max(...data, 1);
  return (
    <div className={cn("flex items-end gap-1", className)} style={{ height }} aria-hidden>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[2px] min-w-[4px]"
          style={{ height: `${Math.max((v / max) * 100, 2)}%`, background: fill, opacity: 0.55 + 0.45 * (v / max) }}
        />
      ))}
    </div>
  );
}

/* 가로 비율 막대 — 콘텐츠 유형 비중, 감성 분석 등 */
export function RatioBar({
  segments,
  className,
}: {
  segments: { label: string; ratio: number; color: string }[];
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex h-2 w-full overflow-hidden rounded-chip bg-overlay">
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${s.ratio}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[13px] text-fg-sub">
            <span className="size-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
            <span className="tnum text-fg-faint">{s.ratio}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* 사용량 게이지 (PART 4.13) */
export function UsageGauge({
  label,
  used,
  limit,
  unit,
  compact = false,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
  compact?: boolean;
}) {
  const pct = Math.min((used / limit) * 100, 100);
  const nearLimit = pct >= 80;
  return (
    <div>
      <div className={cn("flex items-baseline justify-between", compact ? "text-xs" : "text-[13px]")}>
        <span className="text-fg-sub">{label}</span>
        <span className="tnum text-fg-faint">
          <span className={nearLimit ? "text-warning" : "text-fg-sub"}>{used}</span>/{limit}
          {unit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-chip bg-overlay">
        <div
          className={cn("h-full rounded-chip", nearLimit ? "bg-warning" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
