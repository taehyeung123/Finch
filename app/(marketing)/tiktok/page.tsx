import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Hash, MessageCircleQuestion, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SupportBadge, DataSourceBadge } from "@/components/ui/badge";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { AppIconTile } from "@/components/icons/brand";

export const metadata: Metadata = {
  title: "틱톡 분석 사이트 핀치 — 계정 팔로워·조회수·참여율 통계와 트렌드 분석",
  description:
    "핀치의 틱톡 분석은 내 틱톡 계정의 팔로워·조회수·참여율 통계를 확인하고 영상별 성과를 진단하는 틱톡 분석 사이트입니다. 틱톡 해시태그·트렌드·인플루언서 분석은 제휴 데이터 공급사를 통해 함께 제공합니다.",
  alternates: { canonical: "/tiktok" },
};

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "틱톡 팔로워 분석은 어떻게 확인하나요?",
    a: "틱톡 공식 API로 내 계정을 연동하면 팔로워 수 변화, 조회수, 참여율, 영상별 성과 통계를 대시보드에서 바로 확인할 수 있습니다. 완전 지원 항목이라 별도 제휴 데이터 없이 실시간에 가깝게 갱신됩니다.",
  },
  {
    q: "틱톡 트렌드·해시태그·인플루언서 분석 데이터는 어디서 오나요?",
    a: "틱톡은 타 계정과 트렌드에 대한 공식 API 제공 범위가 좁아, 핀치는 검증된 제휴 데이터 공급사를 통해 해시태그 분석과 인플루언서 순위, 카테고리 트렌드를 제공합니다. 화면에는 항상 데이터 출처와 갱신 시점을 함께 표기합니다.",
  },
  {
    q: "무료로 틱톡 계정 진단을 해볼 수 있나요?",
    a: "네. Free 플랜으로 틱톡 채널 1개를 연동해 월 10회까지 콘텐츠 분석을 무료로 체험할 수 있습니다. 신용카드 없이 바로 시작할 수 있어요.",
  },
];

