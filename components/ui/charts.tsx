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
  /* width·height 는 이제 **좌표계**일 뿐이고 실제 크기는 CSS 가 정한다.
     앞서는 style={{ width }} 로 96px 에 못박혀 있어서, 폭 캡을 걷어낸 뒤
     560px 짜리 카드 안에서도 차트가 96px(카드의 17%)에 머물렀다 —
     넓힌 폭이 정보로 전환되지 않는 전형적인 자리였다.
     preserveAspectRatio="none" 이라 세로 비율은 height 가 지킨다. */
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ height }}
      preserveAspectRatio="none"
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

/*
  2계열 라인 차트.
  scale="each"(기본) — 계열마다 자체 min~max 정규화. 단위가 다른 두 지표(ROAS·CPA 등)의
  "추세 비교"용이라 절대값 비교는 못 한다. 이 경우에만 호출부가 캡션으로 고지한다.
  scale="shared0" — 같은 단위 두 계열을 **공통 0~최댓값** 축에 올린다. 높이를 그대로 비교해도 된다.
  세로 여백은 위아래 padY(14px) — 호출부가 눈금 라벨을 얹을 때 이 값에 맞춘다.
*/
export function DualLineChart({
  series,
  className,
  height = 180,
  scale = "each",
}: {
  series: { data: number[]; stroke: string }[];
  className?: string;
  height?: number;
  scale?: "each" | "shared0";
}) {
  const drawable = series.filter((s) => s.data.length >= 2);
  if (drawable.length === 0) return null;
  /* 공통 축 — 계열을 통틀어 최댓값. 1 하한은 전부 0일 때의 0 나눗셈 가드 */
  const gMax = scale === "shared0" ? Math.max(1, ...drawable.flatMap((s) => s.data)) : 0;
  const W = 600;
  const H = height;
  const padX = 6;
  const padY = 14;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("w-full", className)} style={{ height }} preserveAspectRatio="none" aria-hidden>
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
      {drawable.map((s, si) => {
        const max = scale === "shared0" ? gMax : Math.max(...s.data);
        const min = scale === "shared0" ? 0 : Math.min(...s.data);
        /* 값이 전부 같으면(신규 페이지의 0 행렬 등) range 가 0 이다. 1 로 대체하면
           (v-min)/1 = 0 이라 선이 **맨 위**에 붙어 "최고치가 계속 유지 중"처럼 보인다.
           변화가 없다는 뜻이므로 세로 가운데에 그린다. */
        const flat = max === min;
        const range = flat ? 1 : max - min;
        const x = (i: number) => padX + (i / (s.data.length - 1)) * (W - padX * 2);
        const y = (v: number) =>
          flat ? padY + (H - padY * 2) / 2 : padY + (1 - (v - min) / range) * (H - padY * 2);
        const line = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        return (
          <g key={si}>
            <polyline
              points={line}
              fill="none"
              stroke={s.stroke}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(s.data.length - 1)}
              cy={y(s.data[s.data.length - 1])}
              r={3.5}
              fill={s.stroke}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
}

/* 도넛 차트 — 게재위치·비중 분포. 중앙 라벨은 감싼 쪽에서 absolute로 올린다 */
export function DonutChart({
  segments,
  className,
  size = 148,
  thickness = 20,
}: {
  segments: { label: string; pct: number; color: string }[];
  className?: string;
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((s, i) => {
          const offset = segments.slice(0, i).reduce((sum, seg) => sum + seg.pct, 0);
          return (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${(s.pct / 100) * circ} ${circ}`}
              strokeDashoffset={-(offset / 100) * circ}
            />
          );
        })}
      </g>
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
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[14px] text-fg-sub">
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
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const nearLimit = pct >= 80;
  return (
    <div>
      <div className={cn("flex items-baseline justify-between", compact ? "text-xs" : "text-[14px]")}>
        <span className="text-fg-sub">{label}</span>
        <span className="tnum text-fg-faint">
          <span className={nearLimit ? "text-warning" : "text-fg-sub"}>{used}</span>/{limit}
          {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${label} 사용량 ${used}/${limit}${unit}${nearLimit ? " — 한도 임박" : ""}`}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-chip bg-overlay"
      >
        <div
          className={cn("h-full rounded-chip", nearLimit ? "bg-warning" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
