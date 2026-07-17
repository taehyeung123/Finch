import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircleQuestion, MessageSquareReply, ShieldCheck, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { AppIconTile, InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";

export const metadata: Metadata = {
  title: "인스타 자동디엠 — 댓글 키워드에 자동 DM 발송 (ManyChat 대안)",
  description:
    "인스타 자동디엠(자동 DM)은 인스타그램 게시물에 특정 키워드 댓글이 달리면 자동으로 DM을 보내주는 기능입니다. 게시물마다 다른 메시지를 설정하고, 공식 인스타그램 메시지 API로 안전하게 발송합니다. 콘텐츠 마케터·광고대행사·인플루언서·쇼핑몰을 위한 인스타 자동 응답 도구, 핀치에서 만나보세요.",
  keywords: [
    "인스타 자동디엠",
    "인스타 자동 DM",
    "인스타 댓글 자동 DM",
    "인스타그램 자동 응답 메시지",
    "댓글 DM 자동화",
    "인스타 DM 자동 발송",
    "인스타 자동 답장",
    "댓글 키워드 DM",
    "ManyChat 대안",
    "인스타 자동화 마케팅",
  ],
  alternates: { canonical: "/instagram/auto-dm" },
};

/* GEO 인용 대비 자기완결형 질문·답변 (PART 13.3) */
const HOW_SECTIONS: { q: string; body: string[]; points: string[] }[] = [
  {
    q: "인스타 자동디엠, 어떻게 작동하나요?",
    body: [
      "인스타그램 게시물에 댓글이 달리면, 미리 설정한 조건에 맞을 때 자동으로 다이렉트 메시지(DM)를 보내주는 기능입니다. 예를 들어 게시물에 '정보'나 '구매'라는 단어가 포함된 댓글이 달리면, 상세 페이지 링크가 담긴 DM이 즉시 발송됩니다.",
      "핀치는 인스타그램 공식 메시지 API를 사용합니다. 아이디·비밀번호를 넘겨받는 비공식 매크로 방식이 아니라, 메타가 허용하는 범위 안에서 안전하게 동작합니다.",
    ],
    points: ["댓글 키워드 조건 설정", "조건 충족 시 즉시 자동 DM", "공식 API 기반 안전 발송"],
  },
  {
    q: "게시물마다 다른 DM을 보낼 수 있나요?",
    body: [
      "네. 자동 DM은 게시물 단위로 규칙을 만듭니다. 신제품 릴스에는 구매 링크를, 이벤트 카드뉴스에는 참여 방법을, 후기 게시물에는 상담 안내를 각각 다르게 설정할 수 있습니다.",
      "게시물마다 트리거 키워드와 메시지, 함께 보낼 버튼 링크를 따로 지정하기 때문에, 캠페인별로 정교하게 응대 시나리오를 나눌 수 있습니다.",
    ],
    points: ["게시물별 개별 규칙", "키워드·메시지·버튼 각각 설정", "캠페인 단위 시나리오 분리"],
  },
  {
    q: "어떤 분들이 인스타 자동 DM을 쓰나요?",
    body: [
      "댓글이 많이 달리는 계정일수록 하나하나 수동으로 DM을 보내기 어렵습니다. 자동 DM은 반복 응대를 자동화해 문의를 판매·상담으로 빠르게 연결합니다.",
    ],
    points: [
      "쇼핑몰·브랜드 — 상품 문의를 구매 링크로 즉시 연결",
      "광고대행사 — 클라이언트 계정의 이벤트 응대 자동화",
      "인플루언서·크리에이터 — 협업·공구 문의 자동 안내",
    ],
  },
];

const IG_ONLY_REASONS = [
  {
    channel: "instagram" as const,
    label: "Instagram",
    ok: true,
    text: "인스타그램은 공식 메시지 API(Private Replies)로 댓글에 대한 자동 DM 발송을 지원합니다. 그래서 자동 DM은 인스타그램에서 정식으로 동작합니다.",
  },
  {
    channel: "threads" as const,
    label: "Threads",
    ok: false,
    text: "스레드는 DM 발송 API가 없습니다. 스레드 앱 자체에 독립된 메시지함이 없고 인스타그램 DM으로 연결되기 때문에, 자동 DM은 지원되지 않습니다. 대신 댓글 공개 답글 자동화는 가능합니다.",
  },
  {
    channel: "tiktok" as const,
    label: "TikTok",
    ok: false,
    text: "틱톡은 외부 서비스가 사용할 수 있는 공식 DM 발송 API를 제공하지 않습니다. 우회 방식은 정책 위반이라, 핀치는 틱톡 자동 DM을 제공하지 않습니다.",
  },
];

const SAFE_RULES = [
  {
    title: "댓글 1건당 1회 원칙",
    desc: "인스타그램 정책상 하나의 댓글에 대한 자동 DM(Private Reply)은 1회, 댓글 후 7일 이내에만 보낼 수 있습니다. 핀치는 이 규칙을 그대로 지켜 중복 발송을 막습니다.",
  },
  {
    title: "광고성 메시지 표기·수신거부",
    desc: "판매·홍보 목적의 DM은 정보통신망법상 광고성 정보에 해당할 수 있습니다. 광고로 설정하면 (광고) 표기와 수신거부 안내가 본문에 자동으로 포함됩니다.",
  },
  {
    title: "하루 발송 상한",
    desc: "무차별 대량 발송은 계정 제재로 이어질 수 있습니다. 규칙마다 하루 발송 상한을 두고, 모든 댓글이 아니라 키워드에 반응하는 방식으로 스팸 위험을 낮춥니다.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "인스타 댓글 자동 DM은 계정 정지 위험이 없나요?",
    a: "핀치는 아이디·비밀번호를 요구하는 비공식 매크로가 아니라 인스타그램 공식 메시지 API를 사용합니다. 댓글 1건당 1회 발송 원칙과 하루 발송 상한을 지키고, 키워드에 반응하는 방식으로 무차별 발송을 막아 정책 위반 위험을 낮춥니다. 다만 인스타그램 스팸 정책은 모든 자동화에 공통 적용되므로, 수신자가 원하지 않는 대량 발송은 피해야 합니다.",
  },
  {
    q: "스레드나 틱톡에서도 자동 DM이 되나요?",
    a: "자동 DM은 인스타그램 전용 기능입니다. 스레드는 DM 발송 API가 없고(메시지는 인스타그램으로 연결됩니다), 틱톡은 외부 서비스용 공식 DM API를 제공하지 않습니다. 두 채널에서는 자동 DM을 제공하지 않습니다.",
  },
  {
    q: "ManyChat 같은 서비스와 무엇이 다른가요?",
    a: "자동 DM만 제공하는 도구와 달리, 핀치는 인스타그램 분석·경쟁사 광고 모니터링·메타광고 관리와 자동 DM을 한 곳에서 함께 씁니다. 어떤 게시물이 문의를 많이 만들어내는지 분석 데이터로 확인하고, 그 게시물에 바로 자동 DM 규칙을 붙일 수 있습니다.",
  },
  {
    q: "자동 DM은 어떤 계정에서 쓸 수 있나요?",
    a: "인스타그램 공식 메시지 API 특성상 비즈니스 또는 크리에이터 계정, 그리고 계정에 연결된 페이스북 페이지가 필요합니다. 개인 계정이라면 온보딩에서 전환 방법을 단계별로 안내해드립니다.",
  },
  {
    q: "무료로 써볼 수 있나요?",
    a: "자동 DM은 유료 플랜(Creator 이상) 기능이며, 플랜별로 월 발송 한도가 다릅니다. 요금제 페이지에서 플랜별 한도를 확인할 수 있고, 다른 분석 기능은 Free 플랜으로 먼저 체험할 수 있습니다.",
  },
];

/* GEO: Service + BreadcrumbList + FAQPage 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      name: "인스타 자동디엠",
      serviceType: "인스타그램 댓글 자동 응답 메시지 도구",
      provider: { "@type": "Organization", name: "핀치 (Finch)", url: "https://finch.ai.kr" },
      areaServed: "KR",
      url: "https://finch.ai.kr/instagram/auto-dm",
      description:
        "인스타 자동디엠은 인스타그램 게시물에 특정 키워드 댓글이 달리면 공식 메시지 API로 자동 DM을 발송하는 기능입니다. 게시물마다 다른 메시지를 설정할 수 있으며 콘텐츠 마케터·광고대행사·인플루언서·쇼핑몰이 사용합니다.",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.ai.kr/" },
        { "@type": "ListItem", position: 2, name: "인스타그램 분석", item: "https://finch.ai.kr/instagram" },
        { "@type": "ListItem", position: 3, name: "인스타 자동디엠", item: "https://finch.ai.kr/instagram/auto-dm" },
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

const CHANNEL_GLYPH = {
  instagram: <InstagramGlyph className="size-4 text-ig" />,
  threads: <ThreadsGlyph className="size-4 text-fg" />,
  tiktok: <TiktokGlyph className="size-4 text-fg" />,
};

export default function AutoDmPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 브레드크럼 */}
      <nav aria-label="브레드크럼" className="mx-auto max-w-3xl px-4 pt-8 text-[13px] text-fg-faint md:px-6">
        <Link href="/instagram" className="hover:text-fg-sub">
          인스타그램 분석
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg-sub">인스타 자동디엠</span>
      </nav>

      {/* 히어로 */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:px-6">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-primary">
          <MessageSquareReply className="size-4" aria-hidden />
          인스타그램 댓글 자동 응답
        </div>
        <h1 className="mt-3 text-3xl font-bold leading-[1.25] tracking-tight md:text-4xl">
          인스타 자동디엠, 키워드 하나로 문의를 판매로
        </h1>
        {/* GEO: 자기완결적 정의 문단 */}
        <p className="mt-5 text-[17px] leading-relaxed text-fg-sub">
          인스타 자동디엠(자동 DM)은 게시물에 특정 키워드 댓글이 달리면 인스타그램 공식 메시지 API로 자동
          다이렉트 메시지를 보내주는 기능입니다. 게시물마다 다른 메시지를 설정할 수 있어, 반복되는 문의
          응대를 자동화하고 관심 있는 사람에게 바로 링크와 안내를 전달합니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href="/signup" size="lg">
            무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/pricing" variant="secondary" size="lg">
            플랜별 발송 한도 보기
          </ButtonLink>
        </div>
        <p className="mt-4 text-[13px] text-fg-faint">공식 인스타그램 메시지 API 기반 · 인스타그램 전용</p>
      </section>

      {/* 질문형 섹션 */}
      {HOW_SECTIONS.map((section, i) => (
        <section key={section.q} className={i % 2 === 1 ? "border-t border-line bg-body/40" : "border-t border-line"}>
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

      {/* 채널 범위 — 인스타 전용 이유 (differentiator, 정직 고지) */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
          <Reveal>
            <h2 className="text-2xl font-bold md:text-3xl">스레드·틱톡에서도 자동 DM이 되나요?</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              결론부터 말씀드리면, 댓글 자동 DM은 인스타그램 전용입니다. 자동 DM을 모든 채널에서 된다고
              안내하는 것은 정확하지 않습니다. 채널마다 메시지 API 지원 범위가 다르기 때문입니다.
            </p>
            <ul className="mt-6 space-y-3">
              {IG_ONLY_REASONS.map((row) => (
                <li
                  key={row.channel}
                  className="flex items-start gap-3 rounded-card border border-line bg-body p-4"
                >
                  <span className="mt-0.5 shrink-0" aria-hidden>
                    {CHANNEL_GLYPH[row.channel]}
                  </span>
                  <div>
                    <p className="flex items-center gap-2 text-[15px] font-semibold">
                      {row.label}
                      {row.ok ? (
                        <Check className="size-4 text-positive" aria-hidden />
                      ) : (
                        <X className="size-4 text-negative" aria-hidden />
                      )}
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-fg-sub">{row.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 안전·정책 */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
          <Reveal>
            <h2 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <ShieldCheck className="size-6 text-primary" aria-hidden />
              스팸 걱정 없이 안전하게 쓰려면
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              자동 DM은 편리하지만, 규칙 없이 대량 발송하면 계정 제재나 수신자 불만으로 이어질 수 있습니다.
              핀치는 인스타그램 정책과 국내 법을 지키도록 처음부터 안전장치를 넣었습니다.
            </p>
            <ul className="mt-6 space-y-4">
              {SAFE_RULES.map((rule) => (
                <li key={rule.title} className="flex items-start gap-3 rounded-card border border-line bg-body p-4">
                  <Check className="mt-0.5 size-4.5 shrink-0 text-positive" aria-hidden />
                  <div>
                    <p className="text-[15px] font-semibold">{rule.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-fg-sub">{rule.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ManyChat 대안 포지셔닝 콜아웃 */}
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <Reveal>
          <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[17px] font-bold">분석과 자동 DM을 한 곳에서</h3>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-fg-sub">
                어떤 게시물이 문의를 많이 만드는지 인스타그램 분석으로 확인하고, 그 게시물에 바로 자동 DM
                규칙을 붙이세요. 자동 DM만 있는 도구와 다른 점입니다.
              </p>
            </div>
            <ButtonLink href="/instagram" variant="secondary" className="shrink-0">
              인스타그램 분석 보기 <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Card>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
          <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
            <MessageCircleQuestion className="size-7 text-primary" aria-hidden />
            인스타 자동 DM, 더 궁금한 점이 있으신가요?
          </h2>
          <div className="mt-10">
            <FaqAccordion items={FAQ_ITEMS} />
          </div>
        </div>
      </section>

      {/* 최종 CTA */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
        <div className="flex justify-center">
          <AppIconTile app="instagram" size={48} />
        </div>
        <h2 className="mt-5 text-3xl font-bold md:text-4xl">댓글을 매출로, 자동으로</h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
          게시물에 규칙 하나만 걸어두면, 관심 있는 사람에게 알아서 DM이 나갑니다.
        </p>
        <ButtonLink href="/signup" size="lg" className="mt-8">
          무료로 시작하기 <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </section>
    </>
  );
}
