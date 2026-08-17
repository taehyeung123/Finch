import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bookmark, Check, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { AppIconTile } from "@/components/icons/brand";

export const metadata: Metadata = {
  title: "SNS 레퍼런스 수집 — 잘되는 콘텐츠 모으고 바로 만들기 (인스타·틱톡·스레드)",
  description:
    "SNS 레퍼런스 수집은 인스타그램·틱톡·스레드에서 잘되는 콘텐츠를 키워드·계정·해시태그로 모으고, AI가 한국어 요약과 후킹 기법 태그를 붙여주는 기능입니다. 모은 레퍼런스는 클릭 한 번으로 AI 카드뉴스 초안까지 이어집니다. 벤치마킹부터 제작까지, 핀치에서 시작하세요.",
  keywords: [
    "SNS 레퍼런스 수집",
    "인스타 레퍼런스",
    "릴스 레퍼런스",
    "벤치마킹 계정 분석",
    "콘텐츠 레퍼런스 정리",
    "후킹 문구 모음",
    "카드뉴스 레퍼런스",
    "SNS 벤치마킹 툴",
    "릴스 요약",
    "콘텐츠 아이디어 수집",
  ],
  alternates: { canonical: "/reference" },
};

/* GEO 인용 대비 자기완결형 질문·답변 (PART 13.3) */
const HOW_SECTIONS: { q: string; body: string[]; points: string[] }[] = [
  {
    q: "SNS 레퍼런스 수집, 어떻게 하나요?",
    body: [
      "SNS 레퍼런스 수집은 참고하고 싶은 키워드·계정·해시태그를 등록해두면, 인스타그램·틱톡·스레드 세 채널에서 잘되는 공개 콘텐츠를 한 번에 모아주는 기능입니다. 채널마다 앱을 오가며 검색하고 스크린샷을 찍어 정리하던 손품을 버튼 한 번으로 줄입니다.",
      "모은 콘텐츠에는 AI가 한국어 요약과 후킹 기법 태그, 카테고리 분류를 자동으로 붙입니다. 흩어진 링크 모음이 아니라, 바로 훑어볼 수 있게 정리된 레퍼런스 수집함이 만들어집니다.",
    ],
    points: ["키워드·계정·해시태그 등록", "버튼 한 번에 3채널 수집", "AI가 요약·태그·분류 자동 정리"],
  },
  {
    q: "모은 영상을 다 봐야 하나요?",
    body: [
      "아니요. 콘텐츠마다 AI가 붙인 한국어 요약을 먼저 읽으면, 영상을 재생하지 않고도 무슨 내용인지, 어떤 방식으로 시선을 끄는지 파악할 수 있습니다. 수십 개 콘텐츠를 몇 분 안에 훑고, 자세히 볼 것만 골라서 원본을 확인하면 됩니다.",
      "외국어 콘텐츠도 한국어 요약으로 정리되기 때문에, 해외 계정을 벤치마킹할 때도 언어 장벽 없이 훑어볼 수 있습니다.",
    ],
    points: ["재생 없이 한국어 요약으로 훑기", "수십 개 콘텐츠를 몇 분에 파악", "자세히 볼 것만 골라 원본 확인"],
  },
  {
    q: "모은 다음엔 뭘 하나요?",
    body: [
      "여기가 핀치의 다른 점입니다. 대부분의 레퍼런스 수집 도구는 모으는 데서 끝나지만, 핀치는 수집과 제작이 한 흐름입니다. 레퍼런스에 붙은 후킹 기법 태그를 클릭하면, 그 후킹 구조를 반영한 AI 스튜디오 카드뉴스 초안까지 바로 이어집니다.",
      "잘되는 콘텐츠를 보고 '이런 식으로 만들어야지' 하고 메모만 남기는 게 아니라, 그 자리에서 내 콘텐츠 초안으로 옮기는 것까지가 레퍼런스 수집의 목적이라고 생각합니다.",
    ],
    points: ["후킹 태그 클릭 한 번으로 제작 연결", "AI 스튜디오 카드뉴스 초안 생성", "수집에서 제작까지 한 흐름"],
  },
];

