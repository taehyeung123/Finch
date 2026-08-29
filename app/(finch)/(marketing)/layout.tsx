import Link from "next/link";
import { FinchLogo } from "@/components/logo";
import { PromoBanner } from "@/components/landing/promo-banner";
import { ButtonLink } from "@/components/ui/button";
import { InstagramGlyph, MetaGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/* 공개 마케팅 영역 — SEO/GEO 최우선 적용 (PART 13.1) */
/*
  푸터 링크의 손가락 표적 — 글자 높이만으로는 16px 이라 모바일에서 옆 줄을 누르기 쉽다
  (2026-08-29 실측). 위아래 여백으로 36px 을 만들고 줄 간격을 좁혀 푸터가 덜 길어지게 한다.
  좌우 음수 여백은 여백만 넓히고 정렬선은 그대로 두기 위한 것 — 글자는 원래 자리에 선다.
*/
const footLink = "-mx-2 block rounded-card px-2 py-2.5 trans-state hover:text-fg";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* 최상단 프로모션 배너 — sticky 헤더 위, 스크롤 시 배너만 사라짐 */}
      <PromoBanner />

      {/* Sticky Nav (PART 6.1-1) */}
      <header className="sticky top-0 z-40 border-b border-line bg-body/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" aria-label="핀치 홈">
            <FinchLogo />
          </Link>
          <nav className="hidden items-center gap-6 text-[15px] font-medium text-fg-sub md:flex" aria-label="주요 링크">
            <Link href="/#features" className="hover:text-fg">
              기능
            </Link>
            <Link href="/#channels" className="hover:text-fg">
              지원 채널
            </Link>
            <Link href="/pricing" className="hover:text-fg">
              요금제
            </Link>
            <Link href="/#faq" className="hover:text-fg">
              FAQ
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ButtonLink href="/login" variant="ghost" size="sm" className="text-[14px]">
              로그인
            </ButtonLink>
            <span className="inline-flex transition-transform duration-200 hover:-translate-y-0.5">
              <ButtonLink href="/signup" size="sm">
                무료로 시작하기
              </ButtonLink>
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer (PART 6.1-11) */}
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-5 md:px-6">
          <div className="md:col-span-2">
            <FinchLogo />
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-fg-sub">
              핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 분석하고 메타광고 집행까지 관리하는 SNS 마케팅
              도구입니다.
            </p>
            {/* 지원 채널 미니 스트립 — 실제 브랜드 글리프 (PART 7.5) */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-fg-sub">
              <span className="inline-flex items-center gap-1.5">
                <InstagramGlyph className="size-3.5 text-ig" />
                Instagram
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TiktokGlyph className="size-3.5 text-fg" />
                TikTok
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ThreadsGlyph className="size-3.5 text-fg" />
                Threads
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MetaGlyph className="size-3.5 text-meta" />
                Meta 광고
              </span>
            </div>
          </div>
          {/* 기능 페이지 내부 링크 — 브랜드 검색 사이트링크 후보는 이런 명확한 앵커텍스트에서 나온다 (PART 13.2) */}
          <div>
            <h3 className="text-[13px] font-bold text-fg-sub">기능</h3>
            <ul className="mt-2 space-y-0.5 text-[14px] text-fg-sub">
              <li>
                <Link href="/profile-link" className={footLink}>
                  프로필 링크
                </Link>
              </li>
              <li>
                <Link href="/instagram" className={footLink}>
                  인스타그램 분석
                </Link>
              </li>
              <li>
                <Link href="/instagram/auto-dm" className={footLink}>
                  인스타 자동디엠
                </Link>
              </li>
              <li>
                <Link href="/instagram/visitor-check" className={footLink}>
                  인스타 방문자 분석
                </Link>
              </li>
              <li>
                <Link href="/tiktok" className={footLink}>
                  틱톡 분석
                </Link>
              </li>
              <li>
                <Link href="/threads" className={footLink}>
                  쓰레드 분석
                </Link>
              </li>
              {/* /reference 는 사이트맵에 있는데 내부 링크가 한 곳도 없었다 — 수집기가 닿는 길이 없다 */}
              <li>
                <Link href="/reference" className={footLink}>
                  레퍼런스 수집
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-fg-sub">제품</h3>
            <ul className="mt-2 space-y-0.5 text-[14px] text-fg-sub">
              <li>
                <Link href="/#features" className={footLink}>
                  기능 소개
                </Link>
              </li>
              <li>
                <Link href="/pricing" className={footLink}>
                  요금제
                </Link>
              </li>
              <li>
                <Link href="/signup" className={footLink}>
                  무료로 시작하기
                </Link>
              </li>
              <li>
                <Link href="/brand" className={footLink}>
                  브랜드 · 로고
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-fg-sub">정책</h3>
            <ul className="mt-2 space-y-0.5 text-[14px] text-fg-sub">
              {/* 초안 게시 — 정식 출시 전 법률 검토 후 확정 (PART 12) */}
              <li>
                <Link href="/terms" className={footLink}>
                  이용약관
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={footLink}>
                  개인정보처리방침
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line py-5 text-center text-xs text-fg-sub">
          © 2026 Finch. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
