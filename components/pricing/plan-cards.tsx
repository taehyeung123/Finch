import { Check, Coins } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { CREDIT_COSTS, PLAN_CREDIT_ALLOWANCE, creditsBuy } from "@/lib/pricing/credit-config";
import { PLAN_PRICES } from "@/lib/toss/config";

/*
  요금제 카드 — 2026-08-15 재구성. 사장님이 링크팜 카드를 레퍼런스로 주시며
  "하얀 배경 + 간격 수정 + 저런 식으로 깔끔하게"라고 정정하셨다.

  앞 버전의 실패는 장식이 아니라 **블록 수**였다. 카드 하나에
    플랜명 / 배지 / 설명 / 크레딧 / 가격 / CTA / 환산목록 / 아이콘스트립 / 체크리스트
  9덩어리 + 구분선 3줄이 들어가 있었다. 가운데 정렬이라 눈이 매 줄 중앙으로
  돌아와야 했고, CTA가 카드 한가운데 박혀 5장의 버튼 높이가 제각각이었다.

  레퍼런스에서 실제로 가져온 문법:
   · 전부 **왼쪽 정렬** — 훑는 눈이 좌측 한 축만 따라간다
   · 이름 옆에 한글 병기(Creator 크리에이터)로 영문 플랜명의 진입 장벽을 없앤다
   · 가격 → 스펙 한 줄(월 N 크레딧) → 체크 목록 **하나** — 목록을 셋으로 쪼개지 않는다
   · CTA는 **카드 맨 아래 꽉 찬 버튼**, 5장이 같은 선에서 끝난다(mt-auto)
   · 구분선 0개 — 간격만으로 끊는다

  결과: 9블록·구분선 3 → 5블록·구분선 0. 아이콘 스트립은 삭제했다(체크 목록과
  같은 말을 두 번 하고 있었고, 20px 아이콘은 판독도 안 됐다).

  유지: 흰 지면 / 라운드 32px / 헤어라인 1px / 색은 CTA와 배지에만.
*/

export interface PlanCardData {
  key: "free" | "creator" | "pro" | "agency" | "enterprise";
  name: string;
  /** 한글 병기 — 영문 플랜명만 있으면 처음 온 사람이 위계를 못 읽는다 */
  ko: string;
  target: string;
  price: number;
  credits: number | null;
  counts?: string[];
  perks: string[];
  /** 실제로 진행 중인 혜택만 적는다 — 없는 프로모션을 지어내지 않는다.
      2026-08-15 현재 진행 중인 혜택 없음(「3개월 무료」는 이행 경로가 없어 철거).
      ⚠️ 값을 채우기 전에 결제 흐름에 실제 이행 경로가 있는지 먼저 확인할 것. */
  benefit?: string;
}

const buysFor = (credits: number) => [
  `AI 카드뉴스 ${creditsBuy(credits, CREDIT_COSTS.cardnews).toLocaleString("ko-KR")}장`,
  `AI 챗 ${creditsBuy(credits, CREDIT_COSTS.agentChat).toLocaleString("ko-KR")}회`,
  `영상 분석 ${creditsBuy(credits, CREDIT_COSTS.videoAnalysis).toLocaleString("ko-KR")}편`,
];

