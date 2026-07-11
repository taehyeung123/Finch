import type { Metadata } from "next";
import Link from "next/link";
import { FinchLogo } from "@/components/logo";

/* 로그인 페이지는 최소 SEO — robots noindex 없이 기본 title만 (PRD 13.1) */
export const metadata: Metadata = {
  title: "시작하기",
};

/** (auth) 그룹 공통 레이아웃 — 로그인·회원가입·온보딩 (PRD PART 5) */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <Link
        href="/"
        aria-label="핀치 홈으로 이동"
        className="rounded-card focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      >
        <FinchLogo />
      </Link>
      {/* 페이지별로 max-w-md 등 자체 폭 조정 — 온보딩은 넓게 사용 */}
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