/* 후킹 기법 태그 8종 — lib/types.ts HookType과 어휘를 공유 (핀치 자체 분류 기준) */
const HOOK_TAGS: { tag: string; desc: string }[] = [
  { tag: "숫자리스트", desc: "'~하는 5가지'처럼 숫자로 목록을 예고해 끝까지 보게 만드는 구성입니다." },
  { tag: "손실회피", desc: "'모르면 손해'처럼 놓쳤을 때의 손실을 강조해 주의를 끄는 방식입니다." },
  { tag: "통념깨기", desc: "'사실 그 상식은 틀렸습니다'처럼 통념을 뒤집는 주장으로 시선을 붙잡습니다." },
  { tag: "질문호명", desc: "'이런 분 계시죠?'처럼 질문으로 시청자를 직접 불러 세우는 도입입니다." },
  { tag: "결과수치", desc: "'한 달 만에 팔로워 1만'처럼 구체적인 성과 숫자를 앞세우는 방식입니다." },
  { tag: "시의성", desc: "시즌·이슈·트렌드에 얹어 '지금 봐야 할 이유'를 만드는 방식입니다." },
  { tag: "공감자극", desc: "'다들 이런 적 있으시죠'처럼 공통 경험을 건드려 반응을 끌어냅니다." },
  { tag: "호기심", desc: "결말이나 핵심을 감춰 끝까지 봐야 알 수 있게 만드는 구성입니다." },
];

/* 정직 고지 — 데이터 출처와 한계를 숨기지 않는다 (핀치 브랜드 원칙) */
const HONEST_NOTES = [
  {
    title: "공개 콘텐츠만 수집합니다",
    desc: "수집 대상은 각 채널에 공개된 콘텐츠입니다. 비공개 계정이나 로그인해야만 보이는 데이터는 수집하지 않으며, 모든 레퍼런스에는 원본 링크가 함께 붙습니다.",
  },
  {
    title: "채널별 제공 범위가 다릅니다",
    desc: "인스타그램·틱톡·스레드는 외부에 제공하는 데이터 범위가 서로 다릅니다. 채널에 따라 일부 지표(조회수·공유수 등)가 비어 있을 수 있고, 핀치는 없는 값을 추정으로 채워 넣지 않습니다.",
  },
  {
    title: "AI 요약·태그는 자체 분석입니다",
    desc: "한국어 요약, 후킹 기법 태그, 카테고리 분류는 핀치의 AI가 만든 자체 분석 결과이지 플랫폼 공식 데이터가 아닙니다. 중요한 판단 전에는 원본 콘텐츠를 함께 확인하시길 권합니다.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "레퍼런스 수집은 무료로 쓸 수 있나요?",
    a: "네, Free 플랜에서 먼저 체험할 수 있습니다. 다만 등록할 수 있는 키워드·계정 수와 월 수집 한도는 플랜별로 다릅니다. 요금제 페이지에서 플랜별 한도를 확인할 수 있고, 본격적으로 쓰신다면 Creator 이상 플랜을 권합니다.",
  },
  {
    q: "어떤 채널을 지원하나요?",
    a: "인스타그램·틱톡·스레드 3채널을 지원합니다. 유튜브와 X(트위터)는 지원하지 않습니다. 핀치는 지원 채널을 늘려 얕게 다루기보다, 숏폼·SNS 마케팅의 중심인 이 3채널을 깊게 다루는 데 집중합니다.",
  },
  {
    q: "수집한 콘텐츠를 그대로 써도 되나요?",
    a: "안 됩니다. 수집한 콘텐츠의 저작권은 원작자에게 있으며, 영상·이미지·문구를 그대로 복제해 쓰면 저작권 침해가 될 수 있습니다. 레퍼런스는 어떤 구조와 후킹으로 시선을 끌었는지 참고하는 용도입니다. 핀치는 '베끼지 않고 구조만 참고한다'는 원칙으로, AI 제작 연결도 원본 복제가 아니라 후킹 구조를 반영한 새 초안을 만드는 방식입니다.",
  },
  {
    q: "레퍼런스로 바로 콘텐츠를 만들 수 있나요?",
    a: "네, 이게 핀치 레퍼런스 수집의 가장 큰 차이점입니다. 레퍼런스에 붙은 후킹 기법 태그를 클릭하면 그 후킹 구조를 반영한 AI 스튜디오 카드뉴스 초안이 만들어집니다. 수집함에 모아두고 잊는 게 아니라, 본 것을 그 자리에서 내 콘텐츠로 옮기는 흐름입니다.",
  },
  {
    q: "데이터는 어디서 오나요?",
    a: "각 채널에 공개된 콘텐츠를 기반으로 하며, 채널별로 외부에 제공되는 데이터 범위가 달라 일부 지표는 비어 있을 수 있습니다. 핀치는 없는 값을 추정으로 채우지 않고, 데이터 출처와 갱신 시점을 화면에 표기합니다. 한국어 요약과 후킹 기법 태그는 핀치 AI의 자체 분석 결과이지 플랫폼 공식 데이터가 아닙니다.",
  },
];

