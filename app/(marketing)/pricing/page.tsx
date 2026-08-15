import { Fragment } from "react";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { FinchMark } from "@/components/logo";
import { planFeatures } from "@/lib/data";
import { CREDIT_COSTS } from "@/lib/pricing/credit-config";
import { PLAN_PRICES } from "@/lib/toss/config";
import { PLAN_CARDS, PlanCard, PlanCardGrid, PlanCta } from "@/components/pricing/plan-cards";

/*
  요금제 지면 — 2차 전면 개편(2026-08-15).

  1차(가로 5행 스트라이프 · 인쇄물 조판)는 반려됐다. 실캡처로 확인한 실패 원인:
   ① 색면 알파가 5%라 스크린샷에서 흰 배경과 구분이 안 됨
   ② 카드가 없어 물성·깊이가 0 — 얇은 괘선 문서로 읽힘
   ③ 배치가 바뀐 티가 안 남
  그래서 이번엔 배치부터 다시 짰다:
   - 코랄 히어로 패널(브랜드 마크 워터마크) → 첫 화면부터 색이 꽉 찬 면이 존재
   - Free는 가로 바로 분리, 유료 4장만 카드 그리드(264px 확보 → 42px 가격이 들어간다)
   - Pro 카드는 헤더를 코랄로 꽉 채우고 잉크를 반전 + 위로 승격
   - 섹션 배경을 surface/body 로 교차해 리듬을 만든다(1차는 전 구간 단색이었다)
   - 크레딧 소모표를 칩 그리드로 — 점선 목록은 시각적으로 너무 약했다

  유지되는 규칙:
   - 1크레딧=10원 환율 비노출(노출되면 마진이 즉시 계산된다)
   - 미확정 사실 금지(연간 할인·부가세·프로모션)
   - 숫자는 전부 상수에서 파생 — 화면과 과금이 갈리면 그게 클레임이다
*/

export const metadata: Metadata = {
  title: "요금제",
  description:
    "핀치 요금제 — 무료 플랜과 Creator 월 9,900원, Pro 월 29,000원, Agency 월 99,000원, Enterprise 월 249,000원. 유료 플랜은 기능별 횟수 제한 없이 월 크레딧 하나로 AI 카드뉴스·성장 진단·영상 분석·레퍼런스 수집을 자유롭게 씁니다. 무료 플랜은 신용카드 없이 바로 시작할 수 있습니다.",
  alternates: { canonical: "/pricing" },
};

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

