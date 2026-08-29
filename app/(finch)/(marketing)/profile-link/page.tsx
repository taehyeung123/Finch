import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Link2, MessageCircleQuestion, ShieldCheck, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { AppIconTile } from "@/components/icons/brand";

/*
  프로필 링크 마케팅 페이지 (2026-08-29 사장님 지시 «필요하면 완벽하게 만들어»).

  왜 필요했나: 제품은 몇 주째 나가 있는데 마케팅 지면에 **한 줄도 없었다** —
  랜딩·사이트맵·llms.txt 어디에도 없어서 검색엔진에는 존재하지 않는 기능이었다.
  «핀치»는 경쟁이 심한 낱말이지만 «프로필 링크»·«링크인바이오»는 훨씬 얕다.
  여기서 먼저 잡히면 그 트래픽이 브랜드 검색을 끌어올린다.

  ⚠️ 경쟁사 이름은 어떤 문자열에도 넣지 않는다(CLAUDE.md) — «다른 도구»로만 말한다.
*/

export const metadata: Metadata = {
  title: "프로필 링크 만들기 — 인스타·틱톡 바이오에 넣는 링크 모음 페이지",
  description:
    "프로필 링크는 인스타그램·틱톡 프로필에 링크를 하나만 넣을 수 있는 문제를 푸는 링크 모음 페이지입니다. 핀치에서 주소 하나(finch.ai.kr/내아이디)로 링크·상품 카드·갤러리·문의 폼까지 담고, AI 디자인이 프로필 사진 색에 맞춰 페이지를 대신 만들어 줍니다. 방문·클릭 수는 SNS 분석과 같은 화면에서 봅니다.",
  keywords: [
    "프로필 링크",
    "프로필 링크 만들기",
    "링크인바이오",
    "인스타 프로필 링크",
    "인스타 링크 모음",
    "링크 모음 페이지",
    "틱톡 프로필 링크",
    "인스타 바이오 링크",
    "링크 페이지 만들기",
    "무료 링크 모음",
  ],
  alternates: { canonical: "/profile-link" },
};

