import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/*
  요약 카드 — 설정 하위 페이지 맨 위, «첫눈에 상태»(2026-09-03 재설계, 링크팜 계정 화면의 맨 위 카드 문법).
  신원/제목 행(아바타·타일 · 제목 · 상태 한 줄 · 오른쪽 칩/배지 + 버튼 **하나**) + 선택적 숫자 스트립.
  «예시 화면» 배지와 데모 문장은 **여기서만** 말한다 — 카드 밖에 데모 문단·로그인 링크 카드를 두지 않는다.
  스트립 셀은 라벨 12 / 값 15(강조 숫자는 호출부가 20 으로) / 선택 게이지·각주. 링크 셀은 호버 틴트 + 꺾쇠.
*/

export interface SummaryStatProps {
  label: string;
  value: React.ReactNode;
  href?: string;
  tone?: "neutral" | "warn";
  tnum?: boolean;
  tip?: React.ReactNode;
  /** 0~100 — 남은 크레딧 비율 같은 게이지 */
  meter?: number;
  /** 12px 각주 */
  note?: React.ReactNode;
}

function SummaryStat({ label, value, href, tone = "neutral", tnum, tip, meter, note, className }: SummaryStatProps & { className?: string }) {
  const inner = (
    <>
      <span className="flex items-center gap-1 text-[12px] text-fg-sub">
        {label}
        {tip}
      </span>
      <span className={cn("mt-0.5 flex items-center gap-1 text-[15px] font-semibold leading-snug", tone === "warn" ? "text-warning-strong" : "text-fg")}>
        <span className={cn("min-w-0 truncate", tnum && "tnum")}>{value}</span>
        {href ? <ChevronRight className="hidden size-3.5 shrink-0 text-fg-faint trans-state group-hover:text-fg-sub sm:inline" aria-hidden /> : null}
      </span>
      {meter !== undefined ? (
        <span
          role="progressbar"
          aria-valuenow={Math.round(meter)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
          className="mt-2 block h-1.5 overflow-hidden rounded-chip bg-plate"
        >
          <span className="block h-full rounded-chip bg-primary" style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </span>
      ) : null}
      {note ? <span className="mt-1 block text-[12px] text-fg-sub">{note}</span> : null}
    </>
  );
  const base = cn("block min-w-0 px-3 py-3 sm:px-4", className);
  if (href) {
    return (
      <Link
        href={href}
        className={cn(base, "group trans-state hover:bg-tint-hover focus-visible:bg-tint-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2")}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

export function SummaryCard({
  leading,
  eyebrow,
  title,
  titleSize = 17,
  sub,
  subTone = "sub",
  chips,
  aside,
  stats,
  cols,
}: {
  /** AvatarImage · 아이콘 타일 · 글리프 스택 */
  leading: React.ReactNode;
  /** 제목 위 12px 한 줄(«현재 플랜») */
  eyebrow?: string;
  title: React.ReactNode;
  titleSize?: 17 | 20;
  /** 상태 한 줄(14px) */
  sub?: React.ReactNode;
  subTone?: "sub" | "warning" | "accent";
  /** 제목 옆 StateChip / Badge */
  chips?: React.ReactNode;
  /** 오른쪽 — «예시 화면» 배지 또는 상황별 버튼 하나 */
  aside?: React.ReactNode;
  stats?: SummaryStatProps[];
  cols?: 2 | 3 | 4;
}) {
  const n = cols ?? (stats?.length as 2 | 3 | 4 | undefined) ?? 3;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 p-4">
        {leading}
        <div className="min-w-0 flex-1 basis-56">
          {eyebrow ? <p className="text-[12px] font-medium text-fg-sub">{eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* h2 — 아래 그룹 라벨(12px h2)과 형제 위계. base 레이어의 제목 색·자간을 그대로 받는다 */}
            <h2 className={cn("break-keep", titleSize === 20 ? "text-[20px] font-bold leading-tight" : "text-[17px] font-semibold leading-snug")}>{title}</h2>
            {chips}
          </div>
          {sub ? (
            <p className={cn("mt-0.5 break-keep text-[14px] leading-snug", subTone === "warning" ? "text-warning-strong" : subTone === "accent" ? "text-primary-ink" : "text-fg-sub")}>
              {sub}
            </p>
          ) : null}
        </div>
        {aside ? <div className="w-full shrink-0 sm:w-auto">{aside}</div> : null}
      </div>
      {stats && stats.length > 0 ? (
        <div className={cn("grid border-t border-line", n === 4 ? "grid-cols-2 sm:grid-cols-4" : n === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {stats.map((s, i) => (
            <SummaryStat
              key={s.label}
              {...s}
              className={cn(
                "border-line",
                /* 4칸은 모바일에서 2×2 — 둘째 줄에 윗선, 짝수 칸에 왼선. sm 부터는 한 줄이라 왼선만 */
                n === 4
                  ? cn(i % 2 === 1 && "border-l", i >= 2 && "border-t sm:border-t-0", i > 0 && "sm:border-l")
                  : i > 0 && "border-l",
              )}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
