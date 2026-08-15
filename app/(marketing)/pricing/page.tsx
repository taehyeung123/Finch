import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { planFeatures } from "@/lib/data";
import { CREDIT_COSTS, PLAN_CREDIT_ALLOWANCE, creditsBuy } from "@/lib/pricing/credit-config";
import { PLAN_PRICES } from "@/lib/toss/config";

/*
  요금제 지면 — "요금표"가 아니라 **인쇄물의 구독 안내 지면**으로 조판한다.
  (2026-08-15 전면 리뉴얼. 아트디렉션 3안 경합 + 3관점 심사 결과: 에디토리얼 골격 채택,
   색면 팔레트는 부티크 안에서 이식 — 심사 전원이 "색이 너무 적다"를 지적했고
   사장님 지시의 첫 항목이 "색감 다양하게"였다.)

  이 페이지가 지키는 규칙 — 고치기 전에 읽을 것:
  1. **5열 균등 카드 금지.** 1152 ÷ 5 = 230px에 가격·크레딧·CTA를 넣으면 활자가 눌려
     "똑같이 생긴 좁은 기둥 5개"가 된다. 가로 5행 스트라이프라 가격·크레딧·CTA가
     세로축으로 정렬되고, 눈이 위아래로 훑기만 하면 비교가 끝난다.
  2. **CTA 버튼 5개 나열 금지.** Pro만 실버튼, 나머지는 밑줄 링크. 버튼이 세로로
     5개 늘어서는 순간 인쇄물이 아니라 진열대가 된다.
  3. **1크레딧 = 10원 환율 절대 비노출.** 노출되면 "460크레딧=4,600원인데 9,900원"이
     즉시 계산된다(lib/pricing/credit-config.ts 주석).
  4. **미확정 사실 금지** — 연간 할인, 부가세 문구, 프로모션 배지, 카운트다운.
  5. 숫자는 전부 상수에서 파생한다. 하드코딩하면 화면과 과금이 갈린다.
*/

export const metadata: Metadata = {
  title: "요금제",
  description:
    "핀치 요금제 — 무료 플랜과 Creator 월 9,900원, Pro 월 29,000원, Agency 월 99,000원, Enterprise 월 249,000원. 유료 플랜은 기능별 횟수 제한 없이 월 크레딧 하나로 AI 카드뉴스·성장 진단·영상 분석·레퍼런스 수집을 자유롭게 씁니다. 무료 플랜은 신용카드 없이 바로 시작할 수 있습니다.",
  alternates: { canonical: "/pricing" },
};

interface PlanRow {
  key: string;
  name: string;
  target: string;
  price: number;
  /** 유료만 값이 있다. null = 크레딧을 쓰지 않는 무료 플랜(단위계가 다르다) */
  credits: number | null;
  /** 무료 전용 — 크레딧 대신 세는 월 횟수 */
  counts: readonly string[] | null;
  note: string;
  field: string;
  edge: string;
  ink: string;
  rail: string;
  featured?: boolean;
}

/** 플랜 축 — 색 토큰 이름과 1:1. 행 러그 색 = 비교표 열 머리 점 색. */
const PLANS: readonly PlanRow[] = [
  {
    key: "free",
    name: "Free",
    target: "체험",
    price: 0,
    credits: null,
    /** 무료는 크레딧이 아니라 **횟수**로 센다 — 단위계가 다르다는 걸 형태로 보여준다 */
    counts: ["AI 챗 3회", "영상 분석 1회", "레퍼런스 수집 1회", "대본 추출 1회"],
    note: "자동 DM 콘텐츠 1개",
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
    counts: null,
    note: "자동 DM 콘텐츠 5개 · 채널 3개",
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
    counts: null,
    note: "자동 DM 콘텐츠 20개 · 메타광고 생성·관리",
    field: "bg-plan-pro-field",
    edge: "border-plan-pro-edge",
    ink: "text-primary",
    rail: "bg-primary",
    featured: true,
  },
  {
    key: "agency",
    name: "Agency",
    target: "대행사",
    price: PLAN_PRICES.agency,
    credits: PLAN_CREDIT_ALLOWANCE.agency,
    counts: null,
    note: "자동 DM 콘텐츠 100개 · 클라이언트 10팀 · 팀 10인",
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
    counts: null,
    note: "자동 DM 무제한 · 클라이언트 무제한 · 전담 매니저",
    field: "bg-plan-ent-field",
    edge: "border-plan-ent-edge",
    ink: "text-plan-ent-ink",
    rail: "bg-plan-ent-ink",
  },
];

