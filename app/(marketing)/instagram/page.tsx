import type { Metadata } from "next";
import { ArrowRight, Check, MessageCircleQuestion } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SupportBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { AppIconTile } from "@/components/icons/brand";

export const metadata: Metadata = {
  title: "인스타그램 분석 — 핀치로 팔로워·참여율·인기게시물·경쟁사까지 무료로 확인",
  description:
    "핀치는 인스타그램 공식 API 기반의 인스타 분석 도구입니다. 팔로워 추이·연령대 통계, 참여율·도달·노출수, 인기 게시물과 릴스 성과, 해시태그, 경쟁사 계정 비교까지 인스타그램 인사이트를 무료로 확인하세요.",
  alternates: { canonical: "/instagram" },
};

/* 질문형 H2 섹션 — GEO 인용 대비 자기완결적 문단 구성 (PART 13.3) */
const INSIGHT_SECTIONS: {
  q: string;
  body: string[];
  points: string[];
  badgeNote?: string;
}[] = [
  {
    q: "인스타그램 인사이트, 어디까지 볼 수 있나요?",
    body: [
      "인스타그램 공식 API가 제공하는 인사이트 지표를 그대로 가져와, 앱을 직접 열지 않아도 채널 상태를 한눈에 확인할 수 있는 인스타 분석 사이트입니다.",
      "참여율은 좋아요·댓글·저장·공유를 종합해 계산하고, 도달과 노출수는 기간별 추이 그래프로 함께 보여줍니다.",
    ],
    points: ["게시물별·기간별 참여율 확인", "도달·노출수 추이 그래프", "팔로워 증감 추이와 알림"],
  },
  {
    q: "인스타그램 팔로워, 얼마나 자세히 분석하나요?",
    body: [
      "팔로워 수만 보여주고 끝나지 않습니다. 일간·주간·월간 단위로 증감 추이를 쌓아 흐름을 파악할 수 있는 인스타 팔로워 분석 기능을 제공합니다.",
      "인스타그램 공식 API가 지원하는 범위 안에서 팔로워 연령대·성별 통계도 함께 확인할 수 있어요.",
    ],
    points: [
      "일간·주간·월간 팔로워 증감 추이",
      "연령대·성별 팔로워 통계(공식 API 제공 범위)",
      "팔로워 급증·급감 알림",
    ],
  },
  {
    q: "인기 게시물·릴스는 어떻게 분석하나요?",
    body: [
      "피드, 릴스, 스토리를 유형별로 나눠 어떤 콘텐츠가 성과를 내는지 랭킹으로 보여주는 인스타 인기게시물 분석 기능입니다.",
      "해시태그별 도달 데이터를 함께 확인하면 다음 콘텐츠 기획에도 바로 활용할 수 있습니다.",
    ],
    points: ["피드·릴스·스토리 유형별 성과 비교", "인기 게시물 자동 랭킹", "해시태그별 도달 확인"],
  },
  {
    q: "경쟁사 인스타그램 계정과 비교할 수 있나요?",
    body: [
      "관심 있는 경쟁사 계정을 등록하면 팔로워, 게시물 추이, 참여율을 내 계정과 나란히 비교하는 인스타 경쟁사 분석·벤치마킹 기능을 사용할 수 있습니다.",
      "다만 타 계정 분석은 인스타그램이 공식 제공하는 Business Discovery API의 기초 지표 범위 안에서만 가능합니다. 핀치는 이 한계를 숨기지 않고 화면에 그대로 표시합니다.",
    ],
    points: ["경쟁사 계정 등록·비교", "팔로워·게시물 추이 나란히 보기", "공식 API 제공 범위 내 벤치마킹 리포트"],
    badgeNote: "타 계정(경쟁사) 분석 — 공식 Business Discovery 기초 지표",
  },
  {
    q: "인스타그램 계정 진단·인플루언서 검색도 가능한가요?",
    body: [
      "카테고리별로 지금 주목할 만한 계정을 찾는 인스타 인플루언서 검색 기능과, 내 계정 활동을 종합해 강점과 약점을 짚어주는 계정 진단 리포트도 함께 제공합니다.",
    ],
    points: ["카테고리별 인플루언서·계정 검색", "계정 진단 리포트로 강점·약점 확인", "관심 계정 저장 후 트렌드 추적"],
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "무료 인스타그램 분석 사이트가 있나요?",
    a: "네, 핀치 Free 플랜으로 인스타그램 1채널을 연동해 참여율, 도달·노출수, 인기 게시물 등 핵심 인사이트를 무료로 확인할 수 있습니다. 신용카드 등록 없이 바로 시작할 수 있어요.",
  },
  {
    q: "인스타 팔로워 분석은 어떻게 하나요?",
    a: "계정을 연동하면 일간·주간·월간 팔로워 증감 추이와 공식 API가 제공하는 연령대·성별 통계를 대시보드에서 바로 확인할 수 있습니다.",
  },
  {
    q: "인스타그램 분석 AI도 지원하나요?",
    a: "네. 대화형 AI 에이전트에게 궁금한 지표를 질문하면 관련 데이터 화면으로 바로 연결해주는 인스타 AI 분석 기능을 제공합니다.",
  },
  {
    q: "개인 계정도 분석할 수 있나요?",
    a: "인스타그램 공식 API 특성상 비즈니스 또는 크리에이터 계정만 연동할 수 있습니다. 개인 계정이라면 온보딩 과정에서 전환 방법을 단계별로 안내해드립니다.",
  },
  {
    q: "인스타그램 경쟁사 광고도 함께 확인할 수 있나요?",
    a: "네. 오가닉 성과 분석과 별도로, Meta 광고 라이브러리 공식 API를 기반으로 경쟁사가 집행 중인 광고를 자동으로 감지해 알려드리는 기능도 제공합니다.",
  },
];

