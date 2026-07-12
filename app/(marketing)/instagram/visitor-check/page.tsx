import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircleQuestion, ShieldAlert, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq";

export const metadata: Metadata = {
  title: "인스타 방문자 확인, 정말 가능할까? — 인스타그램 방문자 분석 정직 가이드",
  description:
    "인스타그램 방문자 확인, 누가 내 인스타 봤는지 궁금하신가요? 공식 API로는 불가능한 이유와 인스타 언팔로우 확인·가짜 팔로워 확인의 진실을 핀치가 정직하게 설명합니다. 실제로 확인 가능한 대안도 함께 안내해드립니다.",
  alternates: { canonical: "/instagram/visitor-check" },
};

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "인스타 방문자 확인 앱은 다 가짜인가요?",
    a: "네, 사실상 그렇게 봐야 합니다. 인스타그램 공식 API는 프로필 방문자의 개인 식별 정보를 어떤 외부 서비스에도 제공하지 않기 때문에, 방문자 목록을 보여준다는 앱은 무작위로 생성한 추측성 데이터를 보여주거나 실제로는 다른 목적으로 개인정보를 수집하는 경우가 대부분입니다.",
  },
  {
    q: "인스타 언팔로우 확인 앱 써도 되나요?",
    a: "권장하지 않습니다. 대부분의 언팔로우 확인 앱은 인스타그램 로그인 아이디·비밀번호를 직접 입력받는 방식으로 동작하는데, 이는 공식 API 권한 밖의 접근이라 계정 정지나 개인정보 유출로 이어질 수 있습니다. 공식적으로 확인 가능한 것은 팔로워 총량의 순증감뿐입니다.",
  },
  {
    q: "그럼 누가 내 게시물에 관심 있는지 어떻게 아나요?",
    a: "개별 방문자를 특정하는 대신, 프로필 조회수 추이와 팔로워 순증감, 그리고 댓글·좋아요 등 공개된 상호작용을 기준으로 관심도를 가늠할 수 있습니다. 핀치는 이 공식 데이터를 모아 '자주 반응하는 팬 랭킹'으로 보여드립니다.",
  },
  {
    q: "인스타 가짜 팔로워 확인도 가능한가요?",
    a: "인스타그램은 팔로워의 진위 여부를 공식 지표로 제공하지 않습니다. 핀치는 참여율 이상치를 기반으로 한 자체 추정 지표를 검토 중이며, 제공하게 되더라도 계산 근거와 '자체 추정치' 표기를 반드시 함께 제공할 예정입니다.",
  },
];

