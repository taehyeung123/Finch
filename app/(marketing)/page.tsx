import type { Metadata } from "next";
import {
  ArrowRight,
  BellRing,
  Check,
  Compass,
  LayoutDashboard,
  Megaphone,
  MessageCircleQuestion,
  Sparkles,
  Users,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, ChannelBadge, SupportBadge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/charts";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { HeroVisual } from "@/components/landing/hero-visual";
import { AppIconTile, type BrandApp } from "@/components/icons/brand";
import { SUPPORT_MATRIX } from "@/lib/channels";

export const metadata: Metadata = {
  title: "핀치 (Finch) — 인스타그램·틱톡·쓰레드 SNS 통합 분석 & 메타광고 관리",
  description:
    "핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 보는 SNS 통합 분석 사이트입니다. 경쟁사 광고 모니터링, 트렌드 탐색, AI 콘텐츠 제작까지 크리에이터를 위한 소셜미디어 분석 도구를 하나의 대시보드에서 제공합니다.",
  alternates: { canonical: "/" },
};

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "어떤 채널을 지원하나요?",
    a: "인스타그램, 틱톡, 쓰레드 3개 채널과 메타 광고 계정을 지원합니다. 채널마다 공식 API가 제공하는 데이터 범위가 달라, 핀치는 기능별 지원 범위를 화면에 투명하게 표시합니다.",
  },
  {
    q: "개인 인스타그램 계정도 연동할 수 있나요?",
    a: "인스타그램은 비즈니스 또는 크리에이터 계정만 공식 API 연동이 가능합니다. 개인 계정이라면 온보딩 과정에서 전환 방법을 단계별로 안내해드립니다.",
  },
  {
    q: "경쟁사 광고 모니터링은 어떻게 동작하나요?",
    a: "Meta가 투명성 목적으로 공개 운영하는 광고 라이브러리(Ad Library) 공식 API를 사용합니다. 등록한 경쟁사 페이지를 주기적으로 확인해 새 광고가 감지되면 알림을 보내드립니다.",
  },
  {
    q: "트렌드·타 계정 데이터는 어디서 오나요?",
    a: "내 계정 데이터는 각 플랫폼 공식 API에서, 카테고리 트렌드와 타 계정 정밀 분석은 제휴 데이터 공급사에서 가져옵니다. 데이터 출처와 갱신 시점을 항상 함께 표기합니다.",
  },
  {
    q: "AI가 만든 콘텐츠는 어떻게 표시되나요?",
    a: "각 플랫폼의 AI 생성물 표시 정책에 맞춰, 카드뉴스와 숏폼 영상 생성물에 AI 생성 표시를 자동으로 부착합니다.",
  },
  {
    q: "무료로 사용할 수 있나요?",
    a: "네. Free 플랜으로 채널 1개 연동, 월 10회 콘텐츠 분석, 카드뉴스 월 3회 생성을 체험할 수 있습니다. 신용카드 없이 시작할 수 있어요.",
  },
  {
    q: "무료 인스타그램 분석 사이트가 있나요?",
    a: "네, 핀치 Free 플랜에서 인스타그램 1채널 연동과 월 10회 콘텐츠 분석을 무료로 체험할 수 있습니다.",
  },
  {
    q: "인스타그램 팔로워 나이대 분석도 되나요?",
    a: "인스타그램 공식 API가 제공하는 팔로워 연령대·성별 통계를 대시보드에서 확인할 수 있습니다.",
  },
];