/** 크레딧 소모 명세 — 비싼 순. 단가는 플랜과 무관하게 같다는 게 이 표의 메시지다. */
const CREDIT_RATES = [
  { label: "AI 카드뉴스", cost: CREDIT_COSTS.cardnews },
  { label: "성장 진단", cost: CREDIT_COSTS.diagnosis },
  { label: "아이디어 추천", cost: CREDIT_COSTS.ideas },
  { label: "브랜드 톤 학습", cost: CREDIT_COSTS.brandTone },
  { label: "레퍼런스 수집", cost: CREDIT_COSTS.collect },
  { label: "메타광고 수집", cost: CREDIT_COSTS.adCollect },
  { label: "영상 분석", cost: CREDIT_COSTS.videoAnalysis },
  { label: "AI 챗", cost: CREDIT_COSTS.agentChat },
  { label: "대본 추출", cost: CREDIT_COSTS.transcript },
];

/** 비교표 12행을 3구획으로 끊는다 — 연속 12행은 스캔이 죽는다 */
const TABLE_GROUPS = [
  { label: "규모", rows: ["월 크레딧", "채널 연동"] },
  {
    label: "크레딧 단가 — 플랜과 무관하게 동일",
    rows: ["AI 카드뉴스", "성장 진단", "아이디어 추천", "AI 챗", "영상 분석", "레퍼런스 수집"],
  },
  { label: "운영", rows: ["인스타 댓글 자동 DM", "메타광고 관리", "팀 기능", "지원"] },
];

const PRICING_FAQ = [
  {
    q: "크레딧이 뭔가요?",
    a: "유료 플랜은 기능별 횟수 제한 없이 매달 받는 크레딧 하나로 모든 AI 기능을 씁니다. AI 카드뉴스 한 장에 20크레딧, AI 챗 한 번에 4크레딧처럼 기능마다 소모량이 정해져 있고, 카드뉴스에 몰아 쓰든 챗에 몰아 쓰든 자유입니다. 단가는 어느 플랜에서나 같고, 플랜에 따라 달라지는 건 매달 받는 크레딧의 양뿐입니다.",
  },
  {
    q: "남은 크레딧은 다음 달로 넘어가나요?",
    a: "이월되지 않습니다. 매달 결제일에 플랜의 지급량까지 다시 채워집니다. 플랜을 해지하거나 낮추더라도 이미 지급된 크레딧은 사라지지 않고 남은 만큼 계속 쓸 수 있습니다.",
  },
  {
    q: "무료 플랜은 무엇을 쓸 수 있나요?",
    a: "무료 플랜은 크레딧 대신 기능별 월 횟수로 제공됩니다. AI 챗 3회, 영상 분석 1회, 레퍼런스 수집 1회, 대본 추출 1회, 인스타 댓글 자동 DM은 콘텐츠 1개까지 쓸 수 있습니다. AI 카드뉴스·성장 진단·아이디어 추천·브랜드 톤 학습은 유료 플랜 기능입니다.",
  },
  {
    q: "플랜은 언제든 바꿀 수 있나요?",
    a: "네. 언제든 상위 플랜으로 올리거나 하위 플랜으로 내릴 수 있습니다. 상위 플랜으로 올리면 결제 시점에 해당 플랜의 크레딧이 바로 채워집니다.",
  },
  {
    q: "Agency와 Enterprise의 차이는 무엇인가요?",
    a: "Agency는 클라이언트 10팀·팀원 10인까지 운영하는 대행사용 플랜이고, Enterprise는 클라이언트와 팀 시트에 제한이 없으며 전담 매니저 지원이 포함되는 대형 대행사·브랜드용 최상위 플랜입니다.",
  },
];

const won = (n: number) => n.toLocaleString("ko-KR");