const TABLE_COLS = [
  { key: "free", name: "Free", price: 0, rail: "bg-plan-free-ink" },
  { key: "creator", name: "Creator", price: PLAN_PRICES.creator, rail: "bg-plan-creator-ink" },
  { key: "pro", name: "Pro", price: PLAN_PRICES.pro, rail: "bg-primary" },
  { key: "agency", name: "Agency", price: PLAN_PRICES.agency, rail: "bg-plan-agency-ink" },
  { key: "enterprise", name: "Enterprise", price: PLAN_PRICES.enterprise, rail: "bg-plan-ent-ink" },
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
      offers: PLAN_CARDS.filter((p) => p.price > 0).map((p) => ({
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

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* ── S0 히어로 — 제미나이 문법: 흰 지면, 중앙 정렬, 큰 글씨, 장식 없음.
             앞선 안의 코랄 패널은 걷어냈다(강조는 버튼 색 하나뿐이라는 지시). ── */}
      <section className="mx-auto max-w-6xl px-4 pt-16 text-center md:px-6 md:pt-20">
        <FinchMark className="mx-auto size-12 text-primary" />
        <h1 className="mt-8 text-[clamp(36px,5.2vw,56px)] font-medium leading-[1.15] tracking-[-0.03em]">
          핀치를 <span className="text-primary-ink">최대한</span> 활용하세요
        </h1>
        <p className="mx-auto mt-6 max-w-[52ch] text-[18px] leading-[1.5] text-fg-sub">
          유료 플랜은 기능별 횟수 제한 없이 매달 받는 크레딧 하나로 씁니다.
          단가는 어느 플랜에서나 같고, 달라지는 건 크레딧의 양뿐입니다.
        </p>
      </section>

      {/* ── S1 플랜 카드 — 위 3 / 아래 2 (사장님 지시). 추천 플랜만 코랄 글로우 ── */}
      <section className="mx-auto max-w-6xl px-4 pt-12 md:px-6 md:pt-14">
        {/* 카드 제목이 h3 라서 그 위 단계가 필요하다. 시각적으로는 히어로가
            이미 그 역할을 하므로 화면에는 내지 않는다. */}
        <h2 className="sr-only">플랜별 요금</h2>
        <PlanCardGrid>
          {PLAN_CARDS.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              highlight={plan.key === "pro"}
              badge={plan.key === "pro" ? "가장 인기" : undefined}
              action={
                <PlanCta
                  /* 고른 플랜을 가입까지 들고 간다. 앞서는 5장이 전부 파라미터 없는
                     "/signup" 이라, 29,000원을 내겠다고 누른 사람과 무료로 누른 사람이
                     똑같은 화면에 떨어졌다 — 결제 의사가 클릭 한 번에 증발했다.
                     plan 은 signup 서버 컴포넌트에서 화이트리스트 검증 후 쓰인다. */
                  href={plan.key === "free" ? "/signup" : `/signup?plan=${plan.key}`}
                  filled={plan.key === "pro"}
                  label={plan.key === "free" ? "무료로 시작하기" : `${plan.name} 시작하기`}
                />
              }
            />
          ))}
        </PlanCardGrid>
      </section>

      {/* ── S2 크레딧 소모표 — 밴드 교차(surface). 칩 그리드로 시각 밀도를 올린다 ── */}
      <section className="mt-20 border-y border-line bg-surface md:mt-24">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-ink">크레딧 소모표</p>
              <h2 className="mt-3 text-[30px] font-bold leading-[1.2] tracking-[-0.02em] md:text-[36px]">
                크레딧 하나로
                <br />
                전부 씁니다
              </h2>
              <p className="mt-4 max-w-[34ch] text-[15px] leading-[1.75] text-fg-sub">
                기능마다 소모량이 정해져 있고, 무엇에 몰아 쓸지는 자유입니다. 단가는 어느 유료
                플랜에서나 같습니다.
              </p>
            </div>

            <div className="lg:col-span-8">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CREDIT_RATES.map((r) => (
                  <div
                    key={r.label}
                    className={`rounded-card border bg-body px-4 py-4 ${
                      r.cost >= 20 ? "border-plan-pro-edge" : "border-line"
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-fg-sub">{r.label}</p>
                    <p className="mt-1.5 flex items-baseline gap-1">
                      <span
                        className={`tnum text-[28px] font-bold leading-none tracking-[-0.02em] ${
                          r.cost >= 20 ? "text-primary-ink" : "text-fg"
                        }`}
                      >
                        {r.cost}
                      </span>
                      <span className="text-[11.5px] font-medium text-fg-sub">크레딧</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── S3 비교표 ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-fg-sub">플랜별 비교</p>
          <h2 className="mt-3 text-[30px] font-bold tracking-[-0.02em] md:text-[36px]">
            어떤 플랜이 맞을까요?
          </h2>
          <p className="mt-4 text-[15px] leading-[1.75] text-fg-sub">
            채널 하나만 가볍게 써본다면 Free, 내 채널을 키우는 개인 크리에이터라면 Creator, 광고까지
            함께 관리한다면 Pro, 여러 클라이언트를 운영하는 대행사라면 Agency, 클라이언트 수 제한 없이
            운영하는 조직이라면 Enterprise가 맞습니다.
          </p>
        </div>

        <div className="mt-8 rounded-card border border-line bg-body">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <caption className="sr-only">Free·Creator·Pro·Agency·Enterprise 플랜별 기능 비교</caption>
              <colgroup>
                <col className="w-[26%]" />
                {TABLE_COLS.map((c) => (
                  <col key={c.key} className="w-[14.8%]" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="px-5 pb-4 pt-6 text-[11px] font-bold uppercase tracking-[0.1em] text-fg-sub">
                    기능
                  </th>
                  {TABLE_COLS.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={`px-4 pb-4 pt-6 align-bottom ${c.key === "pro" ? "bg-plan-pro-field" : ""}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className={`size-2 rounded-full ${c.rail}`} />
                        <span className="text-[14px] font-bold">{c.name}</span>
                      </span>
                      <span className="tnum mt-1 block text-[12px] text-fg-sub">
                        {c.price === 0 ? "무료" : `${won(c.price)}원`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABLE_GROUPS.map((group) => (
                  /* Fragment 에 key 를 주지 않으면 React 가 "unique key" 경고를 낸다 —
                     구획 머리행 + 본문행들을 한 덩어리로 반환하는 구조라 여기가 목록의 자식이다. */
                  <Fragment key={group.label}>
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={6}
                        className="border-t border-line-strong bg-surface px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-fg-sub"
                      >
                        {group.label}
                      </th>
                    </tr>
                    {group.rows.map((label) => {
                      const row = planFeatures.find((f) => f.label === label);
                      if (!row) return null;
                      /* 크레딧 단가 구획은 단위를 행 라벨이 진다 — 셀에 "크레딧 20"을
                         24번 반복하면 표 절반이 같은 단어로 찬다. */
                      const isRate = group.label.startsWith("크레딧 단가");
                      const strip = (v: string) => (isRate ? v.replace(/^크레딧\s*/, "") : v);
                      return (
                        <tr key={label} className="border-b border-line last:border-0">
                          <th scope="row" className="px-5 py-3.5 text-[13.5px] font-medium text-fg">
                            {label}
                            {isRate ? <span className="ml-1 text-[12px] text-fg-sub">(크레딧)</span> : null}
                          </th>
                          {([row.free, row.creator, row.pro, row.agency, row.enterprise] as const).map(
                            (value, i) => (
                              <td
                                key={TABLE_COLS[i].key}
                                className={`tnum px-4 py-3.5 text-[13.5px] ${
                                  TABLE_COLS[i].key === "pro"
                                    ? "bg-plan-pro-field font-bold text-fg"
                                    : value === "—"
                                      ? "text-fg-sub"
                                      : "text-fg-sub"
                                }`}
                              >
                                {strip(value)}
                              </td>
                            ),
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 표를 끝까지 읽은 사람이 이 지면에서 구매 의사가 가장 높다. 그런데 여기서부터
            페이지 끝까지 유료 버튼이 하나도 없어서(마지막 CTA도 무료 하나뿐), 설득이
            끝난 자리에서 카드까지 되돌아 올라가야만 결제할 수 있었다. */}
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          <ButtonLink href="/signup" variant="secondary">
            무료로 시작하기
          </ButtonLink>
          <ButtonLink href="/signup?plan=pro">
            Pro 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </section>

      {/* ── S4 FAQ — 밴드 교차(surface) ── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-fg-sub">자주 묻는 질문</p>
          <h2 className="mt-3 text-[30px] font-bold tracking-[-0.02em] md:text-[36px]">
            요금제, 무엇이 궁금하신가요?
          </h2>
          <dl className="mt-10 grid gap-4 md:grid-cols-2">
            {PRICING_FAQ.map((item, i) => (
              <div key={item.q} className="rounded-card border border-line bg-body p-6">
                <dt className="flex gap-3">
                  <span className="tnum shrink-0 pt-0.5 text-[12px] font-bold text-primary-ink">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[16px] font-bold leading-[1.5]">{item.q}</span>
                </dt>
                <dd className="mt-2.5 pl-[27px] text-[14px] leading-[1.75] text-fg-sub">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── S5 최종 CTA ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
        <div className="flex flex-col gap-7 rounded-card border border-line bg-body p-8 md:flex-row md:items-center md:justify-between md:p-12">
          <div>
            <h2 className="text-[30px] font-bold leading-[1.15] tracking-[-0.02em] md:text-[38px]">
              무료 플랜으로 지금 시작하세요
            </h2>
            <p className="mt-3 max-w-[42ch] text-[15px] leading-[1.7] text-fg-sub">
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
