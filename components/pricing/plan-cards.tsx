import { ArrowRight, Check, MessageCircle, Megaphone, Sparkles, TrendingUp, Video } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { CREDIT_COSTS, PLAN_CREDIT_ALLOWANCE, creditsBuy } from "@/lib/pricing/credit-config";
import { PLAN_PRICES } from "@/lib/toss/config";

/*
  요금제 카드 — **제미나이 구독 페이지 실측 재구현** (2026-08-15, 사장님 선택).

  앞선 세 번(인쇄물 조판 / 색면 카드 / 더블베젤)이 전부 반려됐다. 원인은 하나로
  수렴한다: 사장님이 제미나이를 레퍼런스로 주셨는데 나는 매번 **장식을 더 얹는**
  방향으로 갔다. 제미나이는 정반대 — 흰 바탕에 헤어라인 하나, 굵기 500 이하,
  큰 글씨, 색은 버튼 하나뿐이다.

  gemini.google/kr/subscriptions 라이브 DOM 실측값(1440px 뷰포트):
   · 카드      radius 32px · border 1px #E5E5E5 · bg 투명(흰 지면) · shadow none
               padding 32px 24px · width 320px · grid gap 16px
   · 가격      36px / weight **500** / letter-spacing -1px   (700 아님)
   · 통화기호  18px / weight 500
   · 기능 목록 18px / line-height 25.2px(1.4) / weight 400 / **검정**
   · 설명문    16px / line-height 22.4px(1.4) / #666
   · CTA       높이 44px · padding 12px 24px · radius 48px(알약) · border 1px 회색
               font 16px / weight 400

  우리 토큰으로 옮긴 매핑:
   · radius 32px → rounded-chip (마침 같은 값이라 2단계 규칙 안 깨진다)
   · #E5E5E5     → border-line (라이트에서 rgba(17,20,26,0.1) ≈ 같은 밝기)
   · #666        → text-fg-sub
   · 검정 본문   → text-fg
   · 다크는 제미나이에 없다 — bg-body + border-line 으로 같은 문법을 우리 팔레트에서 다시 짠다.

  **장식 금지**(이번 지시의 핵심): 색면·트레이·글로우·컬러 레일·그라데이션 전부 없다.
  강조는 추천 플랜의 **버튼 색 하나뿐**이다.
*/

export interface PlanCardData {
  key: "free" | "creator" | "pro" | "agency" | "enterprise";
  name: string;
  target: string;
  price: number;
  credits: number | null;
  counts?: string[];
  perks: string[];
  /** 실제로 진행 중인 혜택만 적는다 — 없는 프로모션을 지어내지 않는다.
      현재 유일한 혜택: 오픈 베타 Creator 3개월 무료(components/landing/promo-banner.tsx) */
  benefit?: string;
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
    target: "신용카드 없이 핀치를 바로 써봅니다.",
    price: 0,
    credits: null,
    counts: ["AI 챗 3회", "영상 분석 1회", "레퍼런스 수집 1회", "대본 추출 1회"],
    perks: ["채널 1개 연동", "자동 DM 콘텐츠 1개", "레퍼런스 열람", "커뮤니티 지원"],
  },
  {
    key: "creator",
    name: "Creator",
    target: "내 채널을 키우는 개인 크리에이터를 위한 플랜입니다.",
    price: PLAN_PRICES.creator,
    credits: PLAN_CREDIT_ALLOWANCE.creator,
    benefit: "오픈 베타 — 3개월 무료",
    perks: ["채널 3개 연동", "자동 DM 콘텐츠 5개", "레퍼런스 무제한 열람", "이메일 지원"],
  },
  {
    key: "pro",
    name: "Pro",
    target: "오가닉 분석에 광고 관리까지 함께 합니다.",
    price: PLAN_PRICES.pro,
    credits: PLAN_CREDIT_ALLOWANCE.pro,
    perks: ["메타광고 생성·관리", "자동 DM 콘텐츠 20개", "경쟁사 광고 모니터링", "팀 최대 3인"],
  },
  {
    key: "agency",
    name: "Agency",
    target: "여러 클라이언트를 한 계정에서 운영하는 대행사용입니다.",
    price: PLAN_PRICES.agency,
    credits: PLAN_CREDIT_ALLOWANCE.agency,
    perks: ["클라이언트 10팀 연동", "자동 DM 콘텐츠 100개", "멀티 클라이언트 광고 관리", "팀 10인 + 권한 관리"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    target: "클라이언트 수 제한 없이 운영하는 조직을 위한 최상위 플랜입니다.",
    price: PLAN_PRICES.enterprise,
    credits: PLAN_CREDIT_ALLOWANCE.enterprise,
    perks: ["클라이언트 무제한", "자동 DM 무제한", "무제한 팀 시트 + 권한 관리", "전담 매니저 지원"],
  },
];

const won = (n: number) => n.toLocaleString("ko-KR");

/** 포함 기능 아이콘 행 — 레퍼런스의 하단 아이콘 스트립. 텍스트 나열보다 훑기가 빠르다 */
const FEATURE_ICONS = [
  { icon: Sparkles, label: "카드뉴스" },
  { icon: TrendingUp, label: "성장 진단" },
  { icon: Video, label: "영상 분석" },
  { icon: MessageCircle, label: "자동 DM" },
  { icon: Megaphone, label: "메타광고" },
];

