import Link from "next/link";
import { FinchLogo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

/* 공개 마케팅 영역 — SEO/GEO 최우선 적용 (PART 13.1) */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Nav (PART 6.1-1) */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
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
            <ButtonLink href="/login" variant="ghost" size="sm" className="text-[14px]">
              로그인
            </ButtonLink>
            <ButtonLink href="/signup" size="sm">
              무료로 시작하기
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer (PART 6.1-11) */}
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4 md:px-6">
          <div className="md:col-span-2">
            <FinchLogo />
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-fg-sub">
              핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 분석하고 메타광고 집행까지 관리하는 SNS 마케팅
              도구입니다.
            </p>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-fg-faint">제품</h3>
            <ul className="mt-3 space-y-2 text-[14px] text-fg-sub">
              <li>
                <Link href="/#features" className="hover:text-fg">
                  기능 소개
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-fg">
                  요금제
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-fg">
                  무료로 시작하기
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-fg-faint">정책</h3>
            <ul className="mt-3 space-y-2 text-[14px] text-fg-sub">
              {/* TODO: 정식 출시 전 법률 자문 후 실제 문서 연결 (PART 12) */}
              <li>
                <span className="cursor-not-allowed text-fg-faint">이용약관 (준비 중)</span>
              </li>
              <li>
                <span className="cursor-not-allowed text-fg-faint">개인정보처리방침 (준비 중)</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line py-5 text-center text-xs text-fg-faint">
          © 2026 Finch. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
