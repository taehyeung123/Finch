import { Check, Minus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/*
  플랜 진열 — 1차 리뉴얼(가로 5행 스트라이프)이 "얇고 밍밍한 문서"로 반려된 뒤의 재설계.
  반려 사유가 정확히 세 가지였다: ① 색이 흰색과 구분이 안 감 ② 카드가 없어 물성이 없음
  ③ 배치가 바뀐 티가 안 남. 그래서 이번엔:

  - **Free는 진열대 밖으로.** 유료 4장과 같은 줄에 두면 5칸이 되어 카드가 좁아진다.
    Free는 위쪽 가로 바 한 장 — "체험은 다른 물건"이라는 위계도 같이 선다.
  - **유료 4장은 실제 카드 그리드.** 1152 ÷ 4 = 264px면 48px 가격이 들어간다(5칸이면 불가).
  - **색면은 실제로 색으로 읽히게.** 카드 상단 컬러 레일 + 색면 헤더 + 잉크 테두리 3단.
  - Pro는 코랄 헤더에 on-primary 잉크로 반전 — 진열대에서 혼자 색이 꽉 찬 물건이 된다.
*/

export interface PlanCard {
  key: string;
  name: string;
  target: string;
  price: number;
  credits: number;
  /** 이 크레딧으로 살 수 있는 최대치 — 상수에서 파생한 값이 들어온다 */
  buys: { label: string; n: number; unit: string }[];
  perks: string[];
  featured?: boolean;
  /** 색 토큰 클래스 */
  field: string;
  edge: string;
  ink: string;
  rail: string;
}

const won = (n: number) => n.toLocaleString("ko-KR");

export function FreeBar({
  price,
  counts,
  locked,
}: {
  price: number;
  counts: string[];
  locked: string[];
}) {
  return (
    <div className="overflow-hidden rounded-card border border-plan-free-edge bg-plan-free-field">
      <div className="grid gap-6 p-6 md:grid-cols-12 md:items-center md:p-7">
        <div className="md:col-span-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-plan-free-ink">체험</p>
          <h3 className="mt-1.5 text-[26px] font-bold tracking-[-0.01em]">Free</h3>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.02em]">
            {price === 0 ? "0원" : `${won(price)}원`}
          </p>
        </div>

        <div className="md:col-span-6">
          <p className="text-[12.5px] font-semibold text-fg-sub">
            크레딧 없이 <span className="text-fg">월 횟수</span>로 제공
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
            {counts.map((c) => (
              <li key={c} className="flex items-center gap-1.5 text-[13.5px] font-medium text-fg">
                <Check className="size-4 shrink-0 text-plan-free-ink" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
            {locked.map((c) => (
              <li key={c} className="flex items-center gap-1.5 text-[13px] text-fg-faint">
                <Minus className="size-3.5 shrink-0" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-3 md:text-right">
          <ButtonLink href="/signup" variant="secondary" className="w-full md:w-auto">
            무료로 시작하기
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

export function PaidCard({ plan }: { plan: PlanCard }) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-card border bg-body ${plan.edge} ${
        plan.featured ? "shadow-panel lg:-mt-4 lg:mb-0" : ""
      }`}
    >
      {/* 상단 컬러 레일 — 카드가 색을 "쓴" 게 아니라 "가진" 것처럼 보이게 하는 층 */}
      <span aria-hidden className={`h-1.5 w-full shrink-0 ${plan.rail}`} />

      {/* 색면 헤더 — Pro만 코랄로 꽉 채워 잉크를 반전한다 */}
      <div className={`px-6 pb-6 pt-5 ${plan.featured ? "bg-primary" : plan.field}`}>
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.16em] ${
              plan.featured ? "text-on-primary/70" : plan.ink
            }`}
          >
            {plan.target}
          </p>
          {plan.featured ? (
            <span className="rounded-chip bg-on-primary px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-primary">
              가장 인기
            </span>
          ) : null}
        </div>

        <h3
          className={`mt-2 text-[27px] font-bold tracking-[-0.01em] ${
            plan.featured ? "text-on-primary" : "text-fg"
          }`}
        >
          {plan.name}
        </h3>

        <p className="mt-3 flex items-baseline gap-1">
          <span
            className={`tnum text-[42px] font-bold leading-none tracking-[-0.03em] ${
              plan.featured ? "text-on-primary" : "text-fg"
            }`}
          >
            {won(plan.price)}
          </span>
          <span className={`text-[16px] font-bold ${plan.featured ? "text-on-primary" : "text-fg"}`}>원</span>
          <span className={`text-[12.5px] ${plan.featured ? "text-on-primary/60" : "text-fg-faint"}`}>/월</span>
        </p>
      </div>

      {/* 크레딧 — 이 제품 요금제의 유일한 차별점이라 카드에서 가장 큰 숫자 다음 자리 */}
      <div className="border-b border-line px-6 py-5">
        <p className="flex items-baseline gap-1.5">
          <span className="tnum text-[30px] font-bold leading-none tracking-[-0.02em]">
            {won(plan.credits)}
          </span>
          <span className="text-[13px] font-bold text-fg-sub">크레딧 / 월</span>
        </p>
        <ul className="mt-3 space-y-1.5">
          {plan.buys.map((b) => (
            <li key={b.label} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-fg-sub">{b.label}</span>
              <span className="tnum font-bold text-fg">
                {won(b.n)}
                <span className="ml-0.5 text-[11.5px] font-medium text-fg-faint">{b.unit}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[11.5px] text-fg-faint">한 기능에 몰아 썼을 때 · 중 택 1</p>
      </div>

      {/* 운영 한도 */}
      <ul className="flex-1 space-y-2.5 px-6 py-5">
        {plan.perks.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[13.5px] leading-[1.5] text-fg-sub">
            <Check className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-primary" : plan.ink}`} aria-hidden />
            {p}
          </li>
        ))}
      </ul>

      <div className="px-6 pb-6">
        <ButtonLink
          href="/signup"
          variant={plan.featured ? "primary" : "secondary"}
          className="w-full"
        >
          {plan.name} 시작하기
        </ButtonLink>
      </div>
    </div>
  );
}