/* GEO: WebSite + FAQPage + SoftwareApplication + Organization 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      /* 구글 검색결과의 "사이트 이름" 표시는 홈페이지 WebSite 스키마의 name/alternateName을 참조한다 */
      "@type": "WebSite",
      name: "핀치",
      alternateName: ["핀치 (Finch)", "Finch"],
      url: "https://finch.ai.kr",
    },
    {
      "@type": "Organization",
      name: "핀치 (Finch)",
      alternateName: ["핀치", "Finch"],
      url: "https://finch.ai.kr",
      logo: "https://finch.ai.kr/brand/finch-mark-coral.svg",
      description: "인스타그램·틱톡·쓰레드 통합 분석 & 메타광고 관리 플랫폼",
      // TODO: 공식 SNS 계정 개설 후 sameAs 배열 추가
    },
    {
      "@type": "SoftwareApplication",
      name: "핀치 (Finch)",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
      description:
        "핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 분석하고 메타광고 집행까지 관리하는 SNS 마케팅 도구입니다.",
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

const PAIN_POINTS = [
  {
    icon: LayoutDashboard,
    persona: "크리에이터·브랜드 운영자",
    pain: "앱을 오가며 채널 성과를 따로 확인하고, 콘텐츠 기획은 감에 의존하고 있어요.",
    solution: "3채널 통합 대시보드와 데이터 기반 트렌드 탐색으로 해결합니다.",
  },
  {
    icon: Megaphone,
    persona: "메타광고 광고주",
    pain: "광고 성과와 오가닉 성과를 따로 봐야 하고, 경쟁사가 어떤 소재를 쓰는지 알기 어려워요.",
    solution: "광고+오가닉 통합 뷰와 경쟁사 광고 자동 모니터링으로 해결합니다.",
  },
  {
    icon: Users,
    persona: "콘텐츠 마케터·대행사",
    pain: "클라이언트 보고서를 수작업으로 취합하고, 아이디어 발굴에 시간이 너무 들어요.",
    solution: "자동 리포트와 AI 콘텐츠 아이디어·카드뉴스 생성으로 해결합니다.",
  },
];

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "3채널 통합 대시보드",
    description:
      "인스타그램·틱톡·쓰레드의 팔로워, 조회수, 참여율을 한 화면에서. 광고 계정을 연동하면 광고 성과까지 나란히 볼 수 있습니다.",
    points: ["채널별·전체 요약 지표", "최근 게시물 성과 추이", "콘텐츠 유형 비중 분석"],
  },
  {
    icon: BellRing,
    title: "경쟁사 광고 자동 모니터링",
    description:
      "Meta 광고 라이브러리 공식 API 기반. 등록해둔 경쟁사가 새 광고를 시작하면 자동으로 감지해 알려드립니다. 오래 운영되는 광고는 성과 신호로 읽을 수 있어요.",
    points: ["신규 광고 감지 알림", "게재 기간·노출 플랫폼 확인", "소재 아카이브"],
  },
  {
    icon: Compass,
    title: "카테고리 트렌드 탐색",
    description:
      "뷰티, 푸드, 패션 등 분야별로 지금 뜨는 콘텐츠를 발견하세요. 팔로워 대비 조회수 비율로 '진짜 터진' 콘텐츠를 가려냅니다.",
    points: ["실시간·카테고리별 탐색", "팔로워 대비 도달 스코어", "관심 계정 저장"],
  },
  {
    icon: Sparkles,
    title: "AI 콘텐츠 스튜디오",
    description:
      "주제만 입력하면 카드뉴스 카피와 슬라이드가 완성됩니다. 트렌드 데이터를 근거로 콘텐츠 아이디어도 추천해드려요.",
    points: ["카드뉴스 자동 생성", "데이터 기반 아이디어 추천", "AI 생성 표시 자동 부착"],
  },
];

/* 지그재그 기능별 미니 목업 패널 — FEATURES 배열과 같은 순서 */

const panelBase =
  "rounded-card border border-line bg-body p-5 transition-colors hover:border-line-strong md:p-6";

function DashboardPanel() {
  return (
    <div className={panelBase} aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <ChannelBadge channel="instagram" />
          <ChannelBadge channel="tiktok" />
          <ChannelBadge channel="threads" />
        </div>
        <AppIconTile app="instagram" size={28} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          { label: "참여율", value: "4.8%", delta: "+0.6%p" },
          { label: "주간 도달", value: "42.1만", delta: "+8.9%" },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-3.5">
            <p className="text-xs text-fg-sub">{s.label}</p>
            <p className="tnum mt-1 text-lg font-bold">{s.value}</p>
            <p className="tnum mt-0.5 text-xs font-semibold text-positive">{s.delta}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-card border border-line bg-surface p-3.5">
        <p className="text-xs text-fg-sub">최근 30일 조회수</p>
        <Sparkline data={[18, 26, 24, 39, 33, 52, 47, 68, 74, 88]} width={320} height={44} className="mt-1.5 w-full" />
      </div>
    </div>
  );
}

