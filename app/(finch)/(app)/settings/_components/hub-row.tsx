import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/*
  허브 행 — 아이콘 타일 · 라벨 · 한 줄 상태 · 꺾쇠. 링크팜 계정 화면의 «항목 = 행 = 페이지» 문법.

  타일은 카드 **안**의 중첩 면이라 bg-plate 다(면 역할표 — 지면 위에 직접 쓰지 않는다).
  꺾쇠는 아이콘이라 fg-faint 가 허용되는 자리이고, 호버에서 fg-sub 로 올라와 «눌린다»를 말한다.
  행 높이는 두 줄(15+14)에 py-3.5 로 약 60px — 모바일 손가락 표적(36px+)을 넉넉히 넘긴다.
*/
export const hubRowClass =
  "group flex w-full items-center gap-3 px-4 py-3.5 text-left trans-state hover:bg-tint-hover focus-visible:bg-tint-hover focus-visible:outline-none";

export function HubRowBody({
  icon: Icon,
  label,
  hint,
  hintTone = "sub",
}: {
  icon: LucideIcon;
  label: string;
  hint?: string | null;
  /** warning = 사용자가 할 일이 있는 상태(만료 임박·미등록 등) */
  hintTone?: "sub" | "warning";
}) {
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg">{label}</span>
        {hint ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-[14px]",
              hintTone === "warning" ? "text-warning-strong" : "text-fg-sub",
            )}
          >
            {hint}
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-faint trans-state group-hover:text-fg-sub" aria-hidden />
    </>
  );
}

export function HubRow({
  href,
  icon,
  label,
  hint,
  hintTone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint?: string | null;
  hintTone?: "sub" | "warning";
}) {
  return (
    <li>
      <Link href={href} className={hubRowClass}>
        <HubRowBody icon={icon} label={label} hint={hint} hintTone={hintTone} />
      </Link>
    </li>
  );
}

/** 행 묶음 — 12px 그룹 이름 + 카드 한 장(행 사이 헤어라인). overflow-hidden 은 호버 틴트를 모서리에 맞춰 자르기 위함 */
export function HubGroup({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`hub-${id}`}>
      <h2 id={`hub-${id}`} className="mb-2 px-1 text-[12px] font-semibold text-fg-sub">
        {label}
      </h2>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">{children}</ul>
      </Card>
    </section>
  );
}
