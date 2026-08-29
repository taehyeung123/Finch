import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  Compass,
  LayoutDashboard,
  Link2,
  Megaphone,
  MessageCircleQuestion,
  Sparkles,
  Users,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/charts";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { HeroVisual } from "@/components/landing/hero-visual";
import { StickyCta } from "@/components/landing/sticky-cta";
import { AppIconTile, type BrandApp } from "@/components/icons/brand";
import { PLAN_CARDS } from "@/components/pricing/plan-cards";

export const metadata: Metadata = {
  /* 제목에 브랜드가 이미 있다 — 레이아웃 템플릿(«%s | 핀치 (Finch)»)이 또 붙으면
     검색 결과에 브랜드가 두 번 나온다(네이버 노출 실측). absolute 로 템플릿을 끈다 */
  title: { absolute: "핀치 (Finch) — 인스타그램·틱톡·쓰레드 SNS 통합 분석 & 메타광고 관리" },
  description:
    "핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 보는 SNS 통합 분석 사이트입니다. 경쟁사 광고 모니터링, 트렌드 탐색, AI 콘텐츠 제작까지 크리에이터를 위한 소셜미디어 분석 도구를 하나의 대시보드에서 제공합니다.",
  alternates: { canonical: "/" },
};

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "어떤 채널을 지원하나요?",
    a: "인스타그램, 틱톡, 쓰레드 3개 채널과 메타 광고 계정을 지원합니다. 채널마다 볼 수 있는 지표가 조금씩 다르고, 핀치는 채워지지 않는 값을 추정으로 메우지 않습니다.",
  },
  {
    q: "개인 인스타그램 계정도 연동할 수 있나요?",
    a: "인스타그램은 비즈니스 또는 크리에이터 계정만 연동할 수 있습니다. 개인 계정이라면 전환하는 방법을 시작 과정에서 단계별로 안내해드립니다. 전환은 무료이고 몇 번의 터치로 끝납니다.",
  },
  {
    q: "경쟁사 광고 모니터링은 어떻게 동작하나요?",
    a: "메타가 투명성 목적으로 누구나 볼 수 있게 공개한 광고 라이브러리를 근거로 합니다. 등록한 경쟁사를 주기적으로 확인해 새 광고가 감지되면 알림을 보내드립니다. 오래 집행되는 광고는 성과가 나온다는 신호로 읽을 수 있습니다.",
  },
  {
    q: "트렌드·타 계정 데이터는 얼마나 믿을 수 있나요?",
    a: "내 계정 지표는 플랫폼에서 직접 받아온 값이라 앱에서 보는 숫자와 같습니다. 카테고리 트렌드나 타 계정 분석은 공개된 정보를 모아 계산한 값이라 실제와 차이가 날 수 있고, 화면에 갱신 시점을 함께 표시합니다. 핀치가 자체적으로 계산한 지표에는 계산 근거를 볼 수 있는 설명을 붙입니다.",
  },
  {
    q: "AI가 만든 콘텐츠는 어떻게 표시되나요?",
    a: "각 플랫폼의 AI 생성물 표시 정책에 맞춰, AI가 만든 카드뉴스에 AI 생성 표시를 자동으로 부착합니다.",
  },
  {
    q: "인스타 프로필에 넣는 링크 모음 페이지도 만들 수 있나요?",
    a: "네. 핀치의 프로필 링크로 finch.ai.kr/내아이디 주소를 만들어 인스타그램·틱톡 프로필에 넣으면, 링크·상품 카드·갤러리·문의 폼을 한 페이지에 담을 수 있습니다. 디자인이 어려우면 AI가 프로필 사진 색에 맞춰 시안을 만들어 주고, 방문·클릭 수는 채널 분석과 같은 화면에서 봅니다. 무료로 만들고 발행할 수 있습니다.",
  },
  {
    q: "무료로 사용할 수 있나요?",
    a: "네. Free 플랜은 신용카드 없이 채널 1개를 연동하고 AI 챗 3회, 영상 분석 1회, 레퍼런스 수집 1회, 대본 추출 1회를 매달 써볼 수 있습니다. AI 카드뉴스·성장 진단은 유료 플랜 기능입니다.",
  },
  {
    q: "무료 인스타그램 분석 사이트가 있나요?",
    a: "네, 핀치 Free 플랜에서 인스타그램 1채널을 연동해 대시보드·게시물 성과 분석을 신용카드 없이 무료로 쓸 수 있습니다.",
  },
  {
    q: "인스타그램 팔로워 나이대 분석도 되나요?",
    a: "팔로워 연령대·성별 화면은 아직 준비 중입니다. 지금 확인할 수 있는 것은 팔로워 증감 추이, 프로필 조회수, 도달·노출수, 게시물별 성과입니다. 없는 기능을 있다고 말하지 않는 것이 핀치의 원칙이라, 준비되면 이 자리에서 알려드리겠습니다.",
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
      "인스타그램·틱톡·쓰레드의 팔로워·조회수·참여율을 한 화면에서 봅니다. 광고 계정을 연동하면 광고 성과까지 나란히 놓입니다.",
    points: ["채널별·전체 요약 지표", "최근 게시물 성과 추이", "콘텐츠 유형 비중 분석"],
  },
  {
    icon: Link2,
    title: "프로필 링크",
    description:
      "프로필에 넣는 링크 모음 페이지를 finch.ai.kr/내아이디 주소로 만듭니다. 디자인이 막히면 AI가 프로필 사진 색에 맞춰 대신 만들어 줍니다.",
    points: ["블록 24종으로 자유 구성", "AI 디자인이 시안 3종 제안", "방문·클릭 집계 내장"],
    href: "/profile-link",
    cta: "프로필 링크 자세히 보기",
  },
  {
    icon: BellRing,
    title: "경쟁사 광고 자동 모니터링",
    description:
      "등록해둔 경쟁사가 새 광고를 시작하면 자동으로 감지해 알려드립니다. 오래 집행되는 광고는 성과가 나온다는 신호예요.",
    points: ["신규 광고 감지 알림", "게재 기간·노출 플랫폼 확인", "소재 아카이브"],
  },
  {
    icon: Compass,
    title: "카테고리 트렌드 탐색",
    description:
      "뷰티·푸드·패션 등 분야별로 지금 뜨는 콘텐츠를 봅니다. 팔로워 대비 조회수로 «진짜 터진» 것만 가려냅니다.",
    points: ["실시간·카테고리별 탐색", "팔로워 대비 도달 스코어", "관심 계정 저장"],
  },
  {
    icon: Sparkles,
    title: "AI 콘텐츠 스튜디오",
    description:
      "주제만 입력하면 카드뉴스 카피와 슬라이드가 완성됩니다. 다음에 뭘 만들지도 데이터를 근거로 추천해요.",
    points: ["카드뉴스 자동 생성", "데이터 기반 아이디어 추천", "AI 생성 표시 자동 부착"],
  },
];