/* GEO: WebPage + BreadcrumbList + FAQPage 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      name: "틱톡 분석",
      url: "https://finch.kr/tiktok",
      description:
        "핀치의 틱톡 분석은 내 틱톡 계정의 팔로워·조회수·참여율 통계를 확인하고 영상별 성과를 진단하는 틱톡 분석 사이트입니다.",
      isPartOf: { "@type": "WebSite", name: "핀치 (Finch)", url: "https://finch.kr" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.kr/" },
        { "@type": "ListItem", position: 2, name: "틱톡 분석", item: "https://finch.kr/tiktok" },
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

export default function TiktokPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 히어로 */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-16 md:grid-cols-[1fr_auto] md:px-6 md:pt-24">
        <div>
          <p className="text-[13px] font-semibold text-primary">틱톡 계정 분석 &amp; 트렌드 탐색</p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.2] tracking-tight md:text-5xl md:leading-[1.15]">
            틱톡 분석
          </h1>
          {/* GEO: 자기완결적 정의 문장 */}
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-fg-sub">
            핀치의 틱톡 분석은 내 틱톡 계정의 팔로워·조회수·참여율 통계를 한 화면에서 확인하고 영상별
            성과를 진단하는 틱톡 분석 사이트입니다. 틱톡 트렌드·해시태그·인플루언서 순위 같은 타
            계정 데이터는 제휴 데이터 공급사를 통해 함께 제공합니다.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/signup" size="lg">
              무료로 틱톡 분석 시작하기
            </ButtonLink>
            <ButtonLink href="#faq" variant="secondary" size="lg">
              자주 묻는 질문 보기
            </ButtonLink>
          </div>
          <p className="mt-4 text-[13px] text-fg-faint">신용카드 없이 시작 · 틱톡 계정 진단 무료 체험</p>
        </div>
        <div className="justify-self-center md:justify-self-end">
          <AppIconTile app="tiktok" size={96} />
        </div>
      </section>

      {/* 완전 지원: 내 계정 분석 */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-card bg-primary-weak text-primary">
                <BarChart3 className="size-5" aria-hidden />
              </span>
              <h2 className="text-2xl font-bold md:text-3xl">틱톡 계정 분석, 무엇을 볼 수 있나요?</h2>
              <SupportBadge level="full" />
            </div>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-sub">
              내 틱톡 계정은 틱톡 공식 API로 연동되어 팔로워 통계, 조회수 분석, 참여율까지 전 항목의
              틱톡 통계를 완전 지원합니다. 틱톡 분석기로 계정 전체를 진단하듯, 틱톡 영상 분석까지
              함께 확인할 수 있어요.
            </p>
            <ul className="mt-6 grid gap-2.5 md:grid-cols-2">
              {[
                "틱톡 팔로워 수 변화·통계 추이 확인",
                "영상별 조회수·좋아요·댓글·공유 등 틱톡 조회수 분석",
                "틱톡 참여율과 콘텐츠 유형별 성과 비교",
                "틱톡 인사이트 기반 게시물 예약 발행",
              ].map((p) => (
                <li key={p} className="flex items-start gap-2 rounded-card border border-line bg-body p-4 text-[14px] text-fg-sub">
                  <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 제휴 데이터: 트렌드·해시태그·인플루언서 */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-card bg-primary-weak text-primary">
              <Hash className="size-5" aria-hidden />
            </span>
            <h2 className="text-2xl font-bold md:text-3xl">
              틱톡 트렌드·해시태그·인플루언서 분석도 되나요?
            </h2>
            <SupportBadge level="thirdparty" />
          </div>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-sub">
            틱톡은 타 계정과 트렌드에 대한 공식 API 제공 범위가 매우 좁습니다. 핀치는 검증된 제휴
            데이터 공급사를 통해 이 영역을 보완하며, 화면에는 항상 데이터 출처와 갱신 시점을 함께
            표기합니다.
          </p>
          <div className="mt-3">
            <DataSourceBadge source="thirdparty" />
          </div>
          <ul className="mt-6 grid gap-2.5 md:grid-cols-2">
            {[
              "카테고리별 실시간 틱톡 트렌드 분석",
              "틱톡 해시태그 분석과 확산 추이 탐색",
              "틱톡 인플루언서 분석·순위 비교",
              "관심 계정 저장 및 추적",
            ].map((p) => (
              <li key={p} className="flex items-start gap-2 rounded-card border border-line bg-body p-4 text-[14px] text-fg-sub">
                <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* AI 콘텐츠 스튜디오 */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-card bg-primary-weak text-primary">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <h2 className="text-2xl font-bold md:text-3xl">틱톡 콘텐츠 제작에 AI도 활용할 수 있나요?</h2>
              <SupportBadge level="full" />
            </div>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-sub">
              핀치의 AI 콘텐츠 스튜디오는 틱톡에도 동일하게 적용됩니다. 주제만 입력하면 틱톡 숏폼에
              맞는 카드뉴스와 콘텐츠 아이디어를 데이터 기반으로 추천받을 수 있어요. 틱톡 AI 분석으로
              어떤 소재가 반응이 좋을지 미리 가늠해볼 수 있습니다.
            </p>
            <ul className="mt-6 grid gap-2.5 md:grid-cols-2">
              {["데이터 기반 콘텐츠 아이디어 추천", "AI 생성 표시 자동 부착"].map((p) => (
                <li key={p} className="flex items-start gap-2 rounded-card border border-line bg-body p-4 text-[14px] text-fg-sub">
                  <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 다른 채널 상호 링크 */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <Reveal>
          <h2 className="text-center text-2xl font-bold md:text-3xl">다른 채널도 함께 보세요</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-fg-sub">
            핀치는 틱톡뿐 아니라 인스타그램·쓰레드까지 한 대시보드에서 분석합니다.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Link
              href="/instagram"
              className="flex items-center gap-4 rounded-card border border-line bg-body p-6 transition-colors hover:border-line-strong"
            >
              <AppIconTile app="instagram" size={48} />
              <div>
                <p className="text-[15px] font-bold">인스타그램 분석</p>
                <p className="mt-1 text-[13px] text-fg-sub">팔로워·릴스 성과부터 경쟁사 광고 모니터링까지</p>
              </div>
            </Link>
            <Link
              href="/threads"
              className="flex items-center gap-4 rounded-card border border-line bg-body p-6 transition-colors hover:border-line-strong"
            >
              <AppIconTile app="threads" size={48} />
              <div>
                <p className="text-[15px] font-bold">쓰레드 분석</p>
                <p className="mt-1 text-[13px] text-fg-sub">쓰레드 계정 통계와 콘텐츠 성과를 한눈에</p>
              </div>
            </Link>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 md:px-6">
          <Reveal>
            <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
              <MessageCircleQuestion className="size-7 text-primary" aria-hidden />
              틱톡 분석, 무엇이 궁금하신가요?
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
          <h2 className="text-3xl font-bold md:text-4xl">
            내 틱톡 계정,
            <br />
            지금 바로 진단해보세요
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
            1분이면 틱톡 계정을 연동하고 첫 분석을 받아볼 수 있습니다.
          </p>
          <ButtonLink href="/signup" size="lg" className="mt-8">
            무료로 틱톡 분석 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </Reveal>
      </section>
    </>
  );
}
