import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { CREDIT_COSTS, PLAN_CREDIT_ALLOWANCE, creditsBuy } from "@/lib/pricing/credit-config";
import { PLAN_PRICES } from "@/lib/toss/config";

/*
  요금제 카드 — 마케팅 /pricing 과 앱 /settings/billing 이 **같이 쓴다**.

  3차 재설계(2026-08-15). 앞선 두 번이 "AI티·밤티"로 반려됐고, 원인은 카드가
  **평평한 1px 테두리 상자**였다는 것 하나로 수렴한다. 그래서 이번엔 기법을 바꿨다:

  ① 더블베젤(Doppelrand) — 색면 트레이 위에 본문 카드가 앉는 2겹 구조.
     안쪽 반경 = 바깥 반경 − 트레이 패딩(동심원). 이게 "기계 가공품" 인상을 만든다.
  ② 매크로 여백 — 카드 안쪽 패딩을 넉넉히(28px). 빽빽하면 즉시 싸구려로 읽힌다.
  ③ 매그네틱 CTA — 화살표를 알약 버튼 안의 **자체 원형 캡슐**에 넣고, 호버 시
     원만 대각선으로 움직인다(버튼은 눌리듯 축소). 벌거벗은 화살표는 템플릿 냄새.
  ④ 진입 모션 — 카드가 정지 상태로 나타나지 않는다(.anim-fade-up 스태거).
  ⑤ 아이콘 stroke 를 1.5로 낮춘다 — 굵은 아이콘이 아마추어 인상의 큰 지분이다.

  프로젝트 규칙이 이기는 지점: 폰트는 Pretendard(한글), 아이콘은 lucide-react,
  라운드는 토큰 2단계 + 여기서 파생한 bezel-core. hex 하드코딩 없음.
*/

export interface PlanCardData {
  key: "free" | "creator" | "pro" | "agency" | "enterprise";
  name: string;
  target: string;
  price: number;
  credits: number | null;
  counts?: string[];
  perks: string[];
  field: string;
  edge: string;
  ink: string;
  rail: string;
}

const buysFor = (credits: number) => [
  { label: "AI 카드뉴스", n: creditsBuy(credits, CREDIT_COSTS.cardnews), unit: "장" },
  { label: "AI 챗", n: creditsBuy(credits, CREDIT_COSTS.agentChat), unit: "회" },
  { label: "영상 분석", n: creditsBuy(credits, CREDIT_COSTS.videoAnalysis), unit: "편" },
];

export const PLAN_CARDS: PlanCardData[] = [
  {
    key: "free",
    name: "Free",
    target: "체험",
    price: 0,
    credits: null,
    counts: ["AI 챗 3회", "영상 분석 1회", "레퍼런스 수집 1회", "대본 추출 1회"],
    perks: ["채널 1개 연동", "자동 DM 콘텐츠 1개", "레퍼런스 열람", "커뮤니티 지원"],
    field: "bg-plan-free-field",
    edge: "border-plan-free-edge",
    ink: "text-plan-free-ink",
    rail: "bg-plan-free-ink",
  },
  {
    key: "creator",
    name: "Creator",
    target: "개인 크리에이터",
    price: PLAN_PRICES.creator,
    credits: PLAN_CREDIT_ALLOWANCE.creator,
    perks: ["채널 3개 연동", "자동 DM 콘텐츠 5개", "레퍼런스 무제한 열람", "이메일 지원"],
    field: "bg-plan-creator-field",
    edge: "border-plan-creator-edge",
    ink: "text-plan-creator-ink",
    rail: "bg-plan-creator-ink",
  },
  {
    key: "pro",
    name: "Pro",
    target: "광고주·1인 마케터",
    price: PLAN_PRICES.pro,
    credits: PLAN_CREDIT_ALLOWANCE.pro,
    perks: ["메타광고 생성·관리", "자동 DM 콘텐츠 20개", "경쟁사 광고 모니터링", "팀 최대 3인"],
    field: "bg-plan-pro-field",
    edge: "border-plan-pro-edge",
    ink: "text-primary",
    rail: "bg-primary",
  },
  {
    key: "agency",
    name: "Agency",
    target: "대행사",
    price: PLAN_PRICES.agency,
    credits: PLAN_CREDIT_ALLOWANCE.agency,
    perks: ["클라이언트 10팀 연동", "자동 DM 콘텐츠 100개", "멀티 클라이언트 광고 관리", "팀 10인 + 권한 관리"],
    field: "bg-plan-agency-field",
    edge: "border-plan-agency-edge",
    ink: "text-plan-agency-ink",
    rail: "bg-plan-agency-ink",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    target: "대형 대행사·브랜드",
    price: PLAN_PRICES.enterprise,
    credits: PLAN_CREDIT_ALLOWANCE.enterprise,
    perks: ["클라이언트 무제한", "자동 DM 무제한", "무제한 팀 시트 + 권한 관리", "전담 매니저 지원"],
    field: "bg-plan-ent-field",
    edge: "border-plan-ent-edge",
    ink: "text-plan-ent-ink",
    rail: "bg-plan-ent-ink",
  },
];

const won = (n: number) => n.toLocaleString("ko-KR");