/* GEO 인용 대비 자기완결형 질문·답변 (PART 13.3) — 각 문단이 따로 떼어 읽혀도 말이 되게 */
const HOW_SECTIONS: { q: string; body: string[]; points: string[] }[] = [
  {
    q: "프로필 링크가 뭔가요?",
    body: [
      "프로필 링크는 인스타그램·틱톡 프로필에 넣는 «링크 모음 페이지»입니다. 두 앱 모두 프로필에 주소를 하나밖에 못 넣기 때문에, 쇼핑몰과 공동구매와 예약 페이지를 함께 알리고 싶어도 매번 프로필을 고쳐야 합니다. 프로필 링크는 그 자리에 주소 하나만 넣어두고, 나머지를 그 안에서 보여 주는 방식입니다.",
      "핀치에서 만들면 주소는 finch.ai.kr/내아이디 형태가 됩니다. 프로필에 이 주소 하나를 넣어두면, 안에 담은 링크를 언제든 바꿔도 프로필은 그대로 둡니다.",
    ],
    points: ["프로필엔 주소 하나만", "안의 내용은 언제든 교체", "finch.ai.kr/내아이디"],
  },
  {
    q: "디자인을 하나도 못 하는데 만들 수 있나요?",
    body: [
      "AI 디자인이 대신 만듭니다. 어떤 일을 하는지, 무엇을 이루고 싶은지, 어떤 분위기가 좋은지 몇 가지만 고르고 프로필 사진을 올리면, AI가 그 사진에서 색을 읽어 배경·글꼴·버튼 모양까지 맞춘 페이지 시안 3종을 만들어 줍니다.",
      "사진과 배경이 따로 노는 문제를 사람이 색을 고르며 해결하지 않아도 됩니다. 사진 자체를 흐려 배경으로 쓰는 시안, 사진에서 뽑은 색으로 지면을 칠한 시안, 분위기에 맞춘 시안이 나란히 나오고 마음에 드는 것을 고르면 그대로 적용됩니다. 문구도 함께 씁니다.",
      "무료 플랜에서도 매달 3번까지 쓸 수 있습니다. 만든 다음에 직접 손보는 것도 물론 됩니다.",
    ],
    points: ["질문 몇 개 + 프로필 사진", "사진 색에 맞춘 시안 3종", "무료로 매달 3번"],
  },
  {
    q: "링크 버튼만 올리는 건가요?",
    body: [
      "아닙니다. 링크 버튼은 24가지 블록 중 하나입니다. 가격과 구매 버튼이 붙는 상품 카드, 사진 갤러리, 공동구매·라이브 일정, 오프라인 매장 지도, 문의·구독 받기, 방명록, 파일 내려받기, 음악·영상까지 블록을 쌓아 페이지를 만듭니다.",
      "링크 버튼에 주소를 넣으면 어디로 가는 링크인지 알아보고 브랜드 로고를 자동으로 붙입니다. 유튜브·인스타그램 같은 곳은 주소만 넣어도 로고가 뜨기 때문에, 아이콘을 따로 준비하지 않아도 됩니다.",
    ],
    points: ["블록 24종을 쌓아 구성", "주소만 넣으면 브랜드 로고 자동", "상품·일정·지도·폼까지"],
  },
  {
    q: "만들고 나면 뭘 볼 수 있나요?",
    body: [
      "누가 얼마나 들어왔고 어떤 버튼을 눌렀는지 집계됩니다. 어떤 링크가 실제로 눌리는지 보이면, 순서를 바꾸거나 안 눌리는 링크를 정리하는 판단이 감이 아니라 숫자로 바뀝니다.",
      "여기가 핀치가 다른 점입니다. 링크만 모아주는 도구는 페이지 안의 클릭까지만 보여 주지만, 핀치는 인스타그램·틱톡·쓰레드 계정 분석이 같은 계정 안에 있습니다. 게시물이 터진 날 프로필 링크 방문이 얼마나 늘었는지를 화면 두 개를 오가지 않고 한 곳에서 봅니다.",
    ],
    points: ["방문·클릭 집계", "SNS 계정 분석과 한 계정", "게시물 성과와 나란히"],
  },
];

/* 블록 24종 — lib/links/blocks.ts BLOCK_CATALOG 과 어휘를 공유한다 */
const BLOCK_GROUPS: { group: string; items: string[] }[] = [
  { group: "기본", items: ["링크 버튼", "이미지·제품 카드", "가로 카드", "그리드"] },
  { group: "콘텐츠", items: ["이미지", "갤러리", "음악", "동영상", "파일 공유", "최근 게시물", "공지·배너", "일정"] },
  { group: "받기", items: ["문의받기", "구독신청", "연락처 저장", "방명록"] },
  { group: "레이아웃", items: ["소제목", "텍스트", "구분선", "빈 공간", "지도·주소", "검색"] },
  { group: "수익", items: ["제휴 상품 카드", "후원받기"] },
];