/* 지그재그 기능별 미니 목업 패널 — FEATURES 배열과 같은 순서 */

const panelBase =
  "rounded-card border border-line bg-body p-5 trans-state hover:border-line-strong md:p-6";

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
          <div key={s.label} className="rounded-card border border-line bg-plate p-3.5">
            <p className="text-xs text-fg-sub">{s.label}</p>
            <p className="tnum mt-1 text-lg font-bold">{s.value}</p>
            <p className="tnum mt-0.5 text-xs font-semibold text-positive">{s.delta}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-card border border-line bg-plate p-3.5">
        <p className="text-xs text-fg-sub">최근 30일 조회수</p>
        <Sparkline data={[18, 26, 24, 39, 33, 52, 47, 68, 74, 88]} width={320} height={44} className="mt-1.5 w-full" />
      </div>
    </div>
  );
}

/* 프로필 링크 — 실제 공개 페이지의 축소판(프로필 + 브랜드 칩 링크 + 클릭 수) */
function ProfileLinkPanel() {
  return (
    <div className={panelBase} aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-sub">
          <Link2 className="size-4 text-primary-ink" aria-hidden />
          finch.ai.kr/mylink
        </p>
        <AppIconTile app="instagram" size={28} />
      </div>
      <div className="mt-4 rounded-card border border-line bg-plate p-4">
        <div className="flex flex-col items-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-primary-weak text-[15px] font-bold text-primary-ink">
            민
          </span>
          <p className="mt-2 text-[14px] font-bold">민지의 공구방</p>
          <p className="mt-0.5 text-[12px] text-fg-sub">이번 주 공동구매 진행 중</p>
        </div>
        <div className="mt-3.5 space-y-2">
          {[
            { app: "instagram" as BrandApp, label: "인스타그램", hits: "1,240" },
            { app: "tiktok" as BrandApp, label: "틱톡", hits: "860" },
            { app: "threads" as BrandApp, label: "쓰레드", hits: "412" },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-2.5 rounded-card border border-line bg-body px-2.5 py-2">
              <AppIconTile app={r.app} size={22} />
              <span className="text-[12px] font-semibold">{r.label}</span>
              <span className="tnum ml-auto text-[12px] text-fg-sub">{r.hits}</span>
            </div>
          ))}
        </div>
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
        <div className="-mt-3 mr-8 rounded-card border border-line-strong bg-plate p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="anim-pulse rounded-chip bg-primary-weak px-2.5 py-0.5 text-[11px] font-semibold text-primary-ink">
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
            className="flex items-center gap-3 rounded-card border border-transparent px-3 py-2.5 trans-state hover:border-line hover:bg-tint-hover"
          >
            <span className={`tnum w-4 text-center text-[15px] font-bold ${row.rank === 1 ? "text-primary-ink" : "text-fg-sub"}`}>
              {row.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{row.title}</p>
              <p className="truncate text-xs text-fg-sub">{row.meta}</p>
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
          <Sparkles className="size-4 text-primary-ink" aria-hidden />
          카드뉴스 초안 6장
        </p>
        <AppIconTile app="instagram" size={28} />
      </div>
      {/* 슬라이드 3장 스택 */}
      <div className="relative mt-5 flex justify-center pb-3">
        <div className="absolute top-3 h-full w-40 -translate-x-14 -rotate-6 rounded-card border border-line bg-overlay opacity-50" />
        <div className="absolute top-1.5 h-full w-40 translate-x-14 rotate-3 rounded-card border border-line bg-overlay opacity-75" />
        <div className="relative w-44 rounded-card border border-line-strong bg-plate p-4">
          <p className="tnum text-[11px] font-semibold text-primary-ink">1 / 6</p>
          <p className="mt-1.5 text-[14px] font-bold leading-snug">
            여름 수분 루틴,
            <br />
            순서가 전부예요
          </p>
          <div className="mt-3 h-1.5 w-10 rounded-chip bg-primary" />
          <p className="mt-3 text-[12px] text-fg-sub">AI 생성 표시 자동 부착</p>
        </div>
      </div>
    </div>
  );
}