/* GEO: Product + FAQPage + BreadcrumbList 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      name: "핀치 (Finch)",
      description:
        "핀치는 무료 플랜과 유료 4단계(Creator·Pro·Agency·Enterprise) 요금제를 제공하는 SNS 통합 분석 도구입니다. 유료 플랜은 월 크레딧 하나로 모든 AI 기능을 씁니다.",
      brand: { "@type": "Brand", name: "핀치 (Finch)" },
      offers: PLANS.filter((p) => p.price > 0).map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: String(p.price),
        priceCurrency: "KRW",
        availability: "https://schema.org/InStock",
        url: "https://finch.ai.kr/pricing",
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: PRICING_FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.ai.kr/" },
        { "@type": "ListItem", position: 2, name: "요금제", item: "https://finch.ai.kr/pricing" },
      ],
    },
  ],
};

/** 어깨활자 — 11px 캡스에 넓은 자간. 76px 제호와의 극단 대비가 조판 인상을 만든다 */
function Kicker({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.18em] text-fg-faint ${className}`}>
      {children}
    </p>
  );
}

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* ── S0 마스트헤드 — 좌 제호 / 우 리드문. 가운데 정렬하지 않는다 ── */}
      <section className="mx-auto max-w-6xl px-4 pt-14 md:px-6 md:pt-20">
        <div className="border-t-2 border-fg pt-4">
          <Kicker>Finch — 요금 안내</Kicker>
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-12 lg:gap-x-6">
          <h1 className="text-[clamp(44px,7vw,72px)] font-bold leading-[0.98] tracking-[-0.02em] lg:col-span-5">
            요금제
          </h1>
          <div className="lg:col-span-6 lg:col-start-7 lg:pt-3">
            <p className="max-w-[44ch] text-[17px] leading-[1.7] text-fg-sub md:text-[19px]">
              핀치는 무료 플랜과 유료 4단계 요금제를 제공하는 SNS 통합 분석 도구입니다.
              유료 플랜은 기능별 횟수 제한이 없습니다 —{" "}
              <strong className="font-bold text-fg">달라지는 건 매달 받는 크레딧의 양뿐입니다.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* ── S1 플랜 5행 스트라이프 ──
          5열 균등 그리드를 버린 자리다. 행으로 흐르면 가격·크레딧·CTA가 세로로 정렬돼
          위아래로 훑기만 해도 비교가 끝나고, 플랜이 5개든 7개든 폭 압박이 없다. */}
      <section className="mx-auto mt-14 max-w-6xl px-4 md:px-6">
        <div className="border-t-2 border-fg">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`relative grid gap-x-6 gap-y-5 border-b border-line pl-5 pr-1 lg:grid-cols-12 lg:items-center ${plan.field} ${
                plan.featured ? "py-9" : "py-7"
              }`}
            >
              {/* 좌측 러그 — 색이 나타나는 첫 자리. Pro만 두 배 두껍다 */}
              <span
                aria-hidden
                className={`absolute bottom-5 left-0 top-5 ${plan.rail} ${plan.featured ? "w-[6px]" : "w-[3px]"}`}
              />

              {/* 1) 플랜명 · 대상 */}
              <div className="lg:col-span-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[23px] font-bold tracking-[-0.01em]">{plan.name}</h2>
                  {plan.featured ? (
                    <span className="rounded-chip bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-on-primary">
                      가장 인기
                    </span>
                  ) : null}
                </div>
                <p className={`mt-1 text-[12.5px] font-semibold ${plan.ink}`}>{plan.target}</p>
              </div>

              {/* 2) 가격 — 숫자만 크게, 단위는 3단 강등 */}
              <div className="lg:col-span-2">
                {plan.price === 0 ? (
                  <p className="text-[34px] font-bold leading-none tracking-[-0.02em]">무료</p>
                ) : (
                  <p className="flex items-baseline gap-1">
                    <span className="tnum text-[34px] font-bold leading-none tracking-[-0.03em]">
                      {won(plan.price)}
                    </span>
                    <span className="text-[15px] font-semibold">원</span>
                    <span className="text-[12px] text-fg-faint">/월</span>
                  </p>
                )}
              </div>

              {/* 3) 크레딧(유료) 또는 횟수 점(무료) — 단위계가 다르다는 걸 형태로 보여준다 */}
              <div className="lg:col-span-4">
                {plan.credits !== null ? (
                  <>
                    <p className="flex items-baseline gap-1.5">
                      <span className="tnum text-[26px] font-bold leading-none">{won(plan.credits)}</span>
                      <span className="text-[13px] font-semibold text-fg-sub">크레딧 / 월</span>
                    </p>
                    <p className="mt-2 text-[13px] text-fg-sub">
                      카드뉴스{" "}
                      <strong className="tnum font-bold text-fg">
                        {won(creditsBuy(plan.credits, CREDIT_COSTS.cardnews))}
                      </strong>
                      장 · AI 챗{" "}
                      <strong className="tnum font-bold text-fg">
                        {won(creditsBuy(plan.credits, CREDIT_COSTS.agentChat))}
                      </strong>
                      회 · 영상 분석{" "}
                      <strong className="tnum font-bold text-fg">
                        {won(creditsBuy(plan.credits, CREDIT_COSTS.videoAnalysis))}
                      </strong>
                      편 <span className="text-fg-faint">중 택 1</span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-semibold text-fg-sub">크레딧 없이 월 횟수로 제공</p>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {plan.counts?.map((c) => (
                        <li key={c} className="flex items-center gap-1.5 text-[13px] text-fg-sub">
                          <span aria-hidden className={`size-1.5 rounded-full ${plan.rail}`} />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* 4) 운영 한도 + CTA — 실버튼은 Pro 하나뿐 */}
              <div className="lg:col-span-3 lg:pl-2">
                <p className="text-[13px] leading-[1.65] text-fg-sub">{plan.note}</p>
                <div className="mt-3">
                  {plan.featured ? (
                    <ButtonLink href="/signup" variant="primary">
                      Pro로 시작하기
                    </ButtonLink>
                  ) : (
                    <a
                      href="/signup"
                      className="inline-block text-[14px] font-bold underline decoration-line underline-offset-[6px] transition-colors hover:decoration-fg"
                    >
                      {plan.price === 0 ? "무료로 시작하기" : `${plan.name} 시작하기`}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-fg-faint">
          위 환산 수치는 크레딧을 한 기능에만 몰아 썼을 때의 최대치입니다. 무료 플랜은 크레딧을 쓰지 않습니다.
        </p>
      </section>

      {/* ── S2 크레딧 소모 명세 — 좌 난외주 / 우 영수증. 막대그래프를 그리지 않는다:
             20:1 범위를 선형 막대로 그리면 1크레딧이 3px가 되어 거짓말이 된다. ── */}
      <section className="mx-auto mt-24 max-w-6xl px-4 md:px-6">
        <div className="border-t-2 border-fg pt-4">
          <Kicker>크레딧 소모표</Kicker>
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-4">
            <h2 className="text-[28px] font-bold leading-[1.25] tracking-[-0.02em] md:text-[32px]">
              크레딧 하나로
              <br />
              전부 씁니다
            </h2>
            <p className="mt-4 max-w-[36ch] text-[15px] leading-[1.75] text-fg-sub">
              기능마다 소모량이 정해져 있고, 무엇에 몰아 쓸지는 자유입니다. 단가는 어느 유료
              플랜에서나 같습니다.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <ul className="border-t border-line">
              {CREDIT_RATES.map((r) => (
                <li key={r.label} className="flex items-baseline gap-3 border-b border-line py-3.5">
                  <span className="text-[14px] font-medium text-fg">{r.label}</span>
                  <span aria-hidden className="flex-1 border-b border-dashed border-line" />
                  <span
                    className={`tnum text-[15px] font-bold ${r.cost >= 20 ? "text-primary" : "text-fg"}`}
                  >
                    {r.cost}
                  </span>
                  <span className="text-[12px] text-fg-faint">크레딧</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── S3 비교표 — 12행을 3구획으로. sticky는 overflow-hidden과 충돌하므로
             테두리 래퍼와 스크롤 래퍼를 분리한다. ── */}
      <section className="mx-auto mt-24 max-w-6xl px-4 md:px-6">
        <div className="border-t-2 border-fg pt-4">
          <Kicker>플랜별 비교</Kicker>
        </div>
        <h2 className="mt-8 text-[28px] font-bold tracking-[-0.02em] md:text-[32px]">
          어떤 플랜이 맞을까요?
        </h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.75] text-fg-sub">
          채널 하나만 가볍게 써본다면 Free, 내 채널을 키우는 개인 크리에이터라면 Creator, 광고까지
          함께 관리한다면 Pro, 여러 클라이언트를 운영하는 대행사라면 Agency, 클라이언트 수 제한 없이
          운영하는 조직이라면 Enterprise가 맞습니다.
        </p>

        <div className="mt-8 rounded-card border border-line bg-body">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <caption className="sr-only">Free·Creator·Pro·Agency·Enterprise 플랜별 기능 비교</caption>
              <colgroup>
                <col className="w-[26%]" />
                {PLANS.map((p) => (
                  <col key={p.key} className="w-[14.8%]" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="px-5 pb-3 pt-5 text-[12px] font-bold uppercase tracking-[0.08em] text-fg-faint">
                    기능
                  </th>
                  {PLANS.map((p) => (
                    <th key={p.key} scope="col" className="px-4 pb-3 pt-5 align-bottom">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className={`size-2 rounded-full ${p.rail}`} />
                        <span className="text-[13.5px] font-bold">{p.name}</span>
                      </span>
                      <span className="tnum mt-1 block text-[11.5px] text-fg-faint">
                        {p.price === 0 ? "무료" : `${won(p.price)}원`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABLE_GROUPS.map((group) => (
                  <>
                    <tr key={`g-${group.label}`}>
                      <th
                        scope="colgroup"
                        colSpan={6}
                        className="border-t border-line-strong px-5 pb-2 pt-7 text-[11px] font-bold uppercase tracking-[0.1em] text-fg-faint"
                      >
                        {group.label}
                      </th>
                    </tr>
                    {group.rows.map((label) => {
                      const row = planFeatures.find((f) => f.label === label);
                      if (!row) return null;
                      /* 크레딧 단가 구획은 단위를 행 라벨이 진다 — 셀에 "크레딧 20"을
                         24번 반복하면 표 절반이 같은 단어로 찬다. 숫자만 세로로
                         정렬되는 모습 자체가 "플랜을 올려도 단가는 그대로"를 말한다. */
                      const isRate = group.label.startsWith("크레딧 단가");
                      const strip = (v: string) => (isRate ? v.replace(/^크레딧\s*/, "") : v);
                      return (
                        <tr key={label} className="border-b border-line last:border-0">
                          <th scope="row" className="px-5 py-3.5 text-[13.5px] font-medium text-fg">
                            {label}
                            {isRate ? <span className="ml-1 text-[12px] text-fg-faint">(크레딧)</span> : null}
                          </th>
                          {([row.free, row.creator, row.pro, row.agency, row.enterprise] as const).map(
                            (value, i) => (
                              <td
                                key={PLANS[i].key}
                                className={`tnum px-4 py-3.5 text-[13.5px] ${
                                  PLANS[i].key === "pro" ? "bg-plan-pro-field font-semibold text-fg" : ""
                                } ${value === "—" ? "text-fg-faint" : "text-fg-sub"}`}
                              >
                                {strip(value)}
                              </td>
                            ),
                          )}
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── S4 FAQ — 2단 조판. columns-2는 항목이 단 경계에서 잘려 쓰지 않는다 ── */}
      <section className="mx-auto mt-24 max-w-6xl px-4 md:px-6">
        <div className="border-t-2 border-fg pt-4">
          <Kicker>자주 묻는 질문</Kicker>
        </div>
        <dl className="mt-10 grid gap-x-14 gap-y-9 md:grid-cols-2">
          {PRICING_FAQ.map((item, i) => (
            <div key={item.q}>
              <dt className="flex gap-3">
                <span className="tnum shrink-0 pt-0.5 text-[11px] font-bold text-fg-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[16px] font-bold leading-[1.5]">{item.q}</span>
              </dt>
              <dd className="mt-2.5 pl-[26px] text-[14px] leading-[1.75] text-fg-sub">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── S5 콜로폰 CTA — 좌 활자 / 우 버튼. 가운데 정렬 CTA 블록을 쓰지 않는다 ── */}
      <section className="mx-auto mt-24 max-w-6xl px-4 pb-24 md:px-6">
        <div className="flex flex-col gap-7 border-t-2 border-fg pt-10 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[30px] font-bold leading-[1.15] tracking-[-0.02em] md:text-[40px]">
              무료 플랜으로
              <br />
              지금 시작하세요
            </h2>
            <p className="mt-4 max-w-[38ch] text-[15px] leading-[1.7] text-fg-sub">
              신용카드 없이 1분 만에 채널을 연동하고 첫 분석을 받아볼 수 있습니다.
            </p>
          </div>
          <ButtonLink href="/signup" size="lg" className="shrink-0">
            무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