function AdMonitorPanel() {
  return (
    <div className={panelBase} aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-fg-sub">경쟁사 광고 라이브러리</p>
        <AppIconTile app="meta" size={28} />
      </div>
      <div className="mt-4">
        {/* 뒤 카드 — 오래 운영 중인 소재 */}
        <div className="ml-8 rounded-card border border-line bg-overlay p-4 opacity-60">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-fg-sub">신제품 런칭 티저 영상</p>
            <Badge className="tnum shrink-0">21일째 운영 중</Badge>
          </div>
        </div>
        {/* 앞 카드 — 방금 감지된 신규 광고 */}
        <div className="-mt-3 mr-8 rounded-card border border-line-strong bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="anim-pulse rounded-chip bg-primary-weak px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              NEW 광고 감지
            </span>
            <Badge className="tnum shrink-0">오늘 시작</Badge>
          </div>
          <p className="mt-3 text-[14px] font-semibold">여름 세일 컬렉션 A/B 소재</p>
          <p className="mt-1 text-[13px] text-fg-sub">Instagram 피드 · 릴스 게재</p>
        </div>
      </div>
    </div>
  );
}

const TREND_ROWS = [
  { rank: 1, title: "수분크림 7일 챌린지", meta: "@glow.diary · 릴스", score: "도달 x12.4" },
  { rank: 2, title: "여름 쿨톤 메이크업 정리", meta: "@makeup.log · 릴스", score: "도달 x8.1" },
  { rank: 3, title: "선크림 성분 비교 리뷰", meta: "@skin.lab · 카루셀", score: "도달 x5.7" },
];

