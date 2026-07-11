import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { planFeatures } from "@/lib/data";

export const metadata: Metadata = {
  title: "요금제",
  description:
    "핀치 요금제 안내 — 무료 플랜부터 개인 크리에이터용 Creator, 광고주용 Pro, 대행사용 Agency까지. 채널 연동·콘텐츠 분석·경쟁사 광고 모니터링·AI 카드뉴스 기능을 플랜별로 비교하세요.",
  alternates: { canonical: "/pricing" },
};

const PLANS = [
  {
    name: "Free",
    target: "체험",
    description: "신용카드 없이 핀치의 핵심 기능을 체험해보세요.",
    highlight: false,
    features: ["채널 1개 연동", "콘텐츠 분석 월 10회", "탐색/트렌드 요약 열람", "AI 카드뉴스 월 3회 (워터마크)"],
  },
  {
    name: "Creator",
    target: "개인 크리에이터",
    description: "내 채널 성장에 필요한 분석과 제작 도구를 모두 담았습니다.",
    highlight: false,
    features: ["채널 3개 연동", "콘텐츠 분석 월 100회", "경쟁사 계정 3개 분석", "AI 카드뉴스 무제한"],
  },
  {
    name: "Pro",
    target: "광고주·1인 마케터",
    description: "오가닉 분석에 경쟁사 광고 모니터링과 광고 관리까지.",
    highlight: true,
    features: ["콘텐츠 분석 무제한", "경쟁사 10개 + 광고 모니터링", "메타광고 생성·관리", "팀 기능 최대 3인"],
  },
  {
    name: "Agency",
    target: "대행사",
    description: "여러 클라이언트를 한 계정에서 운영하는 팀을 위한 플랜.",
    highlight: false,
    features: ["다중 클라이언트 채널 연동", "경쟁사·콘텐츠 분석 무제한", "멀티 클라이언트 광고 관리", "화이트라벨 + 무제한 팀 권한"],
  },
];

const PRICING_FAQ = [
  {
    q: "플랜은 언제든 바꿀 수 있나요?",
    a: "네. 언제든 상위 플랜으로 업그레이드하거나 하위 플랜으로 변경할 수 있으며, 사용량에 따른 자동 업그레이드 안내 기능도 지원할 예정입니다.",
  },
  {
    q: "무료 플랜 제한은?",
    a: "Free 플랜은 채널 1개 연동, 콘텐츠 분석 월 10회, AI 카드뉴스 월 3회(워터마크 포함)로 제한됩니다. 트렌드 탐색은 요약만 열람할 수 있습니다.",
  },
  {
    q: "어떤 결제 수단을 지원하나요?",
    a: "국내 PG 연동을 준비 중입니다. 정식 출시 시 신용카드·체크카드 등 주요 결제 수단을 지원할 예정입니다.",
  },
];

/* GEO: Product + Offer 구조화 데이터 (PART 13.2·13.3) — 가격 미정으로 price는 표기하지 않음 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "핀치 (Finch)",
  description:
    "핀치는 무료 플랜부터 대행사용 Agency 플랜까지 4단계 요금제를 제공하는 SNS 통합 분석 도구입니다.",
  brand: { "@type": "Brand", name: "핀치 (Finch)" },
  offers: PLANS.map((plan) => ({
    "@type": "Offer",
    name: `${plan.name} 플랜`,
    description: `${plan.target} 대상 — ${plan.features.join(", ")}`,
    priceCurrency: "KRW",
    availability: "https://schema.org/PreOrder",
  })),
};

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 히어로 (PART 9) */}
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 text-center md:px-6 md:pt-24">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">요금제</h1>
        {/* GEO: 자기완결적 정의 문장 (PART 13.3) */}
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-fg-sub">
          핀치는 무료 플랜부터 대행사용 Agency 플랜까지 4단계 요금제를 제공하는 SNS 통합 분석
          도구입니다. 무료로 시작하고, 팀과 채널이 커질 때 올리세요.
        </p>
      </section>

      {/* 플랜 카드 그리드 */}
      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-card border p-6 ${
                plan.highlight ? "border-primary bg-primary-weak" : "border-line bg-body"
              }`}
            >
              {plan.highlight ? (
                <Badge tone="primary" className="self-start">
                  가장 인기
                </Badge>
              ) : null}
              <h2 className={`text-lg font-bold ${plan.highlight ? "mt-3" : ""}`}>{plan.name}</h2>
              <p className="mt-0.5 text-[13px] text-fg-faint">{plan.target}</p>
              {/* 가격 미정 — 출시 시 공개 (PART 14) */}
              <p className="mt-4 text-xl font-bold">출시 시 공개</p>
              <p className="mt-3 text-[14px] leading-relaxed text-fg-sub">{plan.description}</p>
              <ul className="mt-5 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[14px] text-fg-sub">
                    <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <ButtonLink
                href="/signup"
                variant={plan.highlight ? "primary" : "secondary"}
                className="mt-6 w-full"
              >
                무료로 시작하기
              </ButtonLink>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-[13px] text-fg-faint">
          정식 출시 전까지 모든 플랜의 가격은 확정되지 않았으며, 출시 시 공개됩니다.
        </p>
      </section>

      {/* 상세 비교표 */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <h2 className="text-center text-2xl font-bold md:text-3xl">플랜별 기능 비교</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-fg-sub">
            채널 연동부터 팀 기능까지, 플랜별 제공 범위를 한눈에 확인하세요.
          </p>
          <div className="mt-10 overflow-x-auto rounded-card border border-line bg-body">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-fg-faint">
                  <th className="px-5 py-3.5 font-semibold">기능</th>
                  <th className="px-4 py-3.5 font-semibold">Free</th>
                  <th className="px-4 py-3.5 font-semibold">Creator</th>
                  <th className="px-4 py-3.5 font-semibold text-primary">Pro</th>
                  <th className="px-4 py-3.5 font-semibold">Agency</th>
                </tr>
              </thead>
              <tbody>
                {planFeatures.map((row) => (
                  <tr key={row.label} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 font-medium">{row.label}</td>
                    {[row.free, row.creator, row.pro, row.agency].map((value, i) => (
                      <td key={i} className={`tnum px-4 py-3.5 ${value === "-" ? "text-fg-faint" : "text-fg-sub"}`}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 요금 FAQ — 정적 목록 */}
      <section className="mx-auto max-w-3xl px-4 py-20 md:px-6">
        <h2 className="text-center text-2xl font-bold md:text-3xl">요금 관련 자주 묻는 질문</h2>
        <dl className="mt-10 space-y-4">
          {PRICING_FAQ.map((item) => (
            <div key={item.q} className="rounded-card border border-line bg-body p-6">
              <dt className="text-[15px] font-bold">{item.q}</dt>
              <dd className="mt-2 text-[14px] leading-relaxed text-fg-sub">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 최종 CTA (랜딩 PART 6.1-10 패턴) */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center md:px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            무료 플랜으로
            <br />
            지금 바로 시작하세요
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
            신용카드 없이 1분 만에 채널을 연동하고 첫 분석을 받아볼 수 있습니다.
          </p>
          <ButtonLink href="/signup" size="lg" className="mt-8">
            무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