/** CTA — 알약 + 화살표(레퍼런스). 채운 버튼은 강조 플랜 하나뿐 */
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
        "group flex h-12 w-full items-center justify-center gap-1.5 rounded-chip px-6 text-[16px] font-medium transition-colors",
        filled
          ? "bg-primary text-on-primary hover:bg-primary-hover"
          : "border border-line-strong text-fg hover:bg-surface",
      )}
    >
      {label}
      <ArrowRight
        className="size-4 transition-transform duration-300 ease-arrive group-hover:translate-x-0.5"
        strokeWidth={2}
        aria-hidden
      />
    </Link>
  );
}

export function PlanCard({
  plan,
  action,
  highlight = false,
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
        "flex h-full flex-col rounded-chip border bg-body px-6 py-8 text-center",
        highlight ? "border-primary" : "border-line",
      )}
    >
      {/* 플랜명 — 가운데, 브랜드 색 (레퍼런스 문법) */}
      <p className="text-[22px] font-medium tracking-[-0.01em] text-primary">{plan.name}</p>

      {badge ? (
        <span className="mx-auto mt-3 inline-flex w-fit items-center rounded-chip border border-line-strong px-3 py-1 text-[12.5px] font-medium text-fg">
          {badge}
        </span>
      ) : null}

      <p className="mx-auto mt-3 max-w-[34ch] text-[15px] leading-[1.5] text-fg-sub">{plan.target}</p>

      {/* 스펙 강조 — 레퍼런스의 200GB/2TB 자리. 우리는 크레딧이 그 자리다 */}
      <div className="mt-6">
        {buys ? (
          <>
            <p className="tnum text-[30px] font-medium leading-none tracking-[-0.02em] text-fg">
              {won(plan.credits as number)}
            </p>
            <p className="mt-1.5 text-[14px] text-fg-sub">크레딧 / 월</p>
          </>
        ) : (
          <>
            <p className="text-[30px] font-medium leading-none tracking-[-0.02em] text-fg">월 횟수</p>
            <p className="mt-1.5 text-[14px] text-fg-sub">크레딧 없이 제공</p>
          </>
        )}
      </div>

      {/* 가격 — 혜택이 있으면 원가 취소선 + 혜택 문구 */}
      <div className="mt-6">
        {plan.price === 0 ? (
          <p className="text-[28px] font-medium leading-none tracking-[-0.5px] text-fg">무료</p>
        ) : (
          <>
            {/* 취소선을 쓰지 않는다 — 현재 혜택은 '3개월 무료'이지 할인가가 아니다.
                같은 금액에 취소선을 그으면 없는 할인을 있는 것처럼 보이게 한다. */}
            <p className="flex items-baseline justify-center gap-1">
              <span className="tnum text-[28px] font-medium leading-none tracking-[-0.5px] text-fg">
                {won(plan.price)}
              </span>
              <span className="text-[15px] font-medium text-fg">원</span>
              <span className="text-[14px] text-fg-sub">/ 월</span>
            </p>
            {plan.benefit ? (
              <p className="mt-2 text-[13.5px] font-medium text-primary">{plan.benefit}</p>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-6">{action}</div>

      {/* 크레딧 환산 — 무엇을 몇 개 살 수 있는지 */}
      <div className="mt-7 border-t border-line pt-6 text-left">
        {buys ? (
          <ul className="space-y-2.5">
            {buys.map((b) => (
              <li key={b.label} className="flex items-baseline justify-between gap-3 text-[15px] leading-[1.4]">
                <span className="text-fg-sub">{b.label}</span>
                <span className="tnum text-fg">
                  {won(b.n)}
                  {b.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2.5">
            {plan.counts?.map((c) => (
              <li key={c} className="text-[15px] leading-[1.4] text-fg-sub">
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 포함 기능 아이콘 스트립 — 레퍼런스 하단 구조 */}
      <div className="mt-6 border-t border-line pt-6">
        <p className="text-[13px] text-fg-sub">포함 기능</p>
        <div className="mt-3.5 flex items-start justify-center gap-4">
          {FEATURE_ICONS.map(({ icon: Icon, label }) => {
            const off = plan.key === "free" && (label === "카드뉴스" || label === "성장 진단" || label === "메타광고");
            return (
              <div key={label} className="flex w-12 flex-col items-center gap-1.5">
                <Icon
                  className={cn("size-5", off ? "text-fg-faint" : "text-fg")}
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className={cn("text-[11px] leading-tight", off ? "text-fg-faint" : "text-fg-sub")}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 운영 한도 */}
      <ul className="mt-6 flex-1 space-y-3 border-t border-line pt-6 text-left">
        {plan.perks.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-[15px] leading-[1.45] text-fg">
            <Check className="mt-0.5 size-4 shrink-0 text-fg-sub" strokeWidth={1.5} aria-hidden />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 위 3 / 아래 2 (사장님 지시). 제미나이는 4열 균등이지만 우리는 플랜이 5개다 —
 * 5열 균등은 1152px 에서 카드가 214px 로 눌려 36px 가격과 18px 목록이 못 들어간다.
 * 3+2 면 위 373px · 아래 566px 로 둘 다 실측 폭(320px) 이상을 확보한다.
 */
export function PlanCardGrid({ children }: { children: React.ReactNode[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
      {children.map((child, i) => (
        <div key={i} className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}>
          {child}
        </div>
      ))}
    </div>
  );
}