/* GEO: BreadcrumbList + FAQPage 구조화 데이터 (PART 13.2·13.3) — 홈 > 인스타그램 분석 > 방문자 확인 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: "https://finch.kr/" },
        { "@type": "ListItem", position: 2, name: "인스타그램 분석", item: "https://finch.kr/instagram" },
        {
          "@type": "ListItem",
          position: 3,
          name: "방문자 확인",
          item: "https://finch.kr/instagram/visitor-check",
        },
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

const FAKE_METHODS = [
  "팔로워 목록이나 최근 상호작용 데이터를 무작위로 조합해 '방문자'처럼 보여주는 방식 — 실제 방문자와 무관한 추측성 데이터입니다.",
  "인스타그램 로그인 아이디·비밀번호를 직접 입력하게 하는 방식 — 계정 접근 권한을 통째로 넘기는 것과 같아 계정 정지, 심하면 해킹 피해로 이어질 수 있습니다.",
];

const HONEST_ALTERNATIVES = [
  {
    title: "프로필 조회수(집계)",
    desc: "최근 기간 동안 내 프로필을 조회한 총 횟수 추이를 확인할 수 있습니다.",
  },
  {
    title: "팔로워 순증감 추이",
    desc: "하루 단위로 팔로워가 얼마나 늘고 줄었는지 그래프로 볼 수 있습니다.",
  },
  {
    title: "자주 반응하는 팬 랭킹",
    desc: "공개된 댓글과 좋아요를 기준으로, 내 콘텐츠에 가장 활발히 반응하는 계정을 랭킹으로 보여드립니다.",
  },
];

export default function VisitorCheckPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* 브레드크럼 — 상단 인스타그램 허브 링크 겸용 */}
      <nav aria-label="브레드크럼" className="mx-auto max-w-3xl px-4 pt-8 text-[13px] text-fg-faint md:px-6">
        <Link href="/instagram" className="hover:text-fg-sub">
          인스타그램 분석
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-fg-sub">방문자 확인</span>
      </nav>

      {/* 히어로 */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:px-6">
        <p className="text-[13px] font-semibold text-primary">인스타그램 방문자·언팔로우 분석</p>
        <h1 className="mt-3 text-3xl font-bold leading-[1.25] tracking-tight md:text-4xl">
          인스타그램 방문자 확인, 정말 가능한가요?
        </h1>

        {/* GEO: 자기완결적 직답 문단 — 경고 톤 카드 */}
        <div className="mt-6 flex items-start gap-3 rounded-card border border-warning/40 bg-warning-weak p-5">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <p className="text-[15px] leading-relaxed text-fg">
            결론부터 말씀드리면, 인스타그램 공식 API는 &ldquo;누가 내 프로필을 봤는지&rdquo; 정보를 어떤
            외부 서비스에도 제공하지 않습니다. 이를 보여준다고 광고하는 앱은 추측성 가짜 데이터를 보여주거나,
            로그인 정보를 요구해 계정 정지·해킹 위험이 있는 비공식 방식을 쓰는 것입니다.
          </p>
        </div>
      </section>

      {/* 방문자 확인 앱의 정체 */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-3xl space-y-16 px-4 py-16 md:px-6">
          <div>
            <h2 className="text-xl font-bold md:text-2xl">인스타 방문자 보는법이라는 앱들, 정체가 뭔가요?</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              &ldquo;인스타 방문자 분석&rdquo;, &ldquo;인스타 방문자 보는법&rdquo;, &ldquo;인스타 프로필
              방문자&rdquo;를 검색하면 방문자 목록을 보여준다는 앱과 웹사이트가 여럿 나옵니다. 하지만
              인스타그램 공식 API는 프로필 조회 로그 자체를 외부에 공개한 적이 없습니다. 이런 서비스가
              방문자를 &lsquo;보여주는&rsquo; 방식은 크게 두 가지뿐입니다.
            </p>
            <ul className="mt-5 space-y-3">
              {FAKE_METHODS.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-fg-sub">
                  <X className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[15px] leading-relaxed text-fg-sub">
              &ldquo;인스타 방문자 분석 무료&rdquo;를 내세우는 앱을 포함해, 결제 여부와 관계없이 이 두 방식
              중 하나라면 신뢰하지 않는 것이 안전합니다. 정리하면, 인스타그램에서 개인 단위의 인스타 방문
              기록 확인·인스타 프로필 조회수 개인 식별은 공식적으로 지원되지 않는 기능입니다.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold md:text-2xl">인스타그램 언팔로우 확인, 가능한가요?</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              인스타 언팔 확인, 나를 언팔한 사람 확인, 인스타 언팔로워 찾기도 마찬가지입니다. 인스타그램
              공식 API는 &ldquo;누가 나를 언팔로우했는지&rdquo; 목록을 제공하지 않습니다. 언팔로우 확인을
              광고하는 서드파티 앱들도 원리는 동일합니다 — 로그인 정보를 요구하거나, 팔로워 목록을 주기적으로
              저장해 이전 스냅샷과 비교하는 방식인데, 이 역시 인스타그램 이용약관이 허용하지 않는 방식입니다.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              공식적으로 확인 가능한 것은 팔로워 &ldquo;총량&rdquo;의 순증감뿐입니다. 예를 들어 오늘 팔로워가
              3명 늘고 5명 줄었다면 &lsquo;-2명&rsquo;이라는 합산 결과만 확인할 수 있고, 그 5명이 누구인지는
              알 수 없습니다.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold md:text-2xl">인스타그램 가짜 팔로워 확인, 지금 가능한가요?</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              인스타 가짜 팔로워 확인 역시 인스타그램이 공식적으로 판정해주는 지표가 아닙니다. 팔로워 수
              대비 좋아요·댓글이 비정상적으로 적으면 정황상 의심할 수 있지만, 이는 간접적인 추정일 뿐
              확정적인 판별은 아닙니다.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
              핀치는 참여율 이상치를 기반으로 한 가짜 팔로워 의심 지표를 검토하고 있습니다. 다만 이는
              인스타그램의 공식 판정이 아닌 핀치의 자체 추정치이므로, 제공하게 되더라도 계산 근거와
              &ldquo;자체 추정치&rdquo; 표기를 반드시 함께 보여드릴 예정입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 전환 — 핀치가 실제로 보여줄 수 있는 것 */}
      <section className="mx-auto max-w-3xl px-4 py-20 md:px-6">
        <h2 className="text-xl font-bold md:text-2xl">핀치가 실제로 보여드릴 수 있는 것</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-sub">
          방문자 개인 식별, 언팔로우한 사람 특정, 가짜 팔로워 확정 판별 — 이 세 가지는 어떤 서비스도
          정직하게 제공할 수 없습니다. 대신 핀치는 인스타그램 공식 API가 허용하는 범위 안에서 &ldquo;누가 내
          계정에 관심 있는지&rdquo;를 가장 정직한 방법으로 보여드립니다.
        </p>
        <ul className="mt-6 space-y-4">
          {HONEST_ALTERNATIVES.map((item) => (
            <li key={item.title} className="flex items-start gap-3 rounded-card border border-line bg-body p-4">
              <Check className="mt-0.5 size-4.5 shrink-0 text-positive" aria-hidden />
              <div>
                <p className="text-[15px] font-semibold">{item.title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-fg-sub">{item.desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[15px] font-medium text-fg">
          이게 실제로 &ldquo;누가 내 계정에 관심 있는지&rdquo; 알 수 있는 가장 정직한 방법입니다.
        </p>
        <div className="mt-8">
          <ButtonLink href="/signup" size="lg">
            무료로 시작하고 팬 반응 확인하기 <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <p className="mt-3 text-[13px] text-fg-faint">신용카드 없이 무료로 체험할 수 있어요.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-body/40">
        <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
          <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold md:text-3xl">
            <MessageCircleQuestion className="size-7 text-primary" aria-hidden />
            인스타 방문자 확인, 더 궁금한 점이 있으신가요?
          </h2>
          <div className="mt-10">
            <FaqAccordion items={FAQ_ITEMS} />
          </div>
        </div>
      </section>

      {/* 하단 — 인스타그램 허브로 돌아가는 링크 */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6">
        <ButtonLink href="/instagram" variant="ghost" size="sm">
          인스타그램 분석 기능 더 살펴보기 <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </section>
    </>
  );
}