/* GEO: Service + BreadcrumbList + FAQPage 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      name: "SNS 레퍼런스 수집",
      serviceType: "SNS 콘텐츠 레퍼런스 수집·벤치마킹 도구",
      provider: { "@type": "Organization", name: "핀치 (Finch)", url: "https://finch.ai.kr" },
      areaServed: "KR",
      url: "https://finch.ai.kr/reference",
      description:
        "SNS 레퍼런스 수집은 키워드·계정·해시태그를 등록해 인스타그램·틱톡·스레드의 잘되는 공개 콘텐츠를 모으고, AI가 한국어 요약과 후킹 기법 태그를 붙여주는 기능입니다. 모은 레퍼런스는 클릭 한 번으로 AI 카드뉴스 초안 제작까지 이어집니다.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.ai.kr/" },
        { "@type": "ListItem", position: 2, name: "레퍼런스 수집", item: "https://finch.ai.kr/reference" },
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

export default function ReferencePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 브레드크럼 */}
      <nav aria-label="브레드크럼" className="mx-auto max-w-3xl px-4 pt-8 text-[13px] text-fg-sub md:px-6">
        <Link href="/" className="hover:text-fg-sub">
          홈
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg-sub">레퍼런스 수집</span>
      </nav>

      {/* 히어로 */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:px-6">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-primary-ink">
          <Bookmark className="size-4" aria-hidden />
          3채널 레퍼런스 수집함
        </div>
        <h1 className="mt-3 text-3xl font-bold leading-[1.25] tracking-tight md:text-4xl">
          SNS 레퍼런스 수집, 모으고 바로 만드세요
        </h1>
        {/* GEO: 자기완결적 정의 문단 */}
        <p className="mt-5 text-[17px] leading-relaxed text-fg-sub">
          SNS 레퍼런스 수집은 키워드·계정·해시태그를 등록해 인스타그램·틱톡·스레드에서 잘되는 콘텐츠를
          한 번에 모으는 기능입니다. AI가 한국어 요약과 후킹 기법 태그를 붙여주기 때문에 영상을 다 보지
          않아도 훑을 수 있고, 마음에 드는 후킹은 클릭 한 번으로 AI 카드뉴스 초안까지 이어집니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href="/signup" size="lg">
            무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/pricing" variant="secondary" size="lg">
            플랜별 수집 한도 보기
          </ButtonLink>
        </div>
        <p className="mt-4 text-[13px] text-fg-sub">인스타그램 · 틱톡 · 스레드 3채널 · 공개 콘텐츠 기반</p>
      </section>

      {/* 질문형 섹션 */}
      {HOW_SECTIONS.map((section, i) => (
        <section key={section.q} className={i % 2 === 1 ? "border-y border-line bg-plate" : "border-t border-line"}>
          <div className="mx-auto max-w-3xl px-4 py-14 md:px-6">
            <Reveal>
              <h2 className="text-2xl font-bold md:text-3xl">{section.q}</h2>
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-fg-sub">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
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

      {/* 후킹 기법 태그 8종 — 핀치 자체 분류 기준 */}
      <section className="border-y border-line bg-plate">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
          <Reveal>
            <h2 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              후킹 기법 태그, 어떻게 나뉘나요?
              <InfoTip>
                후킹 기법 태그는 핀치의 AI가 콘텐츠의 도입부·캡션 구조를 분석해 부여하는 자체 추정치입니다.
                인스타그램·틱톡·스레드가 제공하는 공식 데이터가 아니며, 원작자의 실제 의도와 다를 수 있습니다.
              </InfoTip>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              핀치는 잘되는 콘텐츠가 시선을 끄는 방식을 8가지 후킹 기법으로 나눠 태그를 붙입니다. 이 분류는
              핀치가 자체적으로 정의한 분석 기준이며, 플랫폼이 제공하는 공식 데이터가 아닙니다. 태그를 누르면
              같은 후킹을 쓴 레퍼런스만 모아 볼 수 있고, 그 구조로 카드뉴스 초안을 만들 수도 있습니다.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {HOOK_TAGS.map((item) => (
                <li key={item.tag} className="rounded-card border border-line bg-body p-4">
                  <span className="inline-flex rounded-chip border border-line bg-overlay px-3 py-1 text-[13px] font-semibold">
                    {item.tag}
                  </span>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-fg-sub">{item.desc}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 정직 고지 */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
          <Reveal>
            <h2 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <ShieldCheck className="size-6 text-primary-ink" aria-hidden />
              데이터에 대해 솔직하게 말씀드립니다
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              레퍼런스 수집은 좋은 도구지만, 만능은 아닙니다. 어디까지 되고 어디부터 안 되는지 숨기지 않는
              것이 핀치의 원칙입니다.
            </p>
            <ul className="mt-6 space-y-4">
              {HONEST_NOTES.map((note) => (
                <li key={note.title} className="flex items-start gap-3 rounded-card border border-line bg-body p-4">
                  <Check className="mt-0.5 size-4.5 shrink-0 text-positive" aria-hidden />
                  <div>
                    <p className="text-[15px] font-semibold">{note.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-fg-sub">{note.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 수집→제작 포지셔닝 콜아웃 */}
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <Reveal>
          <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[17px] font-bold">모으기만 하는 도구와 다릅니다</h3>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-fg-sub">
                수집함에 쌓아두고 잊는 레퍼런스는 자산이 아닙니다. 핀치는 후킹 태그에서 AI 카드뉴스 초안까지
                한 흐름으로 이어져, 본 것을 그날 내 콘텐츠로 옮길 수 있습니다.
              </p>
            </div>
            <ButtonLink href="/pricing" variant="secondary" className="shrink-0">
              요금제 보기 <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Card>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="border-y border-line bg-plate">
        <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
          <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
            <MessageCircleQuestion className="size-7 text-primary-ink" aria-hidden />
            레퍼런스 수집, 더 궁금한 점이 있으신가요?
          </h2>
          <div className="mt-10">
            <FaqAccordion items={FAQ_ITEMS} />
          </div>
        </div>
      </section>

      {/* 최종 CTA */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
        <div className="flex justify-center gap-3">
          <AppIconTile app="instagram" size={48} />
          <AppIconTile app="tiktok" size={48} />
          <AppIconTile app="threads" size={48} />
        </div>
        <h2 className="mt-5 text-3xl font-bold md:text-4xl">모으는 손품은 줄이고, 만드는 시간은 늘리고</h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
          키워드 하나만 등록해두면, 잘되는 콘텐츠가 요약과 후킹 태그를 달고 수집함에 쌓입니다.
        </p>
        <ButtonLink href="/signup" size="lg" className="mt-8">
          무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </section>
    </>
  );
}