/**
 * 매그네틱 CTA — 알약 버튼 + 화살표 전용 원형 캡슐.
 * 호버: 버튼은 살짝 눌리고(scale) 안쪽 원만 대각선으로 밀린다 → 내부 운동 긴장.
 * 프로젝트 이징 토큰(--ease-arrive)을 쓴다 — 임의 cubic-bezier 를 흩뿌리지 않는다.
 */
export function PlanCta({
  href,
  label,
  filled = false,
}: {
  href: string;
  label: string;
  filled?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-chip py-2 pl-6 pr-2 text-[14.5px] font-bold",
        "transition-transform duration-300 ease-arrive active:scale-[0.98]",
        filled
          ? "bg-primary text-on-primary hover:bg-primary-hover"
          : "border border-line-strong bg-body text-fg hover:border-fg",
      )}
    >
      {label}
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-chip transition-transform duration-300 ease-arrive",
          "group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
          filled ? "bg-on-primary/15" : "bg-surface",
        )}
      >
        <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
      </span>
    </Link>
  );
}

export function PlanCard({
  plan,
  action,
  highlight = false,
  badge,
  /** 진입 스태거 — 카드가 정지 상태로 나타나지 않게 한다 */
  index = 0,
}: {
  plan: PlanCardData;
  action?: React.ReactNode;
  highlight?: boolean;
  badge?: string;
  index?: number;
}) {
  const buys = plan.credits !== null ? buysFor(plan.credits) : null;

  return (
    /* ── 바깥 트레이 — 플랜 색면이 카드를 "받치는 판"이 된다 ── */
    <div
      className={cn(
        "anim-fade-up h-full rounded-card border p-1.5",
        plan.field,
        highlight ? "border-primary glow-brand" : cn(plan.edge, "glow-soft"),
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* ── 안쪽 코어 — 동심원 반경 + 상단 하이라이트 1px ── */}
      <div className="bezel-core flex h-full flex-col bg-body">
        <div className="px-7 pb-6 pt-7">
          <div className="flex min-h-6 items-center justify-between gap-2">
            <p
              className={cn(
                "rounded-chip px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.18em]",
                plan.field,
                plan.ink,
              )}
            >
              {plan.target}
            </p>
            {badge ? (
              <span
                className={cn(
                  "rounded-chip px-2.5 py-1 text-[11px] font-bold",
                  highlight ? "bg-primary text-on-primary" : "bg-surface text-fg-sub",
                )}
              >
                {badge}
              </span>
            ) : null}
          </div>

          <h3 className="mt-4 text-[26px] font-bold tracking-[-0.015em] text-fg">{plan.name}</h3>

          <p className="mt-2 flex items-baseline gap-1.5">
            {plan.price === 0 ? (
              <span className="text-[46px] font-bold leading-none tracking-[-0.035em] text-fg">무료</span>
            ) : (
              <>
                <span className="tnum text-[46px] font-bold leading-none tracking-[-0.035em] text-fg">
                  {won(plan.price)}
                </span>
                <span className="text-[17px] font-bold text-fg">원</span>
                <span className="text-[13px] font-medium text-fg-sub">/월</span>
              </>
            )}
          </p>
        </div>

        {/* 크레딧 블록 — 색면을 얇게 깔아 카드 안에서 층을 한 번 더 만든다 */}
        <div className={cn("mx-1.5 rounded-card px-5 py-5", plan.field)}>
          {buys ? (
            <>
              <p className="flex items-baseline gap-2">
                <span className="tnum text-[30px] font-bold leading-none tracking-[-0.02em] text-fg">
                  {won(plan.credits as number)}
                </span>
                <span className="text-[13.5px] font-bold text-fg-sub">크레딧 / 월</span>
              </p>
              <ul className="mt-4 space-y-2">
                {buys.map((b) => (
                  <li key={b.label} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="text-fg-sub">{b.label}</span>
                    <span className="tnum font-bold text-fg">
                      {won(b.n)}
                      <span className="ml-0.5 text-[12px] font-medium text-fg-sub">{b.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11.5px] text-fg-sub">한 기능에 몰아 썼을 때 · 중 택 1</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold text-fg">크레딧 없이 월 횟수로</p>
              <ul className="mt-3.5 space-y-2">
                {plan.counts?.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-[13.5px] text-fg-sub">
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-chip", plan.rail)} />
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11.5px] text-fg-sub">카드뉴스·진단·아이디어는 유료 기능</p>
            </>
          )}
        </div>

        <ul className="flex-1 space-y-2.5 px-7 py-6">
          {plan.perks.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[13.5px] leading-[1.55] text-fg-sub">
              <Check
                className={cn("mt-0.5 size-4 shrink-0", highlight ? "text-primary" : plan.ink)}
                strokeWidth={1.5}
                aria-hidden
              />
              {p}
            </li>
          ))}
        </ul>

        {action ? <div className="px-5 pb-5">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * 위 3 / 아래 2 배치(사장님 지시)를 비대칭 벤토로 짠다.
 * 6열 그리드에서 위는 2열씩·아래는 3열씩 — 아래 두 장이 넓어져
 * 상위 플랜이 시각적으로도 더 큰 물건이 된다.
 */
export function PlanCardGrid({ children }: { children: React.ReactNode[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6 lg:gap-5">
      {children.map((child, i) => (
        <div key={i} className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}>
          {child}
        </div>
      ))}
    </div>
  );
}
