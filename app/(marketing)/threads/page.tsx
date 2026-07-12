import type { Metadata } from "next";
import { ArrowRight, BarChart3, MessageCircle, MessageCircleQuestion, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { AppIconTile } from "@/components/icons/brand";

export const metadata: Metadata = {
  title: "쓰레드(Threads) 분석 사이트 — 스레드 계정·팔로워·인사이트 확인 | 핀치",
  description:
    "핀치는 내 쓰레드(Threads) 계정의 게시물 성과와 인사이트, 팔로워 통계를 확인하는 스레드 분석 사이트입니다. 인스타그램·틱톡과 함께 한 대시보드에서 스레드 계정 분석과 팔로워 확인을 무료로 시작해보세요.",
  alternates: { canonical: "/threads" },
};

/* FAQ — 하단 FaqAccordion과 JSON-LD FAQPage가 1:1로 매핑된다 */
const FAQ_ITEMS: FaqItem[] = [
  {
    q: "스레드랑 쓰레드랑 같은 건가요?",
    a: "네, 같은 서비스입니다. Meta의 공식 서비스명은 'Threads'이며, 한국에서는 쓰레드(스레드) 등 여러 표기로 검색되지만 핀치는 이를 모두 같은 채널로 인식해 분석해드립니다.",
  },
  {
    q: "다른 사람 쓰레드 계정도 분석할 수 있나요?",
    a: "아직은 지원하지 않습니다. 쓰레드는 공식 API가 비교적 최근에 열려, 현재 핀치는 내 쓰레드 계정의 게시물 성과·인사이트·팔로워 분석에 집중하고 있습니다. API 제공 범위가 넓어지는 대로 타 계정 분석도 순차적으로 지원할 예정입니다.",
  },
];

/* GEO: WebPage + FAQPage + BreadcrumbList 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "쓰레드(Threads) 분석 사이트",
      url: "https://finch.kr/threads",
      description:
        "핀치는 내 쓰레드(Threads) 계정의 게시물 성과와 인사이트, 팔로워 통계를 확인하는 스레드 분석 사이트입니다.",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.kr/" },
        { "@type": "ListItem", position: 2, name: "쓰레드 분석", item: "https://finch.kr/threads" },
      ],
    },
  ],
};

const FEATURES = [
  {
    icon: MessageCircle,
    title: "게시물 성과",
    description: "좋아요·답글·리포스트 등 게시물별 반응을 확인합니다.",
  },
  {
    icon: BarChart3,
    title: "스레드 인사이트",
    description: "노출수 등 쓰레드 공식 API가 제공하는 기본 인사이트 지표를 확인합니다.",
  },
  {
    icon: Users,
    title: "팔로워 통계",
    description: "팔로워 수와 증감 추이를 인스타그램·틱톡과 나란히 확인합니다.",
  },
];

export default function ThreadsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 히어로 */}
      <section className="mx-auto max-w-3xl px-4 pb-14 pt-16 text-center md:px-6 md:pt-24">
        <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-primary">
          <AppIconTile app="threads" size={22} />
          Threads 계정 분석
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">쓰레드(Threads) 분석</h1>
        {/* GEO: 자기완결적 정의 문장 (PART 13.3) */}
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-fg-sub">
          핀치의 쓰레드 분석은 내 쓰레드(Threads) 계정의 게시물 성과와 인사이트, 팔로워 통계를 한 화면에서
          확인하는 스레드 분석 사이트 기능입니다. 인스타그램과 함께 쓴다면 인스타 스레드 분석까지 대시보드
          하나로 끝낼 수 있어요.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/signup" size="lg">
            무료로 쓰레드 분석 시작하기
          </ButtonLink>
        </div>
      </section>

      {/* 계정 분석 — 무엇을 볼 수 있나요 (내 계정 범위 명시) */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-4xl px-4 py-20 md:px-6">
          <Reveal>
            <h2 className="text-center text-2xl font-bold md:text-3xl">쓰레드 계정 분석, 무엇을 볼 수 있나요?</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[15px] leading-relaxed text-fg-sub">
              쓰레드는 공식 API가 비교적 최근에 열려, 핀치는 우선 내 쓰레드 계정을 중심으로 게시물 성과·스레드
              인사이트·팔로워 통계를 분석합니다.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }, i) => (
              <Reveal key={title} delay={0.05 * i} className="h-full">
                <div className="h-full rounded-card border border-line bg-body p-6">
                  <span className="flex size-10 items-center justify-center rounded-card bg-primary-weak text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold">{title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-sub">{description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 팔로워 확인 + 타 채널 상호 링크 */}
      <section className="mx-auto max-w-3xl px-4 py-20 md:px-6">
        <Reveal>
          <h2 className="text-center text-2xl font-bold md:text-3xl">쓰레드 팔로워는 어떻게 확인하나요?</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[15px] leading-relaxed text-fg-sub">
            내 쓰레드 계정을 연동하면 공식 API 기준으로 스레드 팔로워 분석과 확인이 가능합니다. 팔로워 수와
            증감 추이 같은 스레드 통계를 인스타그램·틱톡 지표와 같은 화면에서 나란히 비교할 수 있어, 채널별로
            앱을 오갈 필요가 없습니다.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-8 text-center text-[13px] font-semibold text-fg-faint">다른 채널도 함께 분석하기</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <ButtonLink href="/instagram" variant="ghost" size="sm">
              인스타그램 분석 자세히 보기
            </ButtonLink>
            <ButtonLink href="/tiktok" variant="ghost" size="sm">
              틱톡 분석 자세히 보기
            </ButtonLink>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
          <Reveal>
            <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
              <MessageCircleQuestion className="size-7 text-primary" aria-hidden />
              쓰레드 분석, 무엇이 궁금하신가요?
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-10">
              <FaqAccordion items={FAQ_ITEMS} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* 최종 CTA */}
      <section className="mx-auto max-w-6xl px-4 py-24 text-center md:px-6">
        <Reveal>
          <h2 className="text-3xl font-bold md:text-4xl">지금 바로 쓰레드 분석을 시작하세요</h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
            1분이면 쓰레드 계정을 연동하고 첫 분석을 받아볼 수 있습니다.
          </p>
          <ButtonLink href="/signup" size="lg" className="mt-8">
            무료로 쓰레드 분석 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </Reveal>
      </section>
    </>
  );
}
