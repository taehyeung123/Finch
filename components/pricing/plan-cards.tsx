import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { CREDIT_COSTS, PLAN_CREDIT_ALLOWANCE, creditsBuy } from "@/lib/pricing/credit-config";
import { PLAN_PRICES } from "@/lib/toss/config";

/*
  요금제 카드 — **마케팅 /pricing 과 앱 /settings/billing 이 같이 쓴다.**

  두 화면이 따로 놀아서 사장님이 앱 안 결제 화면을 보며 "뭘 바꾼 거냐"고 물었다
  (2026-08-15). 요금제 표현은 한 곳에서만 만든다.

  배치: **위 3 / 아래 2** (사장님 지시). 5칸 균등은 카드가 230px로 눌려 못 쓰고,
  3+2면 위 칸 373px · 아래 칸 566px 로 42px 가격과 기능 목록이 넉넉히 들어간다.
  테두리는 브랜드 코랄로 빛나게(.glow-brand) — 추천 플랜만. 5장이 다 빛나면
  위계가 사라진다.
*/

export interface PlanCardData {
  key: "free" | "creator" | "pro" | "agency" | "enterprise";
  name: string;
  target: string;
  price: number;
  /** null = 크레딧을 쓰지 않는 무료 플랜 */
  credits: number | null;
  /** 무료 전용 — 크레딧 대신 세는 월 횟수 */
  counts?: string[];
  perks: string[];
  /** 색 토큰 클래스 */
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
 * 카드 한 장. `action` 은 화면마다 다르다 —
 * 마케팅은 "시작하기" 링크, 앱 결제 화면은 플랜 변경 폼이 들어온다.
 */
export function PlanCard({
  plan,
  action,
  /** 코랄 글로우 대상. 마케팅은 Pro, 앱에서는 현재 플랜 */
  highlight = false,
  /** 강조 배지 문구 — "가장 인기" / "사용 중" */
  badge,
}: {
  plan: PlanCardData;
  action?: React.ReactNode;
  highlight?: boolean;
  badge?: string;
}) {
  const buys = plan.credits !== null ? buysFor(plan.credits) : null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-card border bg-body",
        highlight ? "border-primary glow-brand" : cn(plan.edge, "glow-soft"),
      )}
    >
      {/* 상단 컬러 레일 — 카드가 색을 "가진" 것처럼 보이게 하는 층 */}
      <span aria-hidden className={cn("h-1.5 w-full shrink-0", plan.rail)} />

      {/* 헤더 — 색면 위에 이름·가격. 글자는 항상 fg(잉크)라 가독성이 색에 안 흔들린다 */}
      <div className={cn("px-7 pb-7 pt-6", plan.field)}>
        <div className="flex min-h-7 items-center justify-between gap-2">
          <p className={cn("text-[12px] font-bold uppercase tracking-[0.14em]", plan.ink)}>
            {plan.target}
          </p>
          {badge ? (
            <span
              className={cn(
                "rounded-chip px-2.5 py-1 text-[11px] font-bold",
                highlight ? "bg-primary text-on-primary" : "bg-body text-fg-sub",
              )}
            >
              {badge}
            </span>
          ) : null}
        </div>

        <h3 className="mt-2.5 text-[30px] font-bold tracking-[-0.01em] text-fg">{plan.name}</h3>

        <p className="mt-3 flex items-baseline gap-1.5">
          {plan.price === 0 ? (
            <span className="text-[44px] font-bold leading-none tracking-[-0.03em] text-fg">무료</span>
          ) : (
            <>
              <span className="tnum text-[44px] font-bold leading-none tracking-[-0.03em] text-fg">
                {won(plan.price)}
              </span>
              <span className="text-[17px] font-bold text-fg">원</span>
              <span className="text-[13px] font-medium text-fg-sub">/월</span>
            </>
          )}
        </p>
      </div>

      {/* 크레딧 블록 — 이 제품 요금제의 유일한 차별점 */}
      <div className="border-b border-line px-7 py-6">
        {buys ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="tnum text-[32px] font-bold leading-none tracking-[-0.02em] text-fg">
                {won(plan.credits as number)}
              </span>
              <span className="text-[14px] font-bold text-fg-sub">크레딧 / 월</span>
            </p>
            <ul className="mt-4 space-y-2">
              {buys.map((b) => (
                <li key={b.label} className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="text-fg-sub">{b.label}</span>
                  <span className="tnum font-bold text-fg">
                    {won(b.n)}
                    <span className="ml-0.5 text-[12px] font-medium text-fg-sub">{b.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-fg-sub">한 기능에 몰아 썼을 때 · 중 택 1</p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold text-fg">크레딧 없이 월 횟수로 제공</p>
            <ul className="mt-4 space-y-2">
              {plan.counts?.map((c) => (
                <li key={c} className="flex items-center gap-2 text-[14px] text-fg-sub">
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", plan.rail)} />
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-fg-sub">카드뉴스·진단·아이디어는 유료 플랜 기능</p>
          </>
        )}
      </div>

      {/* 운영 한도 */}
      <ul className="flex-1 space-y-3 px-7 py-6">
        {plan.perks.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-[14px] leading-[1.55] text-fg-sub">
            <Check className={cn("mt-0.5 size-4 shrink-0", highlight ? "text-primary" : plan.ink)} aria-hidden />
            {p}
          </li>
        ))}
      </ul>

      {action ? <div className="px-7 pb-7">{action}</div> : null}
    </div>
  );
}

/**
 * 위 3 / 아래 2 배치. 6열 그리드에서 위 칸은 2열씩, 아래 칸은 3열씩 차지한다 —
 * 아래 두 장이 더 넓어져 상위 플랜이 시각적으로도 더 큰 물건이 된다.
 */
export function PlanCardGrid({ children }: { children: React.ReactNode[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-6">
      {children.map((child, i) => (
        <div key={i} className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}>
          {child}
        </div>
      ))}
    </div>
  );
}
