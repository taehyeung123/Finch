import type { Metadata } from "next";
import Link from "next/link";
import { AuthMarketingPanel } from "@/components/auth/marketing-panel";

/* 로그인·회원가입 전용 스플릿 스크린 레이아웃 — 온보딩(app/(auth))과는 별도 그룹.
   흰 페이지 여백 안에 라운드 코랄 패널(좌) + 폼 컬럼(우), 우측 하단에 정책 링크. */
export const metadata: Metadata = {
  title: "시작하기",
};

export default function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-body">
      <AuthMarketingPanel />
      <div className="relative flex flex-1 items-center justify-center px-4 py-16">
        {children}
        <footer className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3 text-[12px] text-fg-faint">
          <Link href="/terms" className="hover:text-fg-sub">
            이용약관
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:text-fg-sub">
            개인정보처리방침
          </Link>
        </footer>
      </div>
    </div>
  );
}