/* 정직 고지 — 어디까지 되고 어디부터 안 되는지 숨기지 않는다 (핀치 브랜드 원칙) */
const HONEST_NOTES = [
  {
    title: "무료 플랜은 페이지 모서리에 핀치 로고가 붙습니다",
    desc: "페이지 왼쪽 위에 작은 핀치 로고가 표시됩니다. 유료 플랜에서는 내 로고로 바꾸거나 아예 없앨 수 있습니다. 그 밖의 기능에는 로고 여부가 영향을 주지 않습니다.",
  },
  {
    title: "주소(아이디)는 자주 바꿀 수 없습니다",
    desc: "한 번 정한 주소는 30일에 한 번만 바꿀 수 있습니다. 프로필과 명함·전단에 나간 주소가 자주 바뀌면 그 링크가 전부 깨지기 때문입니다. 바꾸더라도 옛 주소로 들어온 방문자는 새 주소로 자동 연결되니 링크가 죽지는 않습니다.",
  },
  {
    title: "«최근 게시물» 블록은 지금 인스타그램만 됩니다",
    desc: "최신 글을 자동으로 띄우는 블록은 인스타그램을 연동했을 때 동작합니다. 틱톡·쓰레드는 준비 중이라 아직 고를 수 없습니다. 그 밖의 블록은 채널 연동 없이 모두 쓸 수 있습니다.",
  },
  {
    title: "AI 디자인 결과는 초안입니다",
    desc: "AI가 만든 색·글꼴·문구는 바로 쓸 수 있는 수준으로 조립되지만, 브랜드에 정답이 있는 경우까지 맞히지는 못합니다. 적용한 뒤 직접 고치는 것을 전제로 만들었고, 마음에 안 들면 다시 뽑거나 처음 상태로 되돌릴 수 있습니다.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "프로필 링크는 무료인가요?",
    a: "네, Free 플랜에서 페이지를 만들고 발행할 수 있습니다. 블록 종류와 방문·클릭 집계도 무료로 씁니다. 무료 플랜에서는 페이지 모서리에 핀치 로고가 붙고, AI 디자인은 매달 3번까지 쓸 수 있습니다. 로고를 바꾸거나 없애려면 유료 플랜이 필요합니다.",
  },
  {
    q: "인스타그램 프로필에 어떻게 넣나요?",
    a: "인스타그램 앱에서 프로필 편집을 열고 «웹사이트» 칸에 finch.ai.kr/내아이디 주소를 붙여 넣으면 됩니다. 틱톡도 프로필 편집의 웹사이트 칸에 같은 주소를 넣습니다. 이후에는 프로필을 다시 건드리지 않고 페이지 안의 링크만 바꾸면 됩니다.",
  },
  {
    q: "쓰던 링크 페이지가 있는데 옮길 수 있나요?",
    a: "네. 쓰던 페이지를 브라우저에서 열고 전체 선택해 복사한 다음 핀치의 가져오기 칸에 붙여 넣으면, 링크 이름과 주소를 읽어 와 블록으로 만들어 줍니다. 서비스에 따라서는 주소만 넣어도 가져올 수 있습니다. 가져온 링크는 표에서 하나씩 고를 수 있고, 추적 코드가 붙은 주소는 따로 알려 드립니다. 디자인은 옮겨지지 않으니 새로 고르거나 AI 디자인으로 만드시면 됩니다.",
  },
  {
    q: "주소를 나중에 바꿀 수 있나요?",
    a: "30일에 한 번 바꿀 수 있습니다. 인쇄물이나 QR로 나간 주소가 자주 바뀌면 그 링크가 전부 깨지기 때문에 둔 제한입니다. 주소를 바꾸면 옛 주소로 들어온 방문자는 새 주소로 자동 연결되므로, 이미 뿌린 링크가 죽지는 않습니다.",
  },
  {
    q: "비밀번호를 걸거나 검색에 안 나오게 할 수 있나요?",
    a: "둘 다 됩니다. 비밀번호를 걸면 아는 사람만 열 수 있고, 검색 비노출로 두면 검색엔진이 페이지를 수집하지 않습니다. 특정 기간에만 여는 공동구매 페이지나 초대 전용 안내처럼, 공개 범위를 좁혀야 할 때 씁니다.",
  },
  {
    q: "링크가 몇 개까지 들어가나요?",
    a: "한 페이지에 블록을 넉넉히 담을 수 있어 링크 개수로 막히는 경우는 거의 없습니다. 링크가 아주 많아 주제별로 나누고 싶다면 하위 페이지를 만들어 finch.ai.kr/내아이디/주제 형태로 쓸 수 있는데, 이건 유료 플랜 기능입니다. 무료 플랜은 페이지 한 장을 쓰고, 유료 플랜은 하위 페이지를 포함해 최대 세 장까지 만듭니다.",
  },
  {
    q: "방문자 정보를 수집하나요?",
    a: "페이지 방문·클릭 수는 집계하지만 방문자 개인을 식별하지 않습니다. 문의·구독 블록으로 방문자가 직접 남긴 정보는 페이지 주인만 볼 수 있고, 수집 목적과 보관 기간은 개인정보처리방침에 정리되어 있습니다.",
  },
];

