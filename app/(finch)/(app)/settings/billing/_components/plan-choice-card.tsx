import { Check, Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { PlanCardData } from "@/components/pricing/plan-cards";

/*
  플랜 비교 카드(관리 화면용) — 2026-09-03 «링크팜처럼 카드 그리드로» 지시.
  마케팅 카드(components/pricing/plan-cards)와 **데이터(PLAN_CARDS)는 같고 렌더링만 다르다**: 설득 문구·프로모 배지를 걷고
  이름·가격·크레딧·차이점 4개·CTA 한 개만 남긴다. 현재 플랜도 그리드에 넣는다(«지금 이용 중» 슬랩) —
  2026-08-15 «현재 플랜은 목록에서 뺀다» 결정을 이 지시가 뒤집었다. 강조는 border 를 덮어쓰지 않고 outline 으로 —
  card-face 의 border 와 border-primary 유틸의 우선순위가 보장되지 않는다(소넷 점검).
*/
const won = (n: number) => n.toLocaleString("ko-KR");

export function PlanChoiceCard({ plan, current, action }: { plan: PlanCardData; current: boolean; action: React.ReactNode }) {
  return (
    <Card className={cn("flex h-full flex-col p-4", current && "outline outline-2 -outline-offset-2 outline-primary")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="flex items-baseline gap-1.5 text-[17px] font-semibold">
          {plan.name}
          <span className="text-[14px] font-normal text-fg-sub">{plan.ko}</span>
        </h3>
        {current ? <Badge tone="neutral">이용 중</Badge> : null}
      </div>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="tnum text-[20px] font-bold leading-none">{plan.price === 0 ? "무료" : `${won(plan.price)}원`}</span>
        {plan.price > 0 ? <span className="text-[14px] text-fg-sub">/ 월</span> : null}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[14px] text-fg">
        <Coins className="size-4 shrink-0 text-primary-ink" aria-hidden />
        {plan.credits !== null ? `월 ${won(plan.credits)} 크레딧` : "크레딧 대신 월 횟수"}
      </p>
      <ul className="mt-3 space-y-1.5">
        {plan.perks.slice(0, 4).map((t) => (
          <li key={t} className="flex items-start gap-2 text-[14px] leading-snug text-fg">
            <Check className="mt-0.5 size-3.5 shrink-0 text-fg-sub" strokeWidth={2.5} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">{action}</div>
    </Card>
  );
}