/* GEO: Service + BreadcrumbList + FAQPage 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      name: "인스타그램 분석",
      serviceType: "인스타그램 분석 도구",
      provider: { "@type": "Organization", name: "핀치 (Finch)", url: "https://finch.kr" },
      areaServed: "KR",
      url: "https://finch.kr/instagram",
      description:
        "핀치의 인스타그램 분석은 공식 Graph API를 기반으로 팔로워 추이, 참여율, 도달·노출수, 인기 게시물과 릴스 성과, 경쟁사 계정 비교까지 하나의 대시보드에서 확인하는 인스타그램 분석 도구입니다.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.kr/" },
        { "@type": "ListItem", position: 2, name: "인스타그램 분석", item: "https://finch.kr/instagram" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function InstagramAnalysisPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 히어로 */}
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 text-center md:px-6 md:pt-24">
        <div className="flex justify-center">
          <AppIconTile app="instagram" size={56} />
        </div>
        <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
          인스타그램 분석, <span className="text-primary">핀치</span> 하나로 끝냅니다
        </h1>
        {/* GEO: 자기완결적 정의 문장 (PART 13.3) */}
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-fg-sub">
          핀치의 인스타그램 분석은 공식 Graph API를 기반으로 팔로워 추이, 참여율, 도달·노출수, 인기 게시물과 릴스
          성과, 경쟁사 계정 비교까지 하나의 대시보드에서 확인하는 인스타그램 분석 도구입니다.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-sub">
          회원가입 후 계정을 연동하면 무료 플랜으로도 핵심 인사이트를 바로 확인할 수 있는 인스타 무료 분석
          서비스이며, 대화형 AI 에이전트에게 질문만 하면 원하는 지표를 바로 찾아주는 인스타 AI 분석 기능도 함께
          제공합니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/signup" size="lg">
            무료로 시작하기
          </ButtonLink>
          <ButtonLink href="#faq" variant="secondary" size="lg">
            자주 묻는 질문 보기
          </ButtonLink>
        </div>
        <p className="mt-4 text-[13px] text-fg-faint">신용카드 없이 시작 · 1분 만에 연동</p>
      </section>

      {/* 질문형 섹션 — 인사이트 · 팔로워 · 인기게시물/릴스 · 경쟁사 · 계정진단/인플루언서 */}
      {INSIGHT_SECTIONS.map((section, i) => (
        <section key={section.q} className={i % 2 === 1 ? "border-t border-line bg-body/40" : undefined}>
          <div className="mx-auto max-w-4xl px-4 py-14 md:px-6">
            <Reveal>
              <h2 className="text-2xl font-bold md:text-3xl">{section.q}</h2>
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-fg-sub">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.badgeNote ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <SupportBadge level="partial" />
                  <span className="text-[13px] text-fg-faint">{section.badgeNote}</span>
                </div>
              ) : null}
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-3">
                {section.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 rounded-card border border-line bg-body px-3.5 py-3 text-[14px] text-fg-sub"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>
      ))}

      {/* 콜아웃 — 자동 DM · 방문자 확인 페이지 연결 */}
      <section className="mx-auto max-w-4xl space-y-4 px-4 pb-14 md:px-6">
        <Reveal>
          <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[17px] font-bold">댓글에 자동으로 DM을 보내고 싶으신가요?</h3>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-fg-sub">
                게시물에 키워드 댓글이 달리면 인스타그램 공식 API로 자동 DM을 보내는 방법을 정리했습니다.
              </p>
            </div>
            <ButtonLink href="/instagram/auto-dm" variant="secondary" className="shrink-0">
              자동 DM 알아보기 <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Card>
        </Reveal>
        <Reveal>
          <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[17px] font-bold">인스타그램 방문자(누가 봤는지)가 궁금하신가요?</h3>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-fg-sub">
                프로필 방문자 확인이 실제로 가능한 범위인지, 어떤 방식으로 확인해야 하는지 정리했습니다.
              </p>
            </div>
            <ButtonLink href="/instagram/visitor-check" variant="secondary" className="shrink-0">
              자세히 알아보기 <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Card>
        </Reveal>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 md:px-6">
          <Reveal>
            <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
              <MessageCircleQuestion className="size-7 text-primary" aria-hidden />
              자주 묻는 질문
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
          <h2 className="text-3xl font-bold md:text-4xl">무료로 인스타그램 분석 시작하기</h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
            1분이면 계정을 연동하고 팔로워·참여율·경쟁사 비교까지 첫 리포트를 받아볼 수 있습니다.
          </p>
          <ButtonLink href="/signup" size="lg" className="mt-8">
            무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </Reveal>
      </section>
    </>
  );
}