const FEATURE_PANELS = [DashboardPanel, ProfileLinkPanel, AdMonitorPanel, TrendPanel, AiStudioPanel];

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
          /* 모바일에서는 한 항목이 커서 화면에 1.5개만 걸렸다 — «무엇을 지원하는지»가
             읽히지 않는다(2026-08-29 실측). 간격·글자를 줄여 서너 개가 함께 흐르게 한다. */
          <span
            key={`${item.app}-${r}`}
            className="mx-4 inline-flex items-center gap-2 text-[15px] font-bold text-fg-sub sm:mx-7 sm:gap-3 sm:text-lg"
          >
            <AppIconTile app={item.app} size={28} className="sm:hidden" />
            <AppIconTile app={item.app} size={40} className="hidden sm:block" />
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
      {/* 모바일 하단 고정 CTA — 9000px 짜리 랜딩에서 가입 버튼이 계속 손에 닿게(2026-08-29) */}
      <StickyCta />

      {/* Hero (PART 6.1-2) — 좌측 텍스트 스태거 진입 + 우측 플로팅 비주얼 */}
      {/* ── 히어로 — 2026-08-15 재구성.
             앞 버전은 좌: 글 / 우: 세로 목업 카드였다. 그래서 ① 제목이 화면 절반에
             갇혀 3줄로 꺾였고 ② 우측 목업은 사이드바도 상단 바도 없어서 제품이
             어떻게 생겼는지 전달하지 못했다.
             벤치마크(스니핏·링크팜)는 둘 다 **중앙 정렬 글 → 그 아래 앱 화면 통짜**다.
             글은 폭 전체를 쓰고, 화면은 넓게 깔린다. 그 구조로 바꿨다. ── */}
      <section className="mx-auto max-w-6xl overflow-x-clip px-5 pb-16 pt-14 text-center md:px-6 md:pb-20 md:pt-24">
        {/* GEO: 자기완결적 정의 문장 (PART 13.3) */}
        <p className="anim-fade-up text-[13px] font-semibold tracking-[0.02em] text-primary-ink">
          SNS 통합 분석 &amp; 메타광고 관리
        </p>
        <h1
          className="anim-fade-up mx-auto mt-4 max-w-[19ch] text-[clamp(30px,5.6vw,60px)] font-bold leading-[1.18] md:leading-[1.12]"
          style={{ animationDelay: "0.08s" }}
        >
          채널 분석부터 광고 관리까지,{" "}
          <span className="text-primary-ink">대시보드 하나로</span>
        </h1>
        <p
          className="anim-fade-up mx-auto mt-5 max-w-[54ch] text-[16px] leading-[1.65] text-fg-sub md:mt-6 md:text-[18px]"
          style={{ animationDelay: "0.16s" }}
        >
          핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 분석하고 메타광고 집행까지 관리하는 SNS 마케팅
          도구입니다. 경쟁사 동향과 트렌드, AI 콘텐츠 제작까지 함께요.
        </p>
        <div
          className="anim-fade-up mt-8 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "0.24s" }}
        >
          <ButtonLink href="/signup" size="lg">
            무료로 시작하기
          </ButtonLink>
          <ButtonLink href="/#features" variant="secondary" size="lg">
            기능 둘러보기
          </ButtonLink>
        </div>
        <p className="anim-fade-up mt-4 text-[13px] text-fg-sub" style={{ animationDelay: "0.32s" }}>
          신용카드 없이 시작 · 1분 만에 연동
        </p>

        {/* 제품 화면 — 글보다 아래, 폭은 더 넓게. 플로팅 아이콘이 프레임 밖으로
            나오므로 위아래 여백을 따로 준다(px-2 는 좌우 아이콘용). */}
        <div className="anim-fade-up mt-14 px-2 md:mt-16" style={{ animationDelay: "0.36s" }}>
          <HeroVisual />
        </div>
      </section>

      {/* 문제 제기 (PART 6.1-3) */}
      <section className="border-y border-line bg-body">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-6 md:py-24">
          <Reveal>
            <div className="mb-3 flex justify-center"><span className="rounded-chip bg-plate px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-sub">WHY</span></div>
            <h2 className="text-center text-[26px] font-bold leading-[1.3] tracking-[-0.02em] md:text-[32px]">이런 고민 있으신가요?</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PAIN_POINTS.map(({ icon: Icon, persona, pain, solution }, i) => (
              <Reveal key={persona} delay={0.05 * i} className="h-full">
                <div className="h-full rounded-card border border-line bg-body p-6 transition-transform hover:-translate-y-1">
                  <span className="flex size-10 items-center justify-center rounded-card bg-primary-weak text-primary-ink">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold">{persona}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-sub">&ldquo;{pain}&rdquo;</p>
                  <p className="mt-3 flex items-start gap-1.5 text-[14px] font-medium text-primary-ink">
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
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:px-6 md:py-24">
        <Reveal>
          {/* 프로필 링크가 들어오면서 «분석»만으로는 섹션을 덮지 못한다(2026-08-29) */}
          <div className="mb-3 flex justify-center"><span className="rounded-chip bg-plate px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-sub">FEATURES</span></div>
            <h2 className="text-center text-[26px] font-bold leading-[1.3] tracking-[-0.02em] md:text-[32px]">무엇을 할 수 있나요?</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-fg-sub">
            프로필을 정리하고, 분석하고, 비교하고, 만들어내는 것까지. SNS 마케팅의 반복 작업을 핀치가 대신합니다.
          </p>
        </Reveal>
        <div className="mt-14 space-y-16">
          {FEATURES.map(({ icon: Icon, title, description, points, href, cta }, i) => {
            const Panel = FEATURE_PANELS[i];
            return (
              <Reveal key={title}>
                <div
                  /* [&>*]:min-w-0 — 모바일(1열)에서 그리드 트랙이 auto 라 목업 패널의
                     min-content(내부 고정폭·좌우 margin) 만큼 트랙이 부풀어 페이지 전체에
                     가로 스크롤이 생겼다(375px 뷰포트에서 408px). 그리드 아이템의 기본
                     min-width:auto 를 풀어 트랙이 컨테이너를 넘지 못하게 한다. */
                  className={`grid items-center gap-8 [&>*]:min-w-0 md:grid-cols-2 ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}
                >
                  <div>
                    <span className="flex size-11 items-center justify-center rounded-card bg-primary-weak text-primary-ink">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-xl font-bold">{title}</h3>
                    <p className="mt-3 max-w-md text-[15px] leading-[1.75] text-fg-sub">{description}</p>
                    <ul className="mt-4 space-y-2">
                      {points.map((p) => (
                        <li key={p} className="flex items-center gap-2 text-[14px] text-fg-sub">
                          <Check className="size-4 shrink-0 text-positive" aria-hidden />
                          {p}
                        </li>
                      ))}
                    </ul>
                    {/* 전용 소개 페이지가 있는 기능만 — 홈에서 그 페이지로 가는 길이자 앵커텍스트다 */}
                    {href ? (
                      <ButtonLink href={href} variant="secondary" size="sm" className="mt-5">
                        {cta} <ArrowRight className="size-4" aria-hidden />
                      </ButtonLink>
                    ) : null}
                  </div>
                  <Panel />
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* 채널별 자세히 보기 진입 (PART 6.1-5) */}
      <section id="channels" className="border-y border-line bg-body">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:px-6 md:py-24">
          <Reveal>
            <div className="mb-3 flex justify-center"><span className="rounded-chip bg-plate px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-sub">CHANNELS</span></div>
            <h2 className="text-center text-[26px] font-bold leading-[1.3] tracking-[-0.02em] md:text-[32px]">
              채널마다 보는 것이 다릅니다
            </h2>
            <p className="mx-auto mt-3 max-w-[30ch] text-center text-[15px] leading-[1.7] text-fg-sub">
              확인할 수 있는 지표가 채널마다 달라요.
              <br />
              어떤 걸 볼 수 있는지 먼저 확인해 보세요.
            </p>
          </Reveal>
          {/* 예전에는 ghost 버튼 세 개가 가운데 흩어져 있었다 — 테두리도 배경도 없어
              «누를 수 있는 것»으로 안 보이고, 모바일에서 2+1 로 어긋나 섹션이 휑했다
              (2026-08-29 실측). 채널 로고를 단 행 카드로 바꿔 눌러야 할 것으로 만든다. */}
          <Reveal delay={0.15}>
            <ul className="mx-auto mt-8 grid max-w-3xl gap-2.5 sm:grid-cols-3">
              {(
                [
                  { href: "/instagram", app: "instagram", name: "인스타그램", note: "팔로워·참여율·게시물" },
                  { href: "/tiktok", app: "tiktok", name: "틱톡", note: "조회수·트렌드·해시태그" },
                  { href: "/threads", app: "threads", name: "쓰레드", note: "게시물 반응·인사이트" },
                ] as { href: string; app: BrandApp; name: string; note: string }[]
              ).map((c) => (
                <li key={c.href}>
                  <Link
                    href={c.href}
                    className="card-face card-hover flex items-center gap-3 p-4 sm:flex-col sm:items-start sm:gap-2.5"
                  >
                    <AppIconTile app={c.app} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold">{c.name} 분석</span>
                      <span className="mt-0.5 block text-[13px] text-fg-sub">{c.note}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-fg-faint sm:hidden" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* AI 데모 (PART 6.1-6) */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:px-6 md:py-24">
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
                <span className="mt-2.5 flex items-center justify-between rounded-card border border-line bg-body px-3 py-2 text-[13px] font-semibold text-primary-ink">
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
      <section className="border-y border-line bg-body">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-6 md:py-24">
          <Reveal>
            <div className="mb-3 flex justify-center"><span className="rounded-chip bg-plate px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-sub">PRICING</span></div>
            <h2 className="text-center text-[26px] font-bold leading-[1.3] tracking-[-0.02em] md:text-[32px]">요금제</h2>
            <p className="mt-3 text-center text-[15px] leading-[1.7] text-fg-sub">무료로 시작하고, 필요할 때 올리세요.</p>
          </Reveal>
          {/* 이 미리보기는 **PLAN_CARDS 에서만** 값을 가져온다.
              앞서는 손으로 적은 구 요금 모델이 남아 "Creator 카드뉴스 무제한"(실제
              최대 23장)·"Free 카드뉴스 월 3회"(실제 유료 전용)를 광고하고 있었다.
              랜딩이 약속한 걸 요금제 페이지가 부정하면 그건 그대로 환불 사유다. */}
          <div className="mt-10 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {PLAN_CARDS.map((p, i) => (
              <Reveal key={p.key} delay={0.05 * i} className="h-full">
                <div
                  className={`h-full rounded-card border p-5 transition-transform hover:-translate-y-1 ${
                    p.key === "pro" ? "border-primary bg-primary-weak" : "border-line bg-body"
                  }`}
                >
                  <h3 className="text-[17px] font-bold">{p.name}</h3>
                  <p className="tnum mt-1 text-[15px] font-semibold text-fg">
                    {p.price === 0 ? "무료" : `${p.price.toLocaleString("ko-KR")}원 / 월`}
                  </p>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-fg-sub">
                    {p.credits !== null
                      ? `월 ${p.credits.toLocaleString("ko-KR")} 크레딧 · ${p.perks[0]}`
                      : `크레딧 없이 월 횟수 · ${p.perks[0]}`}
                  </p>
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
        <p className="text-center text-[13px] font-semibold text-fg-sub">지원 채널</p>
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
      <section id="faq" className="border-y border-line bg-body">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20 md:px-6 md:py-24">
          <Reveal>
            <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
              <MessageCircleQuestion className="size-7 text-primary-ink" aria-hidden />
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
      <section className="mx-auto max-w-6xl px-5 py-24 text-center md:px-6 md:py-28">
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