/* GEO: Service + BreadcrumbList + FAQPage 구조화 데이터 (PART 13.2·13.3) */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      name: "프로필 링크 (링크인바이오)",
      serviceType: "프로필 링크 모음 페이지 제작 도구",
      provider: { "@type": "Organization", name: "핀치 (Finch)", url: "https://finch.ai.kr" },
      areaServed: "KR",
      url: "https://finch.ai.kr/profile-link",
      description:
        "프로필 링크는 인스타그램·틱톡 프로필에 주소를 하나만 넣을 수 있는 제약을 푸는 링크 모음 페이지입니다. 핀치에서는 finch.ai.kr/내아이디 주소로 링크·상품 카드·갤러리·일정·지도·문의 폼 등 24종 블록을 쌓아 만들고, AI 디자인이 프로필 사진 색에 맞춘 시안 3종을 제안합니다. 방문·클릭 수는 인스타그램·틱톡·쓰레드 계정 분석과 같은 화면에서 봅니다.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW", description: "Free 플랜에서 페이지 제작·발행 무료" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.ai.kr/" },
        { "@type": "ListItem", position: 2, name: "프로필 링크", item: "https://finch.ai.kr/profile-link" },
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

export default function ProfileLinkPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 브레드크럼 */}
      <nav aria-label="브레드크럼" className="mx-auto max-w-3xl px-4 pt-8 text-[13px] text-fg-sub md:px-6">
        <Link href="/" className="-mx-2.5 -my-1 inline-block px-2.5 py-2 hover:text-fg-sub">
          홈
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg-sub">프로필 링크</span>
      </nav>

      {/* 히어로 */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:px-6">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-primary-ink">
          <Link2 className="size-4" aria-hidden />
          링크 모음 페이지
        </div>
        <h1 className="mt-3 text-3xl font-bold leading-[1.25] tracking-tight md:text-4xl">
          프로필 링크, 주소 하나로 정리하세요
        </h1>
        {/* GEO: 자기완결적 정의 문단 */}
        <p className="mt-5 text-[17px] leading-relaxed text-fg-sub">
          프로필 링크는 인스타그램·틱톡 프로필에 주소를 하나밖에 못 넣는 문제를 푸는 링크 모음
          페이지입니다. 핀치에서는 finch.ai.kr/내아이디 주소 하나에 링크·상품·갤러리·문의 폼까지 담고,
          디자인이 어려우면 AI가 프로필 사진 색에 맞춰 대신 만들어 줍니다.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href="/signup" size="lg">
            무료로 만들기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/pricing" variant="secondary" size="lg">
            플랜 비교하기
          </ButtonLink>
        </div>
        <p className="mt-4 text-[13px] text-fg-sub">무료로 만들고 발행 · 블록 24종 · 방문·클릭 집계 포함</p>
      </section>

      {/* 질문형 섹션 */}
      {HOW_SECTIONS.map((section, i) => (
        <section key={section.q} className={i % 2 === 1 ? "border-y border-line bg-body" : "border-t border-line"}>
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

      {/* 블록 24종 */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
          <Reveal>
            <h2 className="text-2xl font-bold md:text-3xl">페이지에 무엇을 담을 수 있나요?</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              블록을 쌓아 페이지를 만듭니다. 필요한 것만 올리고 순서는 끌어서 바꿉니다. 아래가 지금 쓸 수
              있는 전부입니다.
            </p>
            <div className="mt-6 space-y-5">
              {BLOCK_GROUPS.map((g) => (
                <div key={g.group}>
                  <p className="text-[13px] font-bold text-fg-sub">{g.group}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {g.items.map((item) => (
                      <li
                        key={item}
                        className="rounded-chip border border-line bg-body px-3 py-1.5 text-[14px] text-fg-sub"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* AI 디자인 */}
      <section className="border-y border-line bg-body">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
          <Reveal>
            <h2 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <Sparkles className="size-6 text-primary-ink" aria-hidden />
              디자인은 AI가 대신합니다
              <InfoTip>
                AI는 문구와 취향 판단을 맡고, 색·대비·블록 구조는 핀치의 디자인 규칙 안에서 조립됩니다.
                글자와 배경의 대비 기준을 통과한 조합만 나가기 때문에, 어떤 답을 고르더라도 읽기 어려운
                페이지가 만들어지지 않습니다.
              </InfoTip>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              «어떤 색이 어울리는지 모르겠다»가 링크 페이지를 만들다 멈추는 가장 흔한 지점입니다. 핀치의 AI
              디자인은 질문 몇 개와 프로필 사진 한 장에서 시작합니다. 사진에서 주조색과 가장 생생한 색을
              읽어, 그 사진이 어색해 보이지 않는 배경·강조색·글꼴·버튼 모양을 함께 정합니다.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { t: "사진을 배경으로", d: "프로필 사진 자체를 부드럽게 흐려 배경으로 씁니다. 사진과 페이지가 어긋날 수 없는 구성입니다." },
                { t: "사진 색으로 칠하기", d: "사진에서 뽑은 색으로 지면과 버튼을 칠합니다. 사진은 그대로 두고 주변이 맞춰집니다." },
                { t: "분위기에 맞추기", d: "차분한·화사한·시크한 같은 선택과 사진 밝기에 따라 어울리는 결을 고릅니다." },
              ].map((x) => (
                <li key={x.t} className="rounded-card border border-line bg-body p-4">
                  <p className="text-[15px] font-semibold">{x.t}</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-fg-sub">{x.d}</p>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[14px] text-fg-sub">
              세 시안을 나란히 보고 고르면 그대로 적용됩니다. 무료 플랜에서도 매달 3번까지 쓸 수 있습니다.
            </p>
          </Reveal>
        </div>
      </section>

      {/* 정직 고지 */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
          <Reveal>
            <h2 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <ShieldCheck className="size-6 text-primary-ink" aria-hidden />
              미리 알아두시면 좋은 것들
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              만들고 나서 알게 되면 곤란한 것들을 먼저 적어 둡니다.
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

      {/* 포지셔닝 콜아웃 */}
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <Reveal>
          <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[17px] font-bold">링크만 모아주는 도구와 다릅니다</h3>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-fg-sub">
                프로필 링크의 클릭 수만 봐서는 무엇이 통했는지 알 수 없습니다. 핀치는 인스타그램·틱톡·쓰레드
                계정 분석이 같은 계정 안에 있어서, 어떤 게시물이 방문을 만들었는지까지 이어서 봅니다.
              </p>
            </div>
            <ButtonLink href="/instagram" variant="secondary" className="shrink-0">
              인스타그램 분석 보기 <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Card>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="border-y border-line bg-body">
        <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
          <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
            <MessageCircleQuestion className="size-7 text-primary-ink" aria-hidden />
            프로필 링크, 더 궁금한 점이 있으신가요?
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
        <h2 className="mt-5 text-3xl font-bold md:text-4xl">주소 하나만 정하면 시작입니다</h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-fg-sub">
          디자인이 막히면 AI가 대신 만들고, 만든 다음엔 무엇이 눌렸는지 숫자로 봅니다.
        </p>
        <ButtonLink href="/signup" size="lg" className="mt-8">
          무료로 만들기 <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </section>
    </>
  );
}
