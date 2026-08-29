import type { Metadata } from "next";
import Link from "next/link";
import { AuthMarketingPanel } from "@/components/auth/marketing-panel";

/* 로그인·회원가입 전용 스플릿 스크린 레이아웃 — 온보딩(app/(auth))과는 별도 그룹.
   흰 페이지 여백 안에 라운드 코랄 패널(좌) + 폼 컬럼(우), 우측 하단에 정책 링크. */
/* ⚠️ 여기서 title 을 문자열로 다시 정의하면 부모((finch)/layout)의
   `%s | 핀치 (Finch)` 템플릿 체인이 끊긴다 — 로그인·가입 제목에서 브랜드가
   통째로 빠진 채 검색에 나가던 원인(2026-08-29 실측). 템플릿을 이어서 선언한다. */
export const metadata: Metadata = {
  title: { template: "%s | 핀치 (Finch)", default: "시작하기 | 핀치 (Finch)" },
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