function TrendPanel() {
  return (
    <div className={panelBase} aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-fg-sub">뷰티 · 실시간 급상승</p>
        <div className="flex gap-1.5">
          <AppIconTile app="instagram" size={28} />
          <AppIconTile app="tiktok" size={28} />
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {TREND_ROWS.map((row) => (
          <li
            key={row.rank}
            className="flex items-center gap-3 rounded-card border border-transparent px-3 py-2.5 transition-colors hover:border-line hover:bg-overlay"
          >
            <span className={`tnum w-4 text-center text-[15px] font-bold ${row.rank === 1 ? "text-primary" : "text-fg-faint"}`}>
              {row.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{row.title}</p>
              <p className="truncate text-xs text-fg-faint">{row.meta}</p>
            </div>
            <Badge tone="positive" className="tnum shrink-0">
              {row.score}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiStudioPanel() {
  return (
    <div className={panelBase} aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-sub">
          <Sparkles className="size-4 text-primary" aria-hidden />
          카드뉴스 초안 6장
        </p>
        <AppIconTile app="instagram" size={28} />
      </div>
      {/* 슬라이드 3장 스택 */}
      <div className="relative mt-5 flex justify-center pb-3">
        <div className="absolute top-3 h-full w-40 -translate-x-14 -rotate-6 rounded-card border border-line bg-overlay opacity-50" />
        <div className="absolute top-1.5 h-full w-40 translate-x-14 rotate-3 rounded-card border border-line bg-overlay opacity-75" />
        <div className="relative w-44 rounded-card border border-line-strong bg-surface p-4">
          <p className="tnum text-[11px] font-semibold text-primary">1 / 6</p>
          <p className="mt-1.5 text-[14px] font-bold leading-snug">
            여름 수분 루틴,
            <br />
            순서가 전부예요
          </p>
          <div className="mt-3 h-1.5 w-10 rounded-chip bg-primary" />
          <p className="mt-3 text-[11px] text-fg-faint">AI 생성 표시 자동 부착</p>
        </div>
      </div>
    </div>
  );
}

const FEATURE_PANELS = [DashboardPanel, AdMonitorPanel, TrendPanel, AiStudioPanel];

/* 채널 로고 마퀴 아이템 — 트랙이 항상 컨테이너보다 넓도록 그룹 안에서 3회 반복 */
const MARQUEE_ITEMS: { app: BrandApp; label: string }[] = [
  { app: "instagram", label: "Instagram" },
  { app: "tiktok", label: "TikTok" },
  { app: "threads", label: "Threads" },
  { app: "meta", label: "Meta 광고" },
];

function MarqueeGroup() {
  return (
    <div className="flex shrink-0 items-center">
      {Array.from({ length: 3 }).flatMap((_, r) =>
        MARQUEE_ITEMS.map((item) => (
          <span
            key={`${item.app}-${r}`}
            className="mx-7 inline-flex items-center gap-3 text-lg font-bold text-fg-sub"
          >
            <AppIconTile app={item.app} size={40} />
            {item.label}
          </span>
        )),
      )}
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* Hero (PART 6.1-2) — 좌측 텍스트 스태거 진입 + 우측 플로팅 비주얼 */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 overflow-x-clip px-4 pb-20 pt-16 md:grid-cols-2 md:px-6 md:pt-24">
        <div>
          {/* GEO: 자기완결적 정의 문장 (PART 13.3) */}
          <p className="anim-fade-up text-[13px] font-semibold text-primary">SNS 통합 분석 & 메타광고 관리</p>
          <h1
            className="anim-fade-up mt-3 text-4xl font-bold leading-[1.2] tracking-tight md:text-5xl md:leading-[1.15]"
            style={{ animationDelay: "0.08s" }}
          >
            채널 분석부터
            <br />
            광고 관리까지,
            <br />
            <span className="text-primary">대시보드 하나로</span>
          </h1>
          <p
            className="anim-fade-up mt-5 max-w-md text-[17px] leading-relaxed text-fg-sub"
            style={{ animationDelay: "0.16s" }}
          >
            핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 분석하고 메타광고 집행까지 관리하는 SNS 마케팅
            도구입니다. 경쟁사 동향과 트렌드, AI 콘텐츠 제작까지 함께요.
          </p>
          <div className="anim-fade-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.24s" }}>
            <ButtonLink href="/signup" size="lg">
              무료로 시작하기
            </ButtonLink>
            <ButtonLink href="/#features" variant="secondary" size="lg">
              기능 둘러보기
            </ButtonLink>
          </div>
          <p className="anim-fade-up mt-4 text-[13px] text-fg-faint" style={{ animationDelay: "0.32s" }}>
            신용카드 없이 시작 · 1분 만에 연동
          </p>
        </div>

        <div className="anim-fade-up" style={{ animationDelay: "0.2s" }}>
          <HeroVisual />
        </div>
      </section>

      {/* 문제 제기 (PART 6.1-3) */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <Reveal>
            <h2 className="text-center text-2xl font-bold md:text-3xl">이런 고민 있으신가요?</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PAIN_POINTS.map(({ icon: Icon, persona, pain, solution }, i) => (
              <Reveal key={persona} delay={0.05 * i} className="h-full">
                <div className="h-full rounded-card border border-line bg-body p-6 transition-transform hover:-translate-y-1">
                  <span className="flex size-10 items-center justify-center rounded-card bg-primary-weak text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold">{persona}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-sub">&ldquo;{pain}&rdquo;</p>
                  <p className="mt-3 flex items-start gap-1.5 text-[14px] font-medium text-primary">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {solution}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 핵심 기능 하이라이트 — 지그재그 (PART 6.1-4) */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-6">
        <Reveal>
          <h2 className="text-center text-2xl font-bold md:text-3xl">핵심 기능 — 무엇을 분석할 수 있나요?</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-fg-sub">
            검색하고, 분석하고, 비교하고, 만들어내는 것까지. SNS 마케팅의 반복 작업을 핀치가 대신합니다.
          </p>
        </Reveal>
        <div className="mt-14 space-y-16">
          {FEATURES.map(({ icon: Icon, title, description, points }, i) => {
            const Panel = FEATURE_PANELS[i];
            return (
              <Reveal key={title}>
                <div
                  className={`grid items-center gap-8 md:grid-cols-2 ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}
                >
                  <div>
                    <span className="flex size-11 items-center justify-center rounded-card bg-primary-weak text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-xl font-bold">{title}</h3>
                    <p className="mt-3 max-w-md text-[15px] leading-relaxed text-fg-sub">{description}</p>
                    <ul className="mt-4 space-y-2">
                      {points.map((p) => (
                        <li key={p} className="flex items-center gap-2 text-[14px] text-fg-sub">
                          <Check className="size-4 text-positive" aria-hidden />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Panel />
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* 채널 지원 매트릭스 미리보기 (PART 6.1-5) — 기대치를 정직하게 설정 */}
      <section id="channels" className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-6">
          <Reveal>
            <h2 className="text-center text-2xl font-bold md:text-3xl">
              인스타그램·틱톡·쓰레드, 각각 무엇을 볼 수 있나요?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-fg-sub">
              채널마다 공식 API가 제공하는 데이터 범위가 다릅니다. 핀치는 이 차이를 감추지 않고 기능별 지원
              범위를 그대로 보여드려요.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-10 overflow-x-auto rounded-card border border-line bg-body">
              <table className="w-full min-w-[640px] text-[14px]">
                <caption className="sr-only">채널별 기능 지원 범위 비교표</caption>
                <thead>
                  <tr className="border-b border-line text-left text-[13px] text-fg-faint">
                    <th className="px-5 py-3.5 font-semibold">기능</th>
                    <th className="px-4 py-3.5 font-semibold">Instagram</th>
                    <th className="px-4 py-3.5 font-semibold">TikTok</th>
                    <th className="px-4 py-3.5 font-semibold">Threads</th>
                  </tr>
                </thead>
                <tbody>
                  {SUPPORT_MATRIX.map((row) => (
                    <tr key={row.feature} className="border-b border-line transition-colors last:border-0 hover:bg-overlay/60">
                      <td className="px-5 py-3.5 font-medium">
                        {row.feature}
                        {row.note ? <p className="mt-0.5 text-xs font-normal text-fg-faint">{row.note}</p> : null}
                      </td>
                      <td className="px-4 py-3.5">
                        <SupportBadge level={row.instagram} />
                      </td>
                      <td className="px-4 py-3.5">
                        <SupportBadge level={row.tiktok} />
                      </td>
                      <td className="px-4 py-3.5">
                        <SupportBadge level={row.threads} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-center text-[13px] text-fg-faint">
              제휴 데이터는 검증된 데이터 공급사를 통해 제공되며, 화면에 출처와 갱신 시점을 함께 표기합니다.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-8 text-center text-[13px] font-semibold text-fg-faint">채널별로 더 자세히 보기</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <ButtonLink href="/instagram" variant="ghost" size="sm">
                인스타그램 분석 자세히 보기
              </ButtonLink>
              <ButtonLink href="/tiktok" variant="ghost" size="sm">
                틱톡 분석 자세히 보기
              </ButtonLink>
              <ButtonLink href="/threads" variant="ghost" size="sm">
                쓰레드 분석 자세히 보기
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </section>

      {/* AI 데모 (PART 6.1-6) */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <Reveal>
            <h2 className="text-2xl font-bold md:text-3xl">
              물어보면 답하는
              <br />
              AI 에이전트
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-sub">
              &ldquo;이번 주 우리 인스타 어때?&rdquo;, &ldquo;요즘 뷰티에서 뜨는 릴스 찾아줘&rdquo; — 대시보드의 모든
              기능을 대화로 호출하세요. 답변에는 실제 데이터 화면으로 바로 이동하는 카드가 함께 옵니다.
            </p>
            <ButtonLink href="/signup" className="mt-6">
              직접 써보기 <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Reveal>
          <div className="space-y-3 rounded-card border border-line bg-body p-5" aria-hidden>
            <Reveal delay={0.1} className="flex justify-end">
              <p className="rounded-card bg-primary px-3.5 py-2.5 text-[14px] text-on-primary">
                이번 주 우리 인스타 어때?
              </p>
            </Reveal>
            <Reveal delay={0.25} className="flex justify-start">
              <div className="max-w-[85%] rounded-card border border-line bg-overlay px-3.5 py-2.5 text-[14px] text-fg">
                팔로워가 1,240명 늘었고 주간 조회수는 62만 회로 8.1% 상승했어요. 릴스 &lsquo;여름 신제품
                언박싱&rsquo;이 성장을 이끌고 있습니다.
                <span className="mt-2.5 flex items-center justify-between rounded-card border border-line bg-body px-3 py-2 text-[13px] font-semibold text-primary">
                  대시보드에서 자세히 보기 <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Reveal>
            <Reveal delay={0.4} className="flex justify-end">
              <p className="rounded-card bg-primary px-3.5 py-2.5 text-[14px] text-on-primary">
                그 주제로 카드뉴스 만들어줘
              </p>
            </Reveal>
            <Reveal delay={0.55} className="flex justify-start">
              <p className="rounded-card border border-line bg-overlay px-3.5 py-2.5 text-[14px] text-fg">
                슬라이드 6장 초안을 만들었어요. 브랜드 톤에 맞춰 카피를 다듬어볼까요?
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 요금제 미리보기 (PART 6.1-7) */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <Reveal>
            <h2 className="text-center text-2xl font-bold md:text-3xl">요금제</h2>
            <p className="mt-3 text-center text-[15px] text-fg-sub">무료로 시작하고, 필요할 때 올리세요.</p>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              { name: "Free", target: "체험", desc: "1채널 연동, 월 10회 분석" },
              { name: "Creator", target: "개인 크리에이터", desc: "3채널, 경쟁사 3개, 카드뉴스 무제한" },
              { name: "Pro", target: "광고주·마케터", desc: "광고 모니터링 + 캠페인 관리", highlight: true },
              { name: "Agency", target: "대행사", desc: "멀티 클라이언트 + 화이트라벨" },
            ].map((p, i) => (
              <Reveal key={p.name} delay={0.05 * i} className="h-full">
                <div
                  className={`h-full rounded-card border p-6 transition-transform hover:-translate-y-1 ${p.highlight ? "border-primary bg-primary-weak" : "border-line bg-body"}`}
                >
                  {p.highlight ? <Badge tone="primary">가장 인기</Badge> : null}
                  <h3 className={`text-lg font-bold ${p.highlight ? "mt-2" : ""}`}>{p.name}</h3>
                  <p className="mt-0.5 text-[13px] text-fg-faint">{p.target}</p>
                  <p className="mt-3 text-[14px] leading-relaxed text-fg-sub">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-8 text-center">
            <ButtonLink href="/pricing" variant="secondary">
              요금제 자세히 보기 <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* 연동 채널 로고 스트립 (PART 6.1-8) — 앱 아이콘 무한 마퀴 */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <p className="text-center text-[13px] font-semibold text-fg-faint">지원 채널</p>
        <p className="sr-only">지원 채널: Instagram, TikTok, Threads, Meta 광고</p>
        <div
          className="mt-6 overflow-hidden"
          aria-hidden
          style={{
            maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div className="marquee-track" style={{ "--marquee-duration": "36s" } as React.CSSProperties}>
            <MarqueeGroup />
            <MarqueeGroup />
          </div>
        </div>
      </section>

      {/* FAQ (PART 6.1-9) */}
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

      {/* 최종 CTA (PART 6.1-10) */}
      <section className="mx-auto max-w-6xl px-4 py-24 text-center md:px-6">
        <Reveal>
          <h2 className="text-3xl font-bold md:text-4xl">
            오늘 올릴 콘텐츠,
            <br />
            데이터가 알려드릴게요
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
            1분이면 채널을 연동하고 첫 분석을 받아볼 수 있습니다.
          </p>
          <ButtonLink href="/signup" size="lg" className="mt-8">
            무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </Reveal>
      </section>
    </>
  );
}
