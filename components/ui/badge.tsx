import { cn } from "@/lib/cn";
import type { Channel, DataSource, SupportLevel } from "@/lib/types";
import { CHANNEL_LABEL, SUPPORT_LEVEL_LABEL } from "@/lib/channels";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";

/* 칩/뱃지 라운드 32px, 12px/600 (PART 7.6) */
const badgeBase =
  "inline-flex items-center gap-1.5 rounded-chip px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap";

type Tone = "neutral" | "primary" | "positive" | "negative" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-overlay text-fg-sub border border-line",
  primary: "bg-primary-weak text-primary",
  positive: "bg-positive-weak text-positive",
  negative: "bg-negative-weak text-negative",
  warning: "bg-warning-weak text-warning",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn(badgeBase, tones[tone], className)} {...props} />;
}

/* 채널 배지 (PART 7.5) — 실제 브랜드 글리프 + 레이블 */
const CHANNEL_GLYPH: Record<Channel, React.ReactNode> = {
  instagram: <InstagramGlyph className="size-3 text-ig" />,
  tiktok: <TiktokGlyph className="size-3 text-fg" />,
  threads: <ThreadsGlyph className="size-3 text-fg" />,
};

export function ChannelBadge({ channel, className }: { channel: Channel; className?: string }) {
  return (
    <span className={cn(badgeBase, "bg-overlay text-fg-sub border border-line", className)}>
      <span aria-hidden>{CHANNEL_GLYPH[channel]}</span>
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

/* 채널별 기능 지원 수준 배지 (PART 3 매트릭스) */
const supportTone: Record<SupportLevel, Tone> = {
  full: "positive",
  partial: "warning",
  thirdparty: "primary",
  none: "neutral",
};

export function SupportBadge({ level, className }: { level: SupportLevel; className?: string }) {
  return (
    <Badge tone={supportTone[level]} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {SUPPORT_LEVEL_LABEL[level]}
    </Badge>
  );
}

/* 데이터 출처 배지 — 공식 API vs 제휴 데이터 공급사 (PART 3, 4.4) */
export function DataSourceBadge({ source, className }: { source: DataSource; className?: string }) {
  if (source === "official") {
    return (
      <Badge tone="positive" className={className}>
        공식 API
      </Badge>
    );
  }
  if (source === "thirdparty") {
    return (
      <Badge tone="primary" className={className}>
        제휴 데이터
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" className={className}>
      자체 분석
    </Badge>
  );
}
