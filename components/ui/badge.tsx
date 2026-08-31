import { cn } from "@/lib/cn";
import type { Channel } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/channels";
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

/*
  ── 삭제됨: SupportBadge · DataSourceBadge (2026-08-31) ──────────────
  데이터 출처·지원수준 배지는 **고객 화면에 노출하지 않는다**(2026-07 결정, CLAUDE.md).
  두 컴포넌트는 사용처가 0곳인 죽은 코드였는데 «공식 API»·«제휴 데이터» 리터럴을 품고
  남아 있었다 — 자동완성으로 되살아나는 순간 규칙 위반이 조용히 화면에 뜬다.
  지우는 것이 규칙을 지키는 방법이다. components/ui/data-source-note.tsx 도 같은 이유로 삭제.
  법적으로 필요한 고지는 약관·개인정보처리방침에서 다룬다.
*/