export const PLAN_CARDS: PlanCardData[] = [
  {
    key: "free",
    name: "Free",
    ko: "무료",
    target: "신용카드 없이 핀치를 바로 써봅니다.",
    price: 0,
    credits: null,
    counts: ["AI 챗 3회", "영상 분석 1회", "레퍼런스 수집 1회", "대본 추출 1회"],
    perks: ["채널 1개 연동", "자동 DM 콘텐츠 1개", "레퍼런스 열람", "커뮤니티 지원"],
  },
  {
    key: "creator",
    name: "Creator",
    ko: "크리에이터",
    target: "내 채널을 키우는 개인 크리에이터를 위한 플랜이에요.",
    price: PLAN_PRICES.creator,
    credits: PLAN_CREDIT_ALLOWANCE.creator,
    perks: ["채널 3개 연동", "자동 DM 콘텐츠 5개", "레퍼런스 무제한 열람", "이메일 지원"],
  },
  {
    key: "pro",
    name: "Pro",
    ko: "프로",
    target: "오가닉 분석에 메타광고 관리까지 함께 하는 플랜이에요.",
    price: PLAN_PRICES.pro,
    credits: PLAN_CREDIT_ALLOWANCE.pro,
    perks: ["메타광고 생성·관리", "자동 DM 콘텐츠 20개", "경쟁사 광고 모니터링", "팀 최대 3인"],
  },
  {
    key: "agency",
    name: "Agency",
    ko: "에이전시",
    target: "여러 클라이언트를 한 계정에서 운영하는 대행사용 플랜이에요.",
    price: PLAN_PRICES.agency,
    credits: PLAN_CREDIT_ALLOWANCE.agency,
    perks: ["클라이언트 10팀 연동", "자동 DM 콘텐츠 100개", "멀티 클라이언트 광고 관리", "팀 10인 + 권한 관리"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    ko: "엔터프라이즈",
    target: "클라이언트 수 제한 없이 운영하는 조직을 위한 최상위 플랜이에요.",
    price: PLAN_PRICES.enterprise,
    credits: PLAN_CREDIT_ALLOWANCE.enterprise,
    perks: ["클라이언트 무제한", "자동 DM 무제한", "무제한 팀 시트 + 권한 관리", "전담 매니저 지원"],
  },
];

const won = (n: number) => n.toLocaleString("ko-KR");

/** CTA — 카드 맨 아래 꽉 찬 버튼. 유료는 채우고 무료는 테두리만(레퍼런스 문법) */
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
        "flex h-11 w-full items-center justify-center rounded-card px-5 text-[15px] font-semibold transition-colors",
        filled
          ? "bg-primary text-on-primary hover:bg-primary-hover"
          : "border border-line-strong text-fg hover:bg-surface",
      )}
    >
      {label}
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
  /* 환산값과 운영 한도를 **한 목록**으로 합친다 — 같은 "이 플랜으로 뭘 하나"라는
     질문의 답인데 앞 버전은 구분선으로 셋을 갈라 놓아 세 번 읽게 만들었다. */
  const items = plan.credits !== null ? [...buysFor(plan.credits), ...plan.perks] : [...(plan.counts ?? []), ...plan.perks];

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-chip border bg-body p-6",
        highlight ? "border-primary" : "border-line",
      )}
    >
      {badge ? (
        <span className="mb-3 inline-flex w-fit items-center rounded-chip bg-primary-weak px-2.5 py-1 text-[12px] font-bold text-primary-ink">
          {badge}
        </span>
      ) : null}

      {/* 카드 제목은 h3 다 — p 로 두면 스크린리더 제목 탐색(H 키)에서 요금제가
          존재하지 않는 페이지가 된다. 부모 섹션이 h2 를 갖는다는 전제. */}
      <h3 className="flex items-baseline gap-2">
        <span className="text-[20px] font-bold tracking-[-0.01em] text-fg">{plan.name}</span>
        <span className="text-[14px] font-medium text-fg-sub">{plan.ko}</span>
      </h3>

      <p className="mt-2.5 text-[13.5px] leading-[1.6] text-fg-sub">{plan.target}</p>

      {/* 가격 */}
      <div className="mt-5">
        {plan.price === 0 ? (
          <p className="text-[30px] font-bold leading-none tracking-[-0.02em] text-fg">무료</p>
        ) : (
          <p className="flex items-baseline gap-1">
            <span className="tnum text-[30px] font-bold leading-none tracking-[-0.02em] text-fg">
              {won(plan.price)}원
            </span>
            <span className="text-[14px] text-fg-sub">/ 월</span>
          </p>
        )}
        {plan.benefit ? (
          <p className="mt-2 text-[13px] font-semibold text-primary-ink">{plan.benefit}</p>
        ) : null}
      </div>

      {/* 스펙 한 줄 — 레퍼런스의 "월 3000 AI 시드" 자리 */}
      <p className="mt-5 flex items-center gap-2 text-[15px] font-bold text-fg">
        <Coins className="size-[18px] shrink-0 text-primary" strokeWidth={2} aria-hidden />
        {plan.credits !== null ? `월 ${won(plan.credits)} 크레딧` : "크레딧 없이 월 횟수 제공"}
      </p>

      {/* 통합 목록 — 구분선 없이 간격으로만 끊는다 */}
      <ul className="mt-5 space-y-2.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2 text-[13.5px] leading-[1.5] text-fg">
            <Check className="mt-[3px] size-3.5 shrink-0 text-fg-sub" strokeWidth={2.5} aria-hidden />
            {t}
          </li>
        ))}
      </ul>

      {/* CTA — mt-auto 로 5장의 버튼이 같은 선에서 끝난다 */}
      <div className="mt-auto pt-6">{action}</div>
    </div>
  );
}

/**
 * 위 3 / 아래 2 (사장님 지시). 5열 균등은 1152px 에서 카드가 214px 로 눌린다.
 * 3+2 면 위 373px · 아래 566px 로 둘 다 레퍼런스 카드 폭(320px) 이상을 확보한다.
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
